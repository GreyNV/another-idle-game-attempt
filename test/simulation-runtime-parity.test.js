const assert = require('assert');

const { AuthoringFacade } = require('../engine/authoring/AuthoringFacade');
const { compileGameDefinition } = require('../engine/authoring/compile/compileGameDefinition');
const { SimulationRunner } = require('../engine/authoring/simulation/SimulationRunner');
const { GameEngine } = require('../engine/core/GameEngine');

const STRICT_FLOAT_TOLERANCE = 0;

function toJsonSafe(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function createParityDefinition() {
  return {
    meta: {
      schemaVersion: '1.2.0',
      gameId: 'parity-test-game',
    },
    systems: {
      tickMs: 100,
    },
    state: {
      resources: {
        gold: 100,
        xp: 0,
      },
      layers: {
        idle: {
          purchases: {
            count: 0,
          },
          routinePools: {
            workerSlots: {
              total: 1,
              used: 0,
              activeRoutineId: null,
            },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        modifiers: [
          {
            id: 'parity-noop-modifier',
            targetRef: 'layer:idle',
            key: 'gain.xp',
            op: 'mul',
            value: 1,
          },
        ],
        routineSystem: {
          slotPools: {
            workerSlots: {
              totalPath: 'layers.idle.routinePools.workerSlots.total',
              usedPath: 'layers.idle.routinePools.workerSlots.used',
              activeRoutineIdPath: 'layers.idle.routinePools.workerSlots.activeRoutineId',
              singleActivePerPool: true,
            },
          },
        },
        sublayers: [
          {
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'woodcut-routine',
                    type: 'routine',
                    unlock: {
                      always: true,
                    },
                    slot: {
                      poolId: 'workerSlots',
                      cost: 1,
                    },
                    mode: 'manual',
                    produces: [
                      {
                        path: 'resources.xp',
                        perSecond: 1,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildIntentsByTick(totalTicks, scheduleByTick) {
  const intentsByTick = Array.from({ length: totalTicks }, () => []);
  for (const [tick, intents] of scheduleByTick) {
    intentsByTick[tick] = intents;
  }
  return intentsByTick;
}

function registerPurchaseIntent(engine) {
  engine.intentRouter.register('START_JOB', (intent) => {
    const payload = intent.payload || {};
    const cost = Number.isFinite(payload.cost) ? payload.cost : 0;
    const currentGold = engine.stateStore.get('resources.gold') || 0;

    if (currentGold < cost) {
      return { code: 'PURCHASE_SKIPPED_INSUFFICIENT_FUNDS' };
    }

    const purchaseCount = engine.stateStore.get('layers.idle.purchases.count') || 0;
    engine.stateStore.set('resources.gold', currentGold - cost);
    engine.stateStore.set('layers.idle.purchases.count', purchaseCount + 1);

    return {
      code: 'PURCHASE_APPLIED',
      spent: cost,
      remainingGold: currentGold - cost,
    };
  });
}

function runRuntimeLoop({ definition, scenario }) {
  const dt = scenario.dt;
  const ticks = scenario.ticks;
  const snapshotIntervalSec = scenario.snapshotIntervalSec;
  const intentsByTick = scenario.intentsByTick;
  let nowMs = scenario.seed;

  const engine = new GameEngine({
    tickRate: 1000 / dt,
    now: () => nowMs,
  });
  engine.initialize(definition);
  scenario.configureEngine(engine);

  const checkpoints = [{ tick: -1, snapshot: toJsonSafe(engine.stateStore.snapshot()) }];
  let elapsedSec = 0;
  let nextSnapshotAtSec = snapshotIntervalSec;

  for (let tick = 0; tick < ticks; tick += 1) {
    const intents = Array.isArray(intentsByTick[tick]) ? intentsByTick[tick] : [];
    for (const intent of intents) {
      engine.enqueueIntent(intent);
    }

    engine.tick();
    nowMs += dt;
    elapsedSec += dt / 1000;

    if (elapsedSec + 1e-9 >= nextSnapshotAtSec || tick === ticks - 1) {
      checkpoints.push({ tick, snapshot: toJsonSafe(engine.stateStore.snapshot()) });
      while (nextSnapshotAtSec <= elapsedSec + 1e-9) {
        nextSnapshotAtSec += snapshotIntervalSec;
      }
    }
  }

  const finalSnapshot = toJsonSafe(engine.stateStore.snapshot());
  engine.destroy();

  return { checkpoints, finalSnapshot };
}

function compareCheckpoints({ name, left, right }) {
  const facade = new AuthoringFacade();
  assert.strictEqual(left.length, right.length, `${name}: checkpoint count mismatch ${left.length} !== ${right.length}`);

  const diagnostics = [];

  for (let index = 0; index < left.length; index += 1) {
    const leftCheckpoint = left[index];
    const rightCheckpoint = right[index];

    assert.strictEqual(leftCheckpoint.tick, rightCheckpoint.tick, `${name}: checkpoint tick mismatch at index ${index}`);

    const diff = facade.diffSnapshots(leftCheckpoint.snapshot, rightCheckpoint.snapshot, { maxChanges: 200 });
    if (!diff.equal) {
      for (const change of diff.changes) {
        const before = change.before === undefined ? '<missing>' : JSON.stringify(change.before);
        const after = change.after === undefined ? '<missing>' : JSON.stringify(change.after);
        diagnostics.push(`tick=${leftCheckpoint.tick} path=${change.path} before=${before} after=${after}`);
      }
    }
  }

  assert.strictEqual(
    diagnostics.length,
    0,
    `${name}: canonical snapshot parity mismatch\n${diagnostics.slice(0, 40).join('\n')}`
  );
}

function runScenario({ name, definition, scenario }) {
  const compileResult = compileGameDefinition(definition);
  assert.strictEqual(compileResult.errors.length, 0, `${name}: compile failed ${JSON.stringify(compileResult.errors)}`);

  const simulationRunner = new SimulationRunner();
  const simulation = simulationRunner.run({
    definition,
    compiledDefinition: compileResult.compiledGame,
    scenario,
  });

  const runtime = runRuntimeLoop({ definition, scenario });

  const simulationCheckpoints = simulation.recording.snapshots
    .filter((entry) => entry.tick >= 0)
    .map((entry) => ({
      tick: entry.tick,
      snapshot: simulation.timeline.find((frame) => frame.tick === entry.tick)?.snapshot || simulation.finalSnapshot,
    }));
  const runtimeCheckpoints = runtime.checkpoints.filter((entry) => entry.tick >= 0);

  compareCheckpoints({
    name,
    left: simulationCheckpoints,
    right: runtimeCheckpoints,
  });

  const facade = new AuthoringFacade();
  const finalDiff = facade.diffSnapshots(simulation.finalSnapshot, runtime.finalSnapshot, { maxChanges: 200 });
  assert.strictEqual(finalDiff.equal, true, `${name}: final snapshot mismatch ${JSON.stringify(finalDiff.changes.slice(0, 10))}`);

  if (STRICT_FLOAT_TOLERANCE === 0) {
    assert.deepStrictEqual(
      simulation.finalSnapshot,
      runtime.finalSnapshot,
      `${name}: strict equality policy failed (float tolerance is disabled)`
    );
  }
}

function run() {
  const definition = createParityDefinition();
  const dt = 100;
  const ticks600s = 6000;

  runScenario({
    name: 'no-inputs-600s',
    definition,
    scenario: {
      dt,
      ticks: ticks600s,
      seed: 123,
      snapshotIntervalSec: 30,
      intentsByTick: Array.from({ length: ticks600s }, () => []),
      configureEngine: registerPurchaseIntent,
    },
  });

  const scriptedIntents = buildIntentsByTick(ticks600s, [
    [10, [{ type: 'START_JOB', payload: { targetRef: 'layer:idle', jobId: 'buy-1', cost: 5 } }]],
    [200, [{ type: 'START_JOB', payload: { targetRef: 'layer:idle', jobId: 'buy-2', cost: 7 } }]],
    [1200, [{ type: 'START_JOB', payload: { targetRef: 'layer:idle', jobId: 'buy-3', cost: 11 } }]],
    [2800, [{ type: 'START_JOB', payload: { targetRef: 'layer:idle', jobId: 'buy-4', cost: 13 } }]],
    [4500, [{ type: 'START_JOB', payload: { targetRef: 'layer:idle', jobId: 'buy-5', cost: 17 } }]],
  ]);

  runScenario({
    name: 'scripted-purchases-deterministic',
    definition,
    scenario: {
      dt,
      ticks: ticks600s,
      seed: 456,
      snapshotIntervalSec: 30,
      intentsByTick: scriptedIntents,
      configureEngine: registerPurchaseIntent,
    },
  });

  console.log('simulation-runtime parity tests passed');
}

run();
