const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  GameEngine,
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
} = require('../engine');

function loadFixtureRaw(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8');
}


function findNode(uiTree, predicate) {
  for (const layer of uiTree.layers || []) {
    if (predicate(layer)) {
      return layer;
    }

    for (const sublayer of layer.sublayers || []) {
      if (predicate(sublayer)) {
        return sublayer;
      }

      for (const section of sublayer.sections || []) {
        if (predicate(section)) {
          return section;
        }

        for (const element of section.elements || []) {
          if (predicate(element)) {
            return element;
          }
        }
      }
    }
  }

  return null;
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

  engine.stateStore.set('resources.xp', 0);
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

  assert.strictEqual(summary.unlocks.unlocked[xpGatedRef], false, 'unlock evaluation should keep xp-gated node locked below threshold');
  assert.strictEqual(summary.unlocks.unlocked[betaLayerRef], false, 'unlock evaluation should keep beta layer locked');
  assert.strictEqual(summary.unlocks.statusByRef[betaLayerRef].showPlaceholder, false, 'zero-progress locked layers should not render placeholders');

  const uiNodeRefs = collectNodeRefs(summary.ui);
  assert.strictEqual(uiNodeRefs.includes(xpGatedRef), false, 'UI tree should omit xp-gated nodeRef when progress is zero');
  assert.strictEqual(uiNodeRefs.includes(betaLayerRef), false, 'UI tree should exclude locked beta layer nodeRef when progress is zero');

  engine.stateStore.set('resources.xp', 0.5);
  const partialSummary = engine.tick();
  assert.strictEqual(partialSummary.unlocks.statusByRef[xpGatedRef].unlocked, false, 'xp-gated node should remain locked below threshold');
  assert(partialSummary.unlocks.statusByRef[xpGatedRef].progress > 0, 'locked node should report partial progress below threshold');
  assert.strictEqual(partialSummary.unlocks.statusByRef[xpGatedRef].showPlaceholder, true, 'locked node with partial progress should show placeholder');

  const xpPlaceholderNode = findNode(
    partialSummary.ui,
    (node) => node.nodeRef === xpGatedRef
  );
  assert.ok(xpPlaceholderNode, 'UI should render placeholder for locked node with partial progress');
  assert.strictEqual(xpPlaceholderNode.placeholder, true, 'placeholder node should be marked placeholder');
  assert.strictEqual(
    xpPlaceholderNode.unlockProgress,
    partialSummary.unlocks.statusByRef[xpGatedRef].progress,
    'placeholder should include unlock progress metadata'
  );

  engine.stateStore.set('resources.xp', 1);
  const unlockedSummary = engine.tick();
  const xpUnlockedNode = findNode(
    unlockedSummary.ui,
    (node) => node.nodeRef === xpGatedRef
  );
  assert.ok(unlockedSummary.unlocks.transitions.includes(xpGatedRef), 'node should transition to unlocked at threshold');
  assert.strictEqual(xpUnlockedNode.placeholder, false, 'node should flip from placeholder to unlocked at threshold');
  assert.strictEqual(xpUnlockedNode.unlockProgress, 1, 'unlocked node should report complete progress metadata');
}

function run() {
  runPrototypePathCase();
  console.log('prototype path integration tests passed');
}

run();
