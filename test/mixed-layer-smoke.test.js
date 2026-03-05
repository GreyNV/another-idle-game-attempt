const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { parseGameDefinition } = require('../engine/validation/parser/parseGameDefinition');
const { compileGameDefinition } = require('../engine/authoring/compile/compileGameDefinition');
const { AuthoringFacade } = require('../engine/authoring/AuthoringFacade');

function loadFixture(name) {
  const fixturePath = path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function run() {
  const definition = loadFixture('valid-mixed-layers.json');

  const parsed = parseGameDefinition(definition);
  assert.strictEqual(Array.isArray(parsed.layers), true);
  assert.deepStrictEqual(
    parsed.layers.map((layer) => layer.type),
    ['progressLayer', 'inventoryLayer', 'statisticsLayer']
  );

  const compileResult = compileGameDefinition(definition);
  assert.strictEqual(compileResult.errors.length, 0);
  assert.ok(compileResult.compiledGame.progress.resources.byId.xp);

  const facade = new AuthoringFacade();
  const simulation = facade.simulate(definition, {
    ticks: 2,
    dt: 100,
    intentsByTick: [[], []],
  });

  assert.strictEqual(simulation.ok, true);
  assert.strictEqual(simulation.simulation.timeline.length >= 1, true);
  assert.deepStrictEqual(
    simulation.simulation.timeline[0].summary.updatedLayers,
    ['idle', 'inventory', 'statistics']
  );
  assert.strictEqual(typeof simulation.simulation.finalSnapshot.canonical.resources.xp, 'number');

  console.log('mixed-layer smoke tests passed');
}

run();
