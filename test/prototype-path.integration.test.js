const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { GameEngine } = require('../engine/core/GameEngine');
const {
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
} = require('../engine/validation');

function loadFixtureRaw(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8');
}

function collectNodeRefs(uiTree) {
  const refs = [];

  for (const layer of uiTree.layers || []) {
    refs.push(layer.nodeRef);

    for (const sublayer of layer.sublayers || []) {
      refs.push(sublayer.nodeRef);

      for (const section of sublayer.sections || []) {
        refs.push(section.nodeRef);

        for (const element of section.elements || []) {
          refs.push(element.nodeRef);
        }
      }
    }
  }

  return refs;
}

function runPrototypePathCase() {
  const rawDefinition = loadFixtureRaw('prototype-path-definition.json');
  const parsedDefinition = parseGameDefinition(rawDefinition);
  const schemaIssues = validateGameDefinitionSchema(parsedDefinition);
  const referenceIssues = validateReferences(parsedDefinition);

  assert.deepStrictEqual(schemaIssues, [], 'fixture should pass schema validation');
  assert.deepStrictEqual(referenceIssues, [], 'fixture should pass reference validation');

  const dispatchTrace = [];

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 16 },
    onLayerUpdate(layer, context) {
      context.eventBus.publish({ type: 'PROTOTYPE_LAYER_UPDATED', payload: { layerId: layer.id } });
    },
  });

  engine.initialize(parsedDefinition);

  engine.eventBus.subscribe('PROTOTYPE_LAYER_UPDATED', (event) => {
    dispatchTrace.push(`primary:${event.payload.layerId}`);
    if (event.payload.layerId === 'alpha') {
      engine.eventBus.subscribe('PROTOTYPE_LAYER_UPDATED', (lateEvent) => {
        dispatchTrace.push(`late:${lateEvent.payload.layerId}`);
      });
    }
  });

  engine.eventBus.subscribe('PROTOTYPE_LAYER_UPDATED', (event) => {
    dispatchTrace.push(`secondary:${event.payload.layerId}`);
  });

  const summary = engine.tick();

  assert.deepStrictEqual(summary.updatedLayers, ['alpha', 'beta'], 'tick should preserve definition layer order');
  assert.strictEqual(summary.dispatchedHandlers, 4, 'event dispatch should use FIFO queue + subscriber snapshot semantics');
  assert.deepStrictEqual(dispatchTrace, [
    'primary:alpha',
    'secondary:alpha',
    'primary:beta',
    'secondary:beta',
  ]);

  const xpGatedRef = 'layer:alpha/sublayer:main/section:actions/element:xp-gated';
  const betaLayerRef = 'layer:beta';

  assert.strictEqual(summary.unlocks.unlocked[xpGatedRef], true, 'unlock evaluation should unlock xp-gated node');
  assert.strictEqual(summary.unlocks.unlocked[betaLayerRef], false, 'unlock evaluation should keep beta layer locked');

  const uiNodeRefs = collectNodeRefs(summary.ui);
  assert.ok(uiNodeRefs.includes(xpGatedRef), 'UI tree should include unlocked xp-gated nodeRef');
  assert.strictEqual(uiNodeRefs.includes(betaLayerRef), false, 'UI tree should exclude locked beta layer nodeRef');
}

function run() {
  runPrototypePathCase();
  console.log('prototype path integration tests passed');
}

run();
