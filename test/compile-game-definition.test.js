const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { compileGameDefinition } = require('../engine/authoring/compile/compileGameDefinition');

function loadFixture(name) {
  const fixturePath = path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function runCompileSuccessCheck() {
  const result = compileGameDefinition(loadFixture('valid-definition.json'));
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(Boolean(result.compiledGame), true);

  assert.deepStrictEqual(Object.keys(result.compiledGame.progress.resources.byId).sort(), ['gold', 'xp']);
  assert.deepStrictEqual(Object.keys(result.compiledGame.progress.upgrades.byId), ['woodcut-upgrade']);
  assert.deepStrictEqual(
    result.compiledGame.lookup.targetToAffected['layer:idle/sublayer:routines/section:jobs/element:woodcut'],
    [
      {
        sourceType: 'upgrade',
        sourceId: 'woodcut-upgrade',
        sourcePath: '/layers/0/sublayers/0/sections/0/elements/1',
      },
    ]
  );
}


function runLegacyModifierMigrationCheck() {
  const definition = loadFixture('valid-definition.json');

  definition.layers[0].sublayers[0].sections[0].elements.push({
    id: 'legacy-buyable',
    type: 'buyable',
    effectTargetResourceId: 'gold',
    effectAmount: 3,
  });

  definition.layers[0].sublayers[0].sections[0].elements.push({
    id: 'legacy-upgrade',
    type: 'upgrade',
    multiplier: 2,
    effect: {
      targetRef: 'layer:idle/sublayer:routines/section:jobs/element:woodcut',
    },
  });

  definition.layers[0].sublayers[0].sections[0].elements.push({
    id: 'ambiguous-upgrade',
    type: 'upgrade',
    multiplier: 3,
  });

  const result = compileGameDefinition(definition);
  const buyableModifiers = result.compiledGame.progress.buyables.byId['legacy-buyable'].modifiers;
  const upgradeModifiers = result.compiledGame.progress.upgrades.byId['legacy-upgrade'].modifiers;

  assert.strictEqual(buyableModifiers.length, 1);
  assert.strictEqual(buyableModifiers[0].op, 'add');
  assert.strictEqual(buyableModifiers[0].key, 'gain.gold');

  assert.strictEqual(upgradeModifiers.length, 1);
  assert.strictEqual(upgradeModifiers[0].op, 'mul');

  assert.strictEqual(
    result.errors.some((entry) => entry.code === 'COMPILE_LEGACY_MODIFIER_AMBIGUOUS' && /ambiguous-upgrade/.test(entry.message)),
    true
  );
}

function runCompileErrorCheck() {
  const definition = loadFixture('valid-definition.json');

  definition.layers[0].sublayers[0].sections[0].elements.push({
    id: 'woodcut-upgrade',
    type: 'upgrade',
    effect: {
      targetRef: 'layer:idle/sublayer:routines/section:jobs/element:missing',
    },
  });

  definition.layers[0].sublayers[0].sections[0].elements.push({
    id: 'lumber-loop',
    type: 'routine',
    produces: [{ path: 'resources.unknown', perSecond: 1 }],
  });

  const result = compileGameDefinition(definition);
  assert.strictEqual(result.errors.length > 0, true);

  assert.strictEqual(
    result.errors.some((entry) => entry.code === 'COMPILE_DUPLICATE_PROGRESS_ENTITY_ID' && /elements\/2\/id$/.test(entry.path)),
    true
  );
  assert.strictEqual(
    result.errors.some((entry) => entry.code === 'COMPILE_TARGET_UNRESOLVED' && /effect\/targetRef$/.test(entry.path)),
    true
  );
  assert.strictEqual(
    result.errors.some((entry) => entry.code === 'COMPILE_RESOURCE_UNRESOLVED' && /produces\/0\/path$/.test(entry.path)),
    true
  );
}

runCompileSuccessCheck();
runCompileErrorCheck();
runLegacyModifierMigrationCheck();

console.log('compile-game-definition tests passed');
