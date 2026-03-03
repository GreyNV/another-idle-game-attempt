const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { AuthoringFacade } = require('../engine');

function loadFixture(name) {
  const fixturePath = path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function run() {
  const facade = new AuthoringFacade();

  const validDefinition = loadFixture('valid-definition.json');
  const validResult = facade.validate(validDefinition);
  assert.strictEqual(validResult.ok, true);
  assert.deepStrictEqual(validResult.diagnostics, []);

  const invalidDefinition = loadFixture('invalid-schema-version.json');
  const invalidResult = facade.validate(invalidDefinition);
  assert.strictEqual(invalidResult.ok, false);
  assert.strictEqual(invalidResult.diagnostics.length > 0, true);
  assert.strictEqual(invalidResult.diagnostics[0].code, 'SCHEMA_VERSION_MAJOR_MISMATCH');
  assert.strictEqual(/^\//.test(invalidResult.diagnostics[0].path), true);


  const compileResult = facade.compile(validDefinition);
  assert.strictEqual(compileResult.ok, true);
  assert.strictEqual(compileResult.errors.length, 0);
  assert.ok(compileResult.compiledGame.progress.resources.byId.xp);

  const compileErrorResult = facade.compile(loadFixture('invalid-target-reference.json'));
  assert.strictEqual(compileErrorResult.ok, false);
  assert.strictEqual(compileErrorResult.errors.some((entry) => entry.code === 'REF_ELEMENT_MISSING'), true);

  const scenario = {
    ticks: 2,
    dt: 100,
    seed: 42,
    intentsByTick: [[], []],
  };

  const firstSimulation = facade.simulate(validDefinition, scenario);
  const secondSimulation = facade.simulate(validDefinition, scenario);

  assert.strictEqual(firstSimulation.ok, true);
  assert.strictEqual(secondSimulation.ok, true);
  assert.strictEqual(
    firstSimulation.simulation.report.hash.value,
    secondSimulation.simulation.report.hash.value
  );

  const routineDefinition = loadFixture('valid-routine-schema-1.2.0.json');
  const accurateScenario = {
    ticks: 50,
    dt: 100,
    seed: 7,
    horizonSec: 5,
    dtPolicy: 'accurate',
    intentsByTick: [[{ type: 'ROUTINE_START', payload: { layerId: 'idle', routineId: 'woodcut-routine', poolId: 'workerSlots' } }]],
    snapshotIntervalSec: 1,
  };
  const fastScenario = {
    ...accurateScenario,
    dtPolicy: 'fast',
  };

  const accurateRun = facade.simulate(routineDefinition, accurateScenario);
  const fastRun = facade.simulate(routineDefinition, fastScenario);

  assert.strictEqual(accurateRun.ok, true);
  assert.strictEqual(fastRun.ok, true);
  assert.deepStrictEqual(
    accurateRun.simulation.finalSnapshot.canonical.resources,
    fastRun.simulation.finalSnapshot.canonical.resources
  );
  assert.deepStrictEqual(
    accurateRun.simulation.report.resourceKpis,
    fastRun.simulation.report.resourceKpis
  );

  const accurateRoutineCompletions = accurateRun.simulation.recording.events.filter((entry) => entry.kind === 'routine_completion');
  const fastRoutineCompletions = fastRun.simulation.recording.events.filter((entry) => entry.kind === 'routine_completion');

  assert.strictEqual(accurateRoutineCompletions.length, 4);
  assert.deepStrictEqual(accurateRoutineCompletions, fastRoutineCompletions);

  console.log('authoring-facade tests passed');
}

run();
