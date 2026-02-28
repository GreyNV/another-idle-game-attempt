const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { StateStore } = require('../engine/systems/state-store/StateStore');
const { TimeSystem } = require('../engine/systems/time/TimeSystem');
const { applySoftcap, SUPPORTED_SOFTCAP_MODES } = require('../engine/systems/modifiers/applySoftcap');
const { ModifierResolver } = require('../engine/systems/modifiers/ModifierResolver');
const { LayerResetService } = require('../engine/systems/reset/LayerResetService');
const { UIComposer } = require('../engine/ui/UIComposer');
const { createRuntimeSystems } = require('../engine/systems/createRuntimeSystems');
const { GameEngine } = require('../engine/core/GameEngine');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8')
  );
}

function runStateStoreCase() {
  const store = new StateStore({ resources: { xp: 1 } });

  store.set('resources.xp', 2);
  store.patch('resources', { gold: 5 });
  store.setDerived('ui.unlockedCount', 3);

  assert.strictEqual(store.get('resources.xp'), 2);
  assert.strictEqual(store.get('resources.gold'), 5);
  assert.strictEqual(store.get('derived.ui.unlockedCount'), 3);
  assert.throws(() => store.set('derived.ui.bad', 1), /policy violation/);

  const snapshot = store.snapshot();
  assert.strictEqual(Object.isFrozen(snapshot), true);
  assert.strictEqual(snapshot.canonical.resources.xp, 2);
}

function runTimeSystemCase() {
  const marks = [1000, 1025, 1045];
  const system = new TimeSystem({ tickRate: 20, now: () => marks.shift() });

  assert.strictEqual(system.getDeltaTime(), 50);
  assert.strictEqual(system.getDeltaTime(), 25);
  assert.strictEqual(system.getDeltaTime(), 20);
}

function runModifierCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const resolver = new ModifierResolver({ definition: validDefinition });

  const unchanged = applySoftcap(50, { mode: 'power', softcapAt: 100, power: 0.5 });
  const softcapped = resolver.resolve('layer:idle/sublayer:routines/section:jobs/element:woodcut', 'gain.gold', 400);

  assert.deepStrictEqual(SUPPORTED_SOFTCAP_MODES, ['power']);
  assert.throws(() => applySoftcap(120, { mode: 'log', softcapAt: 100 }), /Unsupported softcap mode/);
  assert.strictEqual(unchanged, 50);
  assert.ok(softcapped < 400);
  assert.ok(softcapped > 100);
}

function runLayerResetCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const systems = createRuntimeSystems({ definition: validDefinition, devModeStrict: false });

  systems.stateStore.set('resources.xp', 150);
  systems.stateStore.set('resources.gold', 200);

  const service = new LayerResetService({
    definition: validDefinition,
    stateStore: systems.stateStore,
    eventBus: systems.eventBus,
  });

  const preview = service.preview('idle');
  assert.deepStrictEqual(preview.keepPaths, ['resources.gold']);

  const result = service.execute({ layerId: 'idle', reason: 'test' });
  assert.strictEqual(result.snapshot.canonical.resources.xp, 0);
  assert.strictEqual(result.snapshot.canonical.resources.gold, 200);
}

function runUIComposerCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const composer = new UIComposer();

  const uiTree = composer.compose(validDefinition, {
    isUnlocked(nodeRef) {
      return nodeRef !== 'layer:idle/sublayer:routines/section:jobs/element:woodcut-upgrade';
    },
  });

  const elements = uiTree.layers[0].sublayers[0].sections[0].elements;
  assert.strictEqual(elements.length, 1);
  assert.strictEqual(elements[0].id, 'woodcut');
}

function runGameEngineWiringCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const engine = new GameEngine({ devModeStrict: false });
  engine.initialize(validDefinition);

  engine.stateStore.set('resources.xp', 15);
  engine.stateStore.set('resources.gold', 33);
  engine.enqueueIntent({ type: 'REQUEST_LAYER_RESET', payload: { layerId: 'idle', reason: 'test' } });

  const summary = engine.tick();
  assert.strictEqual(summary.intentsRouted[0].ok, true);

  const snapshot = engine.stateStore.snapshot();
  assert.strictEqual(snapshot.canonical.resources.xp, 0);
  assert.strictEqual(snapshot.canonical.resources.gold, 33);
  assert.ok(summary.ui.layers.length > 0);
}

function run() {
  runStateStoreCase();
  runTimeSystemCase();
  runModifierCase();
  runLayerResetCase();
  runUIComposerCase();
  runGameEngineWiringCase();
  console.log('runtime systems tests passed');
}

run();
