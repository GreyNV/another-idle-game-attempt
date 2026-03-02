const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { GameEngine, ENGINE_PHASE_SEQUENCE } = require('../engine/core/GameEngine');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8')
  );
}

function runPhaseOrderAndLayerOrderCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const phaseTrace = [];

  const engine = new GameEngine({
    timeSystem: {
      getDeltaTime() {
        phaseTrace.push('time-system');
        return 16;
      },
    },
    onLayerUpdate(layer, context) {
      phaseTrace.push(`layer:${context.phase}:${layer.id}`);
    },
    onUnlockEvaluation(context) {
      phaseTrace.push(`unlock:${context.phase}`);
    },
    onRenderCompose(context) {
      phaseTrace.push(`render:${context.phase}`);
      return { root: 'ui' };
    },
  });

  engine.initialize(validDefinition);
  const summary = engine.tick();

  assert.strictEqual(summary.dt, 16);
  assert.deepStrictEqual(summary.updatedLayers, ['idle']);
  assert.deepStrictEqual(summary.ui, { root: 'ui' });

  assert.deepStrictEqual(
    phaseTrace,
    ['time-system', 'layer:layer-update:idle', 'unlock:unlock-evaluation', 'render:render'],
    'hooks should run in deterministic phase order'
  );
  assert.deepStrictEqual(ENGINE_PHASE_SEQUENCE, [
    'input',
    'time',
    'layer-update',
    'event-dispatch',
    'unlock-evaluation',
    'render',
  ]);
}

function runUnlockEvaluatorDefaultCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const evaluatePhases = [];
  const unlockEvaluator = {
    evaluateAll(options) {
      evaluatePhases.push(options.phase);
      return {
        unlockedRefs: ['layer:idle'],
        unlocked: { 'layer:idle': true },
        transitions: ['layer:idle'],
      };
    },
  };

  const engine = new GameEngine({
    devModeStrict: false,
    unlockEvaluator,
    timeSystem: { getDeltaTime: () => 1 },
  });

  engine.initialize(validDefinition);
  const summary = engine.tick();

  assert.deepStrictEqual(evaluatePhases, ['end-of-tick'], 'tick should evaluate unlock transitions during unlock phase');
  assert.deepStrictEqual(summary.unlocks.transitions, ['layer:idle']);
  assert.deepStrictEqual(engine.stateStore.get('derived.unlocks').transitions, ['layer:idle']);
}


function runRenderComposerBackwardCompatibilityCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const captured = {
    unlockState: null,
    isUnlockedType: null,
    getUnlockStatusType: null,
    idleUnlocked: null,
    idleStatus: null,
  };

  const uiComposer = {
    compose(_definition, options) {
      captured.unlockState = options.unlockState;
      captured.isUnlockedType = typeof options.isUnlocked;
      captured.getUnlockStatusType = typeof options.getUnlockStatus;
      captured.idleUnlocked = options.isUnlocked('layer:idle');
      captured.idleStatus = options.getUnlockStatus('layer:idle');
      return { layers: [] };
    },
  };

  const unlockEvaluator = {
    evaluateAll() {
      return {
        unlockedRefs: ['layer:idle'],
        unlocked: { 'layer:idle': true },
        statusByRef: {
          'layer:idle': {
            unlocked: true,
            progress: 1,
            showPlaceholder: false,
          },
        },
        transitions: [],
      };
    },
  };

  const engine = new GameEngine({
    devModeStrict: false,
    uiComposer,
    unlockEvaluator,
    timeSystem: { getDeltaTime: () => 1 },
  });

  engine.initialize(validDefinition);
  const summary = engine.tick();

  assert.deepStrictEqual(summary.ui, { layers: [] });
  assert.ok(captured.unlockState, 'default render path should pass unlockState to injected composer');
  assert.strictEqual(captured.isUnlockedType, 'function', 'default render path should pass isUnlocked callback for compatibility');
  assert.strictEqual(
    captured.getUnlockStatusType,
    'function',
    'default render path should pass getUnlockStatus callback backed by unlock evaluator output'
  );
  assert.strictEqual(captured.idleUnlocked, true, 'isUnlocked callback should resolve unlock status from the same unlock pass');
  assert.deepStrictEqual(captured.idleStatus, {
    unlocked: true,
    progress: 1,
    showPlaceholder: false,
  });
}

function runSameTickDispatchCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const delivered = [];

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 1 },
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'LAYER_RESET_REQUESTED', payload: { layerId: 'idle' } });
    },
  });

  engine.initialize(validDefinition);
  engine.eventBus.subscribe('LAYER_RESET_REQUESTED', (event) => {
    delivered.push(event.type);
    engine.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: event.payload.layerId } });
  });
  engine.eventBus.subscribe('LAYER_RESET_EXECUTED', (event) => {
    delivered.push(event.type);
  });

  const tickOne = engine.tick();
  assert.strictEqual(
    tickOne.dispatchedHandlers,
    6,
    'first tick dispatches runtime + layer handlers, then drains executed events in same tick'
  );
  assert.deepStrictEqual(
    tickOne.dispatch,
    {
      cyclesProcessed: 2,
      eventsProcessed: 3,
      deliveredHandlers: 6,
      deferredEvents: 0,
      deferredDueToCycleLimit: false,
    },
    'first tick dispatch metadata should report two cycles (requested -> executed)'
  );
  assert.deepStrictEqual(
    delivered,
    ['LAYER_RESET_REQUESTED', 'LAYER_RESET_EXECUTED', 'LAYER_RESET_EXECUTED'],
    'same-tick dispatch should include events published by handlers'
  );

  const tickTwo = engine.tick();
  assert.strictEqual(
    tickTwo.dispatchedHandlers,
    11,
    'second tick also dispatches UNLOCKED events queued during prior unlock-evaluation phase'
  );
  assert.deepStrictEqual(delivered, [
    'LAYER_RESET_REQUESTED',
    'LAYER_RESET_EXECUTED',
    'LAYER_RESET_EXECUTED',
    'LAYER_RESET_REQUESTED',
    'LAYER_RESET_EXECUTED',
    'LAYER_RESET_EXECUTED',
  ]);
}

function runQueueOnlyFifoAndSnapshotCase() {
  const busModulePath = path.join(__dirname, '..', 'engine', 'systems', 'event-bus', 'EventBus');
  const { EventBus } = require(busModulePath);
  const bus = new EventBus({ strictValidation: false });

  const trace = [];
  bus.subscribe('PING', (event) => {
    trace.push(`a:${event.payload.id}`);

    if (event.payload.id === 1) {
      bus.subscribe('PING', (lateEvent) => {
        trace.push(`late:${lateEvent.payload.id}`);
      });
      bus.publish({ type: 'PING', payload: { id: 3 } });
    }
  });
  bus.subscribe('PING', (event) => {
    trace.push(`b:${event.payload.id}`);
  });

  bus.publish({ type: 'PING', payload: { id: 1 } });
  bus.publish({ type: 'PING', payload: { id: 2 } });
  assert.deepStrictEqual(trace, [], 'publish must be queue-only and never dispatch synchronously');

  const deliveredHandlers = bus.dispatchQueued();
  assert.strictEqual(deliveredHandlers, 7, 'handlers should be called across multiple FIFO dispatch cycles');
  assert.deepStrictEqual(trace, ['a:1', 'b:1', 'a:2', 'b:2', 'a:3', 'b:3', 'late:3']);
  assert.deepStrictEqual(
    bus.getLastDispatchReport(),
    {
      cyclesProcessed: 2,
      eventsProcessed: 3,
      deliveredHandlers: 7,
      deferredEvents: 0,
      deferredDueToCycleLimit: false,
    },
    'snapshot semantics should exclude late subscriber from current cycle and include it next cycle'
  );
}

function runDispatchCycleDeferralGuardrailCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const delivered = [];

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 1 },
    maxDispatchCyclesPerTick: 1,
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'LAYER_RESET_REQUESTED', payload: { layerId: 'idle' } });
    },
  });

  engine.initialize(validDefinition);
  engine.eventBus.subscribe('LAYER_RESET_REQUESTED', (event) => {
    delivered.push(event.type);
    engine.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: event.payload.layerId } });
  });
  engine.eventBus.subscribe('LAYER_RESET_EXECUTED', (event) => {
    delivered.push(event.type);
  });

  const tickOne = engine.tick();
  assert.ok(tickOne.dispatch.deferredEvents >= 1, 'guardrail should defer same-phase cascades after cycle limit');
  assert.strictEqual(tickOne.dispatch.deferredDueToCycleLimit, true);
  assert.deepStrictEqual(delivered, ['LAYER_RESET_REQUESTED']);

  const tickTwo = engine.tick();
  assert.strictEqual(tickTwo.dispatch.cyclesProcessed, 1);
  assert.ok(tickTwo.dispatch.eventsProcessed >= 1, 'next tick should resume deferred queue processing deterministically');
  assert.deepStrictEqual(delivered, ['LAYER_RESET_REQUESTED', 'LAYER_RESET_EXECUTED', 'LAYER_RESET_EXECUTED', 'LAYER_RESET_REQUESTED']);
}

function runDeterministicReplayCase() {
  const replayDefinition = {
    meta: { schemaVersion: '1.2.0', gameId: 'deterministic-replay' },
    systems: { tickMs: 1000 },
    state: {
      resources: { wood: 0, xp: 0, energy: 4 },
      layers: {
        idle: {
          routinePools: {
            workers: { total: 1, used: 0, activeRoutineId: null },
            training: { total: 1, used: 0, activeRoutineId: null },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        unlock: { always: true },
        routineSystem: {
          slotPools: {
            workers: {
              totalPath: 'layers.idle.routinePools.workers.total',
              usedPath: 'layers.idle.routinePools.workers.used',
              activeRoutineIdPath: 'layers.idle.routinePools.workers.activeRoutineId',
            },
            training: {
              totalPath: 'layers.idle.routinePools.training.total',
              usedPath: 'layers.idle.routinePools.training.used',
              activeRoutineIdPath: 'layers.idle.routinePools.training.activeRoutineId',
            },
          },
        },
        sublayers: [
          {
            id: 'main',
            type: 'progress',
            unlock: { always: true },
            sections: [
              {
                id: 'jobs',
                unlock: { always: true },
                elements: [
                  {
                    id: 'woodcut',
                    type: 'routine',
                    mode: 'manual',
                    slot: { poolId: 'workers', cost: 1 },
                    produces: [{ path: 'resources.wood', perSecond: 2 }],
                    consumes: [{ path: 'resources.energy', perSecond: 1 }],
                  },
                  {
                    id: 'sparring',
                    type: 'routine',
                    mode: 'manual',
                    slot: { poolId: 'training', cost: 1 },
                    produces: [{ path: 'resources.xp', perSecond: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  function runReplay() {
    const engine = new GameEngine({ devModeStrict: false, timeSystem: { getDeltaTime: () => 1000 } });
    engine.initialize(replayDefinition);

    const intentTimeline = [
      [{ type: 'ROUTINE_START', payload: { layerId: 'idle', routineId: 'woodcut' } }],
      [{ type: 'ROUTINE_START', payload: { layerId: 'idle', routineId: 'sparring' } }],
      [{ type: 'ROUTINE_TOGGLE', payload: { layerId: 'idle', routineId: 'woodcut' } }],
      [{ type: 'ROUTINE_START', payload: { layerId: 'idle', routineId: 'woodcut' } }],
      [{ type: 'ROUTINE_STOP', payload: { layerId: 'idle', routineId: 'sparring' } }],
    ];

    for (const intents of intentTimeline) {
      for (const intent of intents) {
        engine.enqueueIntent(intent);
      }
      engine.tick();
    }

    return engine.stateStore.snapshot();
  }

  const runA = runReplay();
  const runB = runReplay();
  assert.deepStrictEqual(runA, runB, 'same deterministic intent timeline must produce the same final state snapshot');
}

function runRuntimeLockIntegrationCase() {
  const definition = {
    meta: { schemaVersion: '1.2.0', gameId: 'runtime-lock-integration' },
    systems: { tickMs: 1000 },
    state: {
      resources: { xp: 0 },
      layers: {
        idle: {
          routines: {
            unlockable: { active: false },
          },
          routinePools: {
            jobs: { total: 1, used: 0, activeRoutineId: null },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        unlock: { always: true },
        routineSystem: {
          slotPools: {
            jobs: {
              totalPath: 'layers.idle.routinePools.jobs.total',
              usedPath: 'layers.idle.routinePools.jobs.used',
              activeRoutineIdPath: 'layers.idle.routinePools.jobs.activeRoutineId',
            },
          },
        },
        sublayers: [
          {
            id: 'main',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'unlockable',
                    type: 'routine',
                    mode: 'manual',
                    unlock: { resourceGte: { path: 'resources.xp', value: 1 } },
                    slot: { poolId: 'jobs' },
                    produces: [{ path: 'resources.xp', perSecond: 0 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const targetRef = 'layer:idle/sublayer:main/section:jobs/element:unlockable';
  const engine = new GameEngine({ devModeStrict: true, timeSystem: { getDeltaTime: () => 1000 } });
  engine.initialize(definition);

  engine.enqueueIntent({
    type: 'ROUTINE_START',
    payload: {
      targetRef,
      layerId: 'idle',
      routineId: 'unlockable',
      poolId: 'jobs',
    },
  });

  const lockedTick = engine.tick();
  assert.strictEqual(lockedTick.intentsRouted[0].ok, false);
  assert.strictEqual(lockedTick.intentsRouted[0].code, 'INTENT_TARGET_LOCKED');

  engine.stateStore.set('resources.xp', 1);
  engine.tick();

  engine.enqueueIntent({
    type: 'ROUTINE_START',
    payload: {
      targetRef,
      layerId: 'idle',
      routineId: 'unlockable',
      poolId: 'jobs',
    },
  });

  const unlockedTick = engine.tick();
  assert.strictEqual(unlockedTick.intentsRouted[0].ok, true);
  assert.strictEqual(unlockedTick.intentsRouted[0].code, 'INTENT_ROUTED');
}

function runGuardrailCases() {
  const validDefinition = loadFixture('valid-definition.json');

  const engine = new GameEngine({
    timeSystem: { getDeltaTime: () => -1 },
  });
  engine.initialize(validDefinition);

  assert.throws(() => engine.tick(), /non-negative number/);

  const loopEngine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 1 },
    maxEventsPerTick: 3,
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: 'idle' } });
    },
  });

  loopEngine.initialize(validDefinition);
  loopEngine.eventBus.subscribe('LAYER_RESET_EXECUTED', () => {
    loopEngine.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: 'idle' } });
  });

  assert.throws(() => loopEngine.tick(), /maxEventsPerTick/);
}

function run() {
  runPhaseOrderAndLayerOrderCase();
  runUnlockEvaluatorDefaultCase();
  runRenderComposerBackwardCompatibilityCase();
  runSameTickDispatchCase();
  runGuardrailCases();
  runQueueOnlyFifoAndSnapshotCase();
  runDispatchCycleDeferralGuardrailCase();
  runDeterministicReplayCase();
  runRuntimeLockIntegrationCase();
  console.log('game-engine-phase-loop tests passed');
}

run();
