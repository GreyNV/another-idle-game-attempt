const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { LayerRegistry } = require('../engine/plugins/LayerRegistry');
const { registerBuiltinLayers } = require('../engine/plugins/layers/registerBuiltinLayers');
const { GameEngine } = require('../engine/core/GameEngine');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8')
  );
}

function runRegistrationGuardrailCase() {
  const registry = new LayerRegistry();

  assert.throws(() => registry.register('', () => {}), /non-empty string/);
  assert.throws(() => registry.register('progressLayer', null), /factory must be a function/);

  registry.register('progressLayer', ({ definition }) => ({
    id: definition.id,
    type: definition.type,
    init() {},
    update() {},
    onEvent() {},
    getViewModel() {
      return {};
    },
    destroy() {},
  }));

  assert.throws(
    () => registry.register('progressLayer', () => {}),
    /duplicate registration/
  );
}

function runBaseLayerContractCheckCase() {
  const registry = new LayerRegistry();
  registry.register('brokenLayer', ({ definition }) => ({ id: definition.id, type: definition.type }));

  assert.throws(
    () => registry.createLayer({ id: 'broken', type: 'brokenLayer' }, {}),
    /missing BaseLayer method/
  );
}

function runEngineLayerInstantiationCase() {
  const definition = loadFixture('valid-definition.json');
  const engine = new GameEngine({
    timeSystem: { getDeltaTime: () => 10 },
    onLayerUpdate() {},
  });

  engine.initialize(definition);
  const summary = engine.tick();

  assert.deepStrictEqual(summary.updatedLayers, ['idle']);
  assert.strictEqual(engine.layerInstances.length, definition.layers.length);
  assert.strictEqual(engine.layerInstances[0].type, 'progressLayer');
}

function runBuiltinRegistrationCase() {
  const registry = new LayerRegistry();
  registerBuiltinLayers(registry);

  const layer = registry.createLayer({ id: 'idle', type: 'progressLayer' }, {});
  assert.strictEqual(layer.type, 'progressLayer');
  assert.strictEqual(layer.id, 'idle');
}

function runLayerEventSubscriptionCase() {
  const receivedEvents = [];
  let destroyCount = 0;

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 5 },
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: 'idle' } });
    },
  });

  engine.initialize(loadFixture('valid-definition.json'));

  const layer = engine.layerInstances[0];
  layer.onEvent = (event) => {
    receivedEvents.push(event.type);
  };
  layer.destroy = () => {
    destroyCount += 1;
  };

  engine.tick();
  assert.deepStrictEqual(receivedEvents, ['LAYER_RESET_EXECUTED']);

  engine.destroy();
  assert.strictEqual(destroyCount, 1);

  engine.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: 'idle' } });
  engine.eventBus.dispatchQueued();
  assert.deepStrictEqual(receivedEvents, ['LAYER_RESET_EXECUTED']);
}

function run() {
  runRegistrationGuardrailCase();
  runBaseLayerContractCheckCase();
  runBuiltinRegistrationCase();
  runEngineLayerInstantiationCase();
  runLayerEventSubscriptionCase();
  console.log('layer-registry tests passed');
}

run();
