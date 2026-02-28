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
          {
            id: 'gated-sub',
            type: 'progress',
            unlock: {
              resourceGte: {
                path: 'resources.xp',
                value: 2,
              },
            },
            sections: [
              {
                id: 'gated-section',
                unlock: {
                  resourceGte: {
                    path: 'resources.xp',
                    value: 3,
                  },
                },
                elements: [
                  {
                    id: 'gated-element',
                    type: 'upgrade',
                    unlock: {
                      resourceGte: {
                        path: 'resources.xp',
                        value: 4,
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
  const gatedSublayerRef = 'layer:idle/sublayer:gated-sub';
  const gatedSectionRef = 'layer:idle/sublayer:gated-sub/section:gated-section';
  const gatedElementRef = 'layer:idle/sublayer:gated-sub/section:gated-section/element:gated-element';

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
  const tickOneSublayers = tickOne.ui.layers[0].sublayers;
  assert.strictEqual(
    tickOneSublayers.some((sublayer) => sublayer.id === 'gated-sub'),
    false,
    'UI should hide locked sublayer before unlock conditions are met'
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

  engine.stateStore.set('resources.xp', 2);
  const tickThree = engine.tick();
  const tickThreeSublayer = tickThree.ui.layers[0].sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  assert.ok(tickThree.unlocks.transitions.includes(gatedSublayerRef), 'locked sublayer should transition when xp reaches 2');
  assert.ok(tickThreeSublayer, 'UI should include sublayer after sublayer unlock condition is met');
  assert.deepStrictEqual(tickThreeSublayer.sections, [], 'section remains hidden until its own unlock condition is met');

  engine.stateStore.set('resources.xp', 3);
  const tickFour = engine.tick();
  const tickFourSublayer = tickFour.ui.layers[0].sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  assert.ok(tickFour.unlocks.transitions.includes(gatedSectionRef), 'locked section should transition when xp reaches 3');
  assert.strictEqual(tickFourSublayer.sections[0].id, 'gated-section');
  assert.deepStrictEqual(
    tickFourSublayer.sections[0].elements,
    [],
    'element remains hidden until element unlock condition is met'
  );

  engine.stateStore.set('resources.xp', 4);
  const tickFive = engine.tick();
  const tickFiveSublayer = tickFive.ui.layers[0].sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  assert.ok(tickFive.unlocks.transitions.includes(gatedElementRef), 'locked element should transition when xp reaches 4');
  assert.deepStrictEqual(
    tickFiveSublayer.sections[0].elements.map((element) => element.id),
    ['gated-element'],
    'UI should include gated element only after unlock condition is met'
  );

  engine.stateStore.set('resources.xp', 0);
  const tickSix = engine.tick();
  const tickSixSublayer = tickSix.ui.layers[0].sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  assert.ok(tickSixSublayer, 'sublayer unlock should persist one-way when condition drops back below threshold');
  assert.strictEqual(tickSixSublayer.sections[0].id, 'gated-section');
  assert.deepStrictEqual(
    tickSixSublayer.sections[0].elements.map((element) => element.id),
    ['gated-element'],
    'element unlock should persist one-way when condition drops back below threshold'
  );
  const tickSeven = engine.tick();
  assert.ok(tickSeven.dispatchedHandlers >= 1, 'later tick should drain queued UNLOCKED events');
  assert.ok(unlockedEvents.includes(xpGatedRef), 'UNLOCKED event should emit for xp-gated transition');
}


function run() {
  runVerticalSliceCase();
  console.log('engine vertical slice tests passed');
}

run();
