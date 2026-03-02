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
        layerXp: 5,
      },
    },
    layers: [
      {
        id: 'meta',
        type: 'progressLayer',
        unlock: {
          resourceGte: {
            path: 'resources.layerXp',
            value: 10,
          },
        },
        sublayers: [
          {
            id: 'overview',
            type: 'progress',
            sections: [
              {
                id: 'summary',
                elements: [
                  {
                    id: 'layer-metric',
                    type: 'progressBar',
                  },
                ],
              },
            ],
          },
        ],
      },
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

function findLayer(ui, layerId) {
  return (ui.layers || []).find((layer) => layer.id === layerId);
}

function runVerticalSliceCase() {
  const definition = buildMinimalDefinition();
  const dispatchTrace = [];
  const unlockedEvents = [];
  const xpGatedRef = 'layer:idle/sublayer:main/section:jobs/element:xp-gated';
  const gatedSublayerRef = 'layer:idle/sublayer:gated-sub';
  const gatedSectionRef = 'layer:idle/sublayer:gated-sub/section:gated-section';
  const gatedElementRef = 'layer:idle/sublayer:gated-sub/section:gated-section/element:gated-element';
  const gatedLayerRef = 'layer:meta';

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

  assert.strictEqual(tickOne.dispatchedHandlers, 2, 'event queue should dispatch one handler per updated layer event');
  assert.deepStrictEqual(dispatchTrace, ['idle', 'idle'], 'layer update events should be dispatched in the event-dispatch phase');

  assert.strictEqual(
    tickOne.unlocks.transitions.includes(xpGatedRef),
    false,
    'xp-gated element should remain locked at xp=0'
  );
  assert.strictEqual(tickOne.unlocks.statusByRef[gatedLayerRef].showPlaceholder, true);
  assert(tickOne.unlocks.statusByRef[gatedLayerRef].progress > 0);

  const tickOneLayer = tickOne.ui.layers.find((layer) => layer.id === 'meta');
  assert.ok(tickOneLayer, 'UI should render locked layers with partial progress as placeholders');
  assert.strictEqual(tickOneLayer.placeholder, true);
  assert.strictEqual(tickOneLayer.unlockProgress, tickOne.unlocks.statusByRef[gatedLayerRef].progress);
  assert.deepStrictEqual(tickOneLayer.sublayers, [], 'locked layer placeholder should not render child sublayers');

  const tickOneIdleLayer = findLayer(tickOne.ui, 'idle');
  const tickOneElements = tickOneIdleLayer.sublayers[0].sections[0].elements;
  assert.deepStrictEqual(
    tickOneElements.map((element) => element.id),
    ['always-on'],
    'UI should hide xp-gated element while locked'
  );
  const tickOneSublayers = tickOneIdleLayer.sublayers;
  assert.strictEqual(
    tickOneSublayers.some((sublayer) => sublayer.id === 'gated-sub'),
    false,
    'UI should hide locked sublayer before unlock conditions are met'
  );

  engine.stateStore.set('resources.xp', 1);
  const tickTwo = engine.tick();

  assert.ok(tickTwo.unlocks.transitions.includes(xpGatedRef), 'xp-gated element should transition to unlocked at xp=1');
  const tickTwoIdleLayer = findLayer(tickTwo.ui, 'idle');
  const tickTwoElements = tickTwoIdleLayer.sublayers[0].sections[0].elements;
  assert.deepStrictEqual(
    tickTwoElements.map((element) => element.id),
    ['always-on', 'xp-gated'],
    'UI should include xp-gated element after unlock transition'
  );

  engine.stateStore.set('resources.xp', 2);
  const tickThree = engine.tick();
  const tickThreeIdleLayer = findLayer(tickThree.ui, 'idle');
  const tickThreeSublayer = tickThreeIdleLayer.sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  assert.ok(tickThree.unlocks.transitions.includes(gatedSublayerRef), 'locked sublayer should transition when xp reaches 2');
  assert.ok(tickThreeSublayer, 'UI should include sublayer after sublayer unlock condition is met');
  assert.strictEqual(tickThreeSublayer.sections.length, 1, 'section placeholder should render when unlock progress is partial');
  assert.strictEqual(tickThreeSublayer.sections[0].id, 'gated-section');
  assert.strictEqual(tickThreeSublayer.sections[0].placeholder, true);
  assert.strictEqual(
    tickThreeSublayer.sections[0].unlockProgress,
    tickThree.unlocks.statusByRef[gatedSectionRef].progress,
    'section placeholder should include unlock progress metadata'
  );
  assert.deepStrictEqual(tickThreeSublayer.sections[0].elements, [], 'placeholder section should not render child elements until unlocked');

  engine.stateStore.set('resources.xp', 3);
  const tickFour = engine.tick();
  const tickFourIdleLayer = findLayer(tickFour.ui, 'idle');
  const tickFourSublayer = tickFourIdleLayer.sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  assert.ok(tickFour.unlocks.transitions.includes(gatedSectionRef), 'locked section should transition when xp reaches 3');
  assert.strictEqual(tickFourSublayer.sections[0].id, 'gated-section');
  assert.strictEqual(tickFourSublayer.sections[0].placeholder, false);
  assert.strictEqual(tickFourSublayer.sections[0].elements.length, 1, 'element placeholder should render while partially unlocked');
  assert.strictEqual(tickFourSublayer.sections[0].elements[0].id, 'gated-element');
  assert.strictEqual(tickFourSublayer.sections[0].elements[0].placeholder, true);
  assert.strictEqual(
    tickFourSublayer.sections[0].elements[0].unlockProgress,
    tickFour.unlocks.statusByRef[gatedElementRef].progress,
    'element placeholder should include unlock progress metadata'
  );

  engine.stateStore.set('resources.layerXp', 10);
  engine.stateStore.set('resources.xp', 4);
  const tickFive = engine.tick();
  const tickFiveIdleLayer = findLayer(tickFive.ui, 'idle');
  const tickFiveSublayer = tickFiveIdleLayer.sublayers.find((sublayer) => sublayer.id === 'gated-sub');
  const tickFiveLayer = tickFive.ui.layers.find((layer) => layer.id === 'meta');
  assert.ok(tickFive.unlocks.transitions.includes(gatedElementRef), 'locked element should transition when xp reaches 4');
  assert.ok(tickFive.unlocks.transitions.includes(gatedLayerRef), 'locked layer should transition when layerXp reaches 10');
  assert.deepStrictEqual(
    tickFiveSublayer.sections[0].elements.map((element) => element.id),
    ['gated-element'],
    'UI should include gated element only after unlock condition is met'
  );
  assert.strictEqual(tickFiveLayer.placeholder, false, 'layer should flip from placeholder to unlocked at threshold');
  assert.strictEqual(tickFiveLayer.unlockProgress, 1, 'unlocked layer should report complete progress');
  assert.strictEqual(tickFiveLayer.sublayers.length, 1, 'unlocked layer should render child sublayers');

  engine.stateStore.set('resources.xp', 0);
  const tickSix = engine.tick();
  const tickSixIdleLayer = findLayer(tickSix.ui, 'idle');
  const tickSixSublayer = tickSixIdleLayer.sublayers.find((sublayer) => sublayer.id === 'gated-sub');
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
