const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { AuthoringFacade } = require('../engine');
const { buildGameDefinitionFromProgressModel } = require('../engine/authoring/compile/buildGameDefinitionFromProgressModel');

function loadSample() {
  const samplePath = path.join(__dirname, '..', 'content', 'examples', 'progress-vertical-slice.json');
  return JSON.parse(fs.readFileSync(samplePath, 'utf8'));
}

function run() {
  const sample = loadSample();
  assert.strictEqual(sample.schemaVersion, 'progress-authoring/1');

  const definition = buildGameDefinitionFromProgressModel(sample);
  const facade = new AuthoringFacade();

  const compileResult = facade.compile(definition);
  assert.strictEqual(compileResult.ok, true, JSON.stringify(compileResult.errors));
  assert.strictEqual(compileResult.errors.length, 0);

  const routineTargetRef = 'layer:idle/sublayer:progression/section:main/element:beg';
  const simulation = facade.simulate(definition, {
    dt: 100,
    ticks: 60,
    snapshotIntervalSec: 2,
    routineCompletionIntervalSec: 2,
    canonicalResources: ['gold', 'xp'],
    intentsByTick: [
      [
        {
          type: 'ROUTINE_START',
          payload: {
            targetRef: routineTargetRef,
            layerId: 'idle',
            routineId: 'beg',
            poolId: 'workerSlots',
          },
        },
      ],
    ],
  });

  assert.strictEqual(simulation.ok, true, JSON.stringify(simulation.diagnostics));
  assert.strictEqual(simulation.simulation.report.tickCount > 0, true);
  assert.strictEqual(simulation.simulation.report.resourceKpis.gold.end > sample.progress.resources.byId.gold.start, true);
  assert.strictEqual(simulation.simulation.report.resourceKpis.xp.end > sample.progress.resources.byId.xp.start, true);
  assert.strictEqual(
    simulation.simulation.recording.events.some((entry) => entry.kind === 'routine_completion' && entry.routineId === 'beg'),
    true
  );

  console.log('progress-vertical-slice integration test passed');
}

run();
