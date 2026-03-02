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

  const invalidResult = facade.validate('{broken');
  assert.strictEqual(invalidResult.ok, false);
  assert.strictEqual(invalidResult.diagnostics[0].code, 'AUTHORING_JSON_PARSE');

  const sessionResult = facade.createSession(validDefinition);
  assert.strictEqual(sessionResult.ok, true);
  assert.strictEqual(typeof sessionResult.session.id, 'string');

  const simulationResult = facade.simulate(validDefinition, { ticks: 2, intentsByTick: [[], []] });
  assert.strictEqual(simulationResult.ok, true);
  assert.strictEqual(simulationResult.simulation.ticks.length, 2);
  assert.notStrictEqual(simulationResult.simulation.finalSnapshot, null);

  const diffResult = facade.diffSnapshots(
    { canonical: { resources: { gold: 1 } } },
    { canonical: { resources: { gold: 2, gems: 1 } } },
    { maxChanges: 10 }
  );
  assert.strictEqual(diffResult.equal, false);
  assert.strictEqual(diffResult.changes.length >= 1, true);

  console.log('authoring-facade tests passed');
}

run();
