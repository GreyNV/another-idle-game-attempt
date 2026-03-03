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

  console.log('authoring-facade tests passed');
}

run();
