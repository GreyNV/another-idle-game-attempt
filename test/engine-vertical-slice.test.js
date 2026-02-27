const assert = require('assert');

const { GameEngine } = require('../engine/core/GameEngine');
const { formatNodeRef } = require('../engine/systems/unlocks/nodeRef');
const { parseUnlockCondition, evaluateUnlockTransition } = require('../engine/systems/unlocks/unlockCondition');

function buildMinimalDefinition() {
  return {
    meta: {
      schemaVersion: '1.0',
      gameId: 'vertical-slice-test',
    },
    systems: {
      tickMs: 100,
    },
    state: {
      resources: {
        xp: 0,
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        unlock: { always: true },
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
                    id: 'always-on',
                    type: 'progressBar',
                    unlock: { always: true },
                  },
                  {
                    id: 'xp-gated',
                    type: 'upgrade',
                    unlock: {
                      resourceGte: {
                        path: 'resources.xp',
                        value: 1,
                      },
                    },
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

function collectUnlockTargets(definition) {
  const targets = [];

  definition.layers.forEach((layer) => {
    targets.push({
      ref: formatNodeRef({ layer: layer.id }),
      unlock: layer.unlock || { always: true },
    });

    layer.sublayers.forEach((sublayer) => {
      targets.push({
        ref: formatNodeRef({ layer: layer.id, sublayer: sublayer.id }),
        unlock: sublayer.unlock || { always: true },
      });

      sublayer.sections.forEach((section) => {
        targets.push({
          ref: formatNodeRef({ layer: layer.id, sublayer: sublayer.id, section: section.id }),
          unlock: section.unlock || { always: true },
        });

        section.elements.forEach((element) => {
          targets.push({
            ref: formatNodeRef({ layer: layer.id, sublayer: sublayer.id, section: section.id, element: element.id }),
            unlock: element.unlock || { always: true },
          });
        });
      });
    });
  });

  return targets;
}

function runVerticalSliceCase() {
  const definition = buildMinimalDefinition();
  const unlockTargets = collectUnlockTargets(definition);
  const previousUnlocked = new Map(unlockTargets.map((target) => [target.ref, false]));
  const dispatchTrace = [];

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 16 },
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'VERTICAL_SLICE_LAYER_UPDATED', payload: { layerId: 'idle' } });
    },
    onUnlockEvaluation(context) {
      const state = context.stateStore.snapshot().canonical;
      const unlockedRefs = [];
      const transitions = [];

      unlockTargets.forEach((target) => {
        const parsed = parseUnlockCondition(target.unlock);
        assert.strictEqual(parsed.ok, true, `unlock for ${target.ref} should parse`);

        const result = evaluateUnlockTransition({
          wasUnlocked: previousUnlocked.get(target.ref),
          ast: parsed.value,
          state,
          phase: 'end-of-tick',
        });

        previousUnlocked.set(target.ref, result.unlocked);

        if (result.unlocked) {
          unlockedRefs.push(target.ref);
        }

        if (result.transitioned) {
          transitions.push(target.ref);
        }
      });

      return {
        unlockedRefs,
        transitions,
      };
    },
  });

  engine.initialize(definition);
  engine.eventBus.subscribe('VERTICAL_SLICE_LAYER_UPDATED', (event) => {
    dispatchTrace.push(event.payload.layerId);
  });

  const summary = engine.tick();

  assert.strictEqual(summary.dispatchedHandlers, 1, 'event queue should dispatch exactly one subscribed handler');
  assert.deepStrictEqual(dispatchTrace, ['idle'], 'layer update event should be dispatched in the event-dispatch phase');

  assert.ok(
    summary.unlocks.transitions.includes('layer:idle'),
    'layer should transition from locked->unlocked during unlock evaluation'
  );
  assert.strictEqual(
    summary.unlocks.unlockedRefs.includes('layer:idle/sublayer:main/section:jobs/element:xp-gated'),
    false,
    'xp-gated node should remain locked at xp=0'
  );

  const uiElements = summary.ui.layers[0].sublayers[0].sections[0].elements;
  assert.deepStrictEqual(
    uiElements.map((element) => element.id),
    ['always-on'],
    'UI should include only unlocked nodes'
  );
}

function run() {
  runVerticalSliceCase();
  console.log('engine vertical slice tests passed');
}

run();
