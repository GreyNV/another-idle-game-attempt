const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { StateStore } = require('../engine/systems/state-store/StateStore');
const { TimeSystem } = require('../engine/systems/time/TimeSystem');
const { applySoftcap, SUPPORTED_SOFTCAP_MODES } = require('../engine/systems/modifiers/applySoftcap');
const { ModifierResolver } = require('../engine/systems/modifiers/ModifierResolver');
const { CharacteristicSystem } = require('../engine/systems/stats/CharacteristicSystem');
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

  const nextCanonical = { resources: { xp: 9 }, layers: { idle: { unlocked: true } } };
  store.replaceCanonical(nextCanonical);
  nextCanonical.resources.xp = 0;

  assert.strictEqual(store.get('resources.xp'), 9);
  assert.strictEqual(store.get('derived.ui.unlockedCount'), 3);
  assert.throws(() => store.replaceCanonical([]), /plain object/);
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
  systems.stateStore.setDerived('ui.lastAction', 'before-reset');

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
  assert.strictEqual(result.snapshot.derived.ui.lastAction, 'before-reset');
}

function runUIComposerCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const composer = new UIComposer();

  const uiTree = composer.compose(validDefinition, {
    getUnlockStatus(nodeRef) {
      if (nodeRef === 'layer:idle/sublayer:routines/section:jobs/element:woodcut-upgrade') {
        return { unlocked: false, progress: 0.6, showPlaceholder: true };
      }

      return { unlocked: true, progress: 1, showPlaceholder: false };
    },
  });

  const layer = uiTree.layers[0];
  assert.strictEqual(layer.placeholder, false);
  assert.strictEqual(layer.unlockProgress, 1);
  assert.strictEqual(layer.title, 'idle');

  const elements = uiTree.layers[0].sublayers[0].sections[0].elements;
  assert.strictEqual(elements.length, 2);
  assert.strictEqual(elements[1].id, 'woodcut-upgrade');
  assert.strictEqual(elements[1].placeholder, true);
  assert.strictEqual(elements[1].unlockProgress, 0.6);
  assert.strictEqual(elements[1].title, 'woodcut-upgrade');


  const statusPrecedenceTree = composer.compose(validDefinition, {
    unlockState: {
      statusByRef: {
        'layer:idle/sublayer:routines/section:jobs/element:woodcut-upgrade': {
          unlocked: false,
          progress: 0.4,
          showPlaceholder: true,
        },
      },
    },
    isUnlocked(nodeRef) {
      return nodeRef !== 'layer:idle/sublayer:routines/section:jobs/element:woodcut-upgrade';
    },
  });

  const precedenceElements = statusPrecedenceTree.layers[0].sublayers[0].sections[0].elements;
  assert.strictEqual(precedenceElements.length, 2);
  assert.strictEqual(precedenceElements[1].placeholder, true);
  assert.strictEqual(precedenceElements[1].unlockProgress, 0.4);

  const parentLockedTree = composer.compose(validDefinition, {
    getUnlockStatus(nodeRef) {
      if (nodeRef === 'layer:idle/sublayer:routines') {
        return { unlocked: false, progress: 0.25, showPlaceholder: true };
      }

      return { unlocked: true, progress: 1, showPlaceholder: false };
    },
  });

  const placeholderSublayer = parentLockedTree.layers[0].sublayers[0];
  assert.strictEqual(placeholderSublayer.placeholder, true);
  assert.strictEqual(placeholderSublayer.sections.length, 0);
}



function runRoutineElementViewModelCase() {
  const definition = {
    state: {
      layers: {
        idle: {
          routines: {
            chop: { active: true },
          },
          routinePools: {
            jobs: {
              total: 3,
              used: 1,
            },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        routineSystem: {
          slotPoolsById: {
            jobs: {
              id: 'jobs',
              totalPath: 'layers.idle.routinePools.jobs.total',
              usedPath: 'layers.idle.routinePools.jobs.used',
            },
          },
        },
        sublayers: [
          {
            id: 'routines',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'chop',
                    type: 'routine',
                    title: 'Chop Wood',
                    slot: { poolId: 'jobs' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const composer = new UIComposer();
  const tree = composer.compose(definition, {
    unlockState: {
      statusByRef: {
        'layer:idle': { unlocked: true, progress: 1, showPlaceholder: false },
        'layer:idle/sublayer:routines': { unlocked: true, progress: 1, showPlaceholder: false },
        'layer:idle/sublayer:routines/section:jobs': { unlocked: true, progress: 1, showPlaceholder: false },
        'layer:idle/sublayer:routines/section:jobs/element:chop': {
          unlocked: false,
          progress: 0.45,
          showPlaceholder: true,
        },
      },
    },
    getStateValue(path) {
      const parts = path.split('.');
      let cursor = definition.state;
      for (const part of parts) {
        cursor = cursor && cursor[part];
      }
      return cursor;
    },
  });

  const routine = tree.layers[0].sublayers[0].sections[0].elements[0];
  assert.strictEqual(routine.title, 'Chop Wood');
  assert.strictEqual(routine.placeholder, true);
  assert.strictEqual(routine.unlockProgress, 0.45);
  assert.strictEqual(routine.active, true);
  assert.strictEqual(routine.status, 'active');
  assert.deepStrictEqual(routine.pool, { poolId: 'jobs', used: 1, total: 3 });
  assert.deepStrictEqual(routine.intents.toggle, {
    type: 'ROUTINE_TOGGLE',
    payload: { layerId: 'idle', routineId: 'chop', poolId: 'jobs' },
  });

  const systems = createRuntimeSystems({ definition, devModeStrict: true, isNodeLocked: () => false });
  systems.intentRouter.register('ROUTINE_TOGGLE', (intent) =>
    systems.routineSystem.handleIntent(intent.type, intent.payload)
  );

  const routeResult = systems.intentRouter.route(routine.intents.toggle);
  assert.strictEqual(routeResult.ok, true);
  assert.strictEqual(routeResult.code, 'INTENT_ROUTED');
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


function runCharacteristicAndMultiplierCase() {
  const definition = {
    state: {
      resources: { xp: 0 },
      layers: {
        idle: {
          characteristics: {
            strength: { xp: 27, level: 0 },
          },
          multipliers: {
            'mul.routine.speed': {
              gear: [0.2, 0.3],
              buff: [0.5],
            },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        characteristics: [
          {
            id: 'strength',
            curve: { baseXp: 10, growth: 2, exponent: 1 },
          },
        ],
        sublayers: [
          {
            id: 'main',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'chop',
                    type: 'routine',
                    slot: { poolId: 'jobs' },
                    consumes: [],
                    produces: [{ path: 'resources.xp', perSecond: 2 }],
                    scaling: {
                      speedMultiplierKeys: ['mul.routine.speed'],
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

  const systems = createRuntimeSystems({
    definition,
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 1000 },
  });

  const characteristicSystem = new CharacteristicSystem({ definition, stateStore: systems.stateStore });

  const characteristicSnapshot = characteristicSystem.update();
  assert.strictEqual(characteristicSnapshot.byLayer.idle.strength.level, 2);
  assert.strictEqual(characteristicSnapshot.byLayer.idle.strength.xp, 5);
  assert.strictEqual(systems.stateStore.get('derived.characteristics.byLayer.idle.strength.level'), 2);

  const multiplierSnapshot = systems.multiplierCompiler.update();
  assert.strictEqual(multiplierSnapshot.layers.idle['mul.routine.speed'], 2.25);
  assert.strictEqual(systems.multiplierCompiler.getValue('idle', 'mul.unknown'), 1);

  systems.routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'chop' });
  const routineResult = systems.routineSystem.update(1);
  assert.strictEqual(routineResult.applied[0].multipliers.speedMultiplier, 2.25);
}

function runIntentRouterLockInjectionCase() {
  const validDefinition = loadFixture('valid-definition.json');
  assert.throws(
    () => createRuntimeSystems({ definition: validDefinition, devModeStrict: true }),
    /requires an explicit isNodeLocked callback/
  );

  const systems = createRuntimeSystems({
    definition: validDefinition,
    devModeStrict: true,
    isNodeLocked: () => false,
  });

  assert.strictEqual(typeof systems.intentRouter.isNodeLocked, 'function');
}

function run() {
  runStateStoreCase();
  runTimeSystemCase();
  runModifierCase();
  runLayerResetCase();
  runUIComposerCase();
  runRoutineElementViewModelCase();
  runGameEngineWiringCase();
  runCharacteristicAndMultiplierCase();
  runIntentRouterLockInjectionCase();
  console.log('runtime systems tests passed');
}

run();
