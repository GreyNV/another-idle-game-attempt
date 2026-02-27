const assert = require('assert');

const { GameEngine } = require('../engine/core/GameEngine');

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

function runVerticalSliceCase() {
  const definition = buildMinimalDefinition();
  const dispatchTrace = [];
  const unlockedEvents = [];
  const xpGatedRef = 'layer:idle/sublayer:main/section:jobs/element:xp-gated';

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 16 },
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'VERTICAL_SLICE_LAYER_UPDATED', payload: { layerId: 'idle' } });
    },
  });

  engine.initialize(definition);
  engine.eventBus.subscribe('VERTICAL_SLICE_LAYER_UPDATED', (event) => {
    dispatchTrace.push(event.payload.layerId);
  });
  engine.eventBus.subscribe('UNLOCKED', (event) => {
    unlockedEvents.push(event.payload.targetRef);
  });

  const tickOne = engine.tick();

  assert.strictEqual(tickOne.dispatchedHandlers, 1, 'event queue should dispatch exactly one subscribed handler');
  assert.deepStrictEqual(dispatchTrace, ['idle'], 'layer update event should be dispatched in the event-dispatch phase');

  assert.strictEqual(
    tickOne.unlocks.transitions.includes(xpGatedRef),
    false,
    'xp-gated element should remain locked at xp=0'
  );

  const tickOneElements = tickOne.ui.layers[0].sublayers[0].sections[0].elements;
  assert.deepStrictEqual(
    tickOneElements.map((element) => element.id),
    ['always-on'],
    'UI should hide xp-gated element while locked'
  );

  engine.stateStore.set('resources.xp', 1);
  const tickTwo = engine.tick();

  assert.ok(tickTwo.unlocks.transitions.includes(xpGatedRef), 'xp-gated element should transition to unlocked at xp=1');
  const tickTwoElements = tickTwo.ui.layers[0].sublayers[0].sections[0].elements;
  assert.deepStrictEqual(
    tickTwoElements.map((element) => element.id),
    ['always-on', 'xp-gated'],
    'UI should include xp-gated element after unlock transition'
  );
  const tickThree = engine.tick();
  assert.ok(tickThree.dispatchedHandlers >= 1, 'third tick should drain queued UNLOCKED events');
  assert.ok(unlockedEvents.includes(xpGatedRef), 'UNLOCKED event should emit for xp-gated transition');
}


function run() {
  runVerticalSliceCase();
  console.log('engine vertical slice tests passed');
}

run();
