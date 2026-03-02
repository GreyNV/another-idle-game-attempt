const assert = require('assert');
const { createRuntimeSystems } = require('../engine/systems/createRuntimeSystems');
const { GameEngine } = require('../engine/core/GameEngine');

function buildRoutineDefinition() {
  return {
    state: {
      resources: {
        wood: 0,
        energy: 10,
        xp: 0,
      },
      layers: {
        idle: {
          routinePools: {
            workerSlots: {
              total: 1,
              used: 0,
              activeRoutine: null,
            },
            trainingSlots: {
              total: 1,
              used: 0,
              activeRoutine: null,
            },
          },
          routines: {
            woodcut: { active: false },
            fishing: { active: false },
            sparring: { active: false },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        routineSystem: {
          slotPools: {
            workerSlots: {
              totalPath: 'layers.idle.routinePools.workerSlots.total',
              usedPath: 'layers.idle.routinePools.workerSlots.used',
              activeRoutineIdPath: 'layers.idle.routinePools.workerSlots.activeRoutine',
              singleActivePerPool: true,
            },
            trainingSlots: {
              totalPath: 'layers.idle.routinePools.trainingSlots.total',
              usedPath: 'layers.idle.routinePools.trainingSlots.used',
              activeRoutineIdPath: 'layers.idle.routinePools.trainingSlots.activeRoutine',
              singleActivePerPool: true,
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
                    id: 'woodcut',
                    type: 'routine',
                    slot: { poolId: 'workerSlots' },
                    mode: 'manual',
                    produces: [{ path: 'resources.wood', perSecond: 2 }],
                    consumes: [{ path: 'resources.energy', perSecond: 1 }],
                    requires: [{ path: 'resources.energy', perSecond: 0 }],
                    scaling: {
                      yieldMultiplierKeys: ['gain.wood'],
                    },
                  },
                  {
                    id: 'fishing',
                    type: 'routine',
                    slot: { poolId: 'workerSlots' },
                    mode: 'manual',
                    produces: [{ path: 'resources.wood', perSecond: 1 }],
                  },
                  {
                    id: 'sparring',
                    type: 'routine',
                    slot: { poolId: 'trainingSlots' },
                    mode: 'manual',
                    produces: [{ path: 'resources.xp', perSecond: 3 }],
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

function createRoutineSystems() {
  const definition = buildRoutineDefinition();
  return createRuntimeSystems({ definition, devModeStrict: false });
}

function runRoutineIntentPerPoolCase() {
  const { routineSystem, stateStore } = createRoutineSystems();

  const startWoodcut = routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'woodcut' });
  assert.strictEqual(startWoodcut.code, 'ROUTINE_STARTED');
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), true);

  const toggleWoodcutOff = routineSystem.handleIntent('ROUTINE_TOGGLE', { layerId: 'idle', routineId: 'woodcut' });
  assert.strictEqual(toggleWoodcutOff.code, 'ROUTINE_STOPPED');
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), false);

  const toggleWoodcutOn = routineSystem.handleIntent('ROUTINE_TOGGLE', { layerId: 'idle', routineId: 'woodcut' });
  assert.strictEqual(toggleWoodcutOn.code, 'ROUTINE_STARTED');
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), true);

  const stopWoodcut = routineSystem.handleIntent('ROUTINE_STOP', { layerId: 'idle', routineId: 'woodcut' });
  assert.strictEqual(stopWoodcut.code, 'ROUTINE_STOPPED');
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), false);
}

function runSimultaneousCrossPoolCase() {
  const { routineSystem, stateStore } = createRoutineSystems();

  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'woodcut' });
  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'sparring' });

  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), true);
  assert.strictEqual(stateStore.get('layers.idle.routines.sparring.active'), true);

  routineSystem.update(1);
  assert.strictEqual(stateStore.get('resources.wood'), 2);
  assert.strictEqual(stateStore.get('resources.xp'), 3);
}

function runSamePoolReplacementSingleTickCase() {
  const { routineSystem, stateStore } = createRoutineSystems();

  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'woodcut' });
  const switchResult = routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'fishing' });
  assert.strictEqual(switchResult.code, 'ROUTINE_STARTED');

  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), false);
  assert.strictEqual(stateStore.get('layers.idle.routines.fishing.active'), true);

  routineSystem.update(1);
  assert.strictEqual(stateStore.get('resources.wood'), 1, 'replacement should apply only the final active routine in pool');
}

function runUnderflowAutoStopCase() {
  const { routineSystem, stateStore } = createRoutineSystems();

  stateStore.set('resources.energy', 0.2);
  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'woodcut' });

  const report = routineSystem.update(1);
  assert.deepStrictEqual(report.stoppedBeforeDelta, ['idle/woodcut']);
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), false);
  assert.strictEqual(stateStore.get('resources.energy') >= 0, true);
  assert.strictEqual(stateStore.get('resources.energy'), 0.2);
  assert.strictEqual(stateStore.get('resources.wood'), 0);
}

function runUiIntegrationRoutineViewCase() {
  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 1000 },
  });
  const definition = {
    meta: { schemaVersion: '1.2.0', gameId: 'routine-ui-integration' },
    systems: { tickMs: 1000 },
    state: {
      resources: { wood: 0, energy: 5 },
      layers: {
        idle: {
          routinePools: {
            workers: { total: 1, used: 0, activeRoutineId: null },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        unlock: { always: true },
        routineSystem: {
          slotPools: {
            workers: {
              totalPath: 'layers.idle.routinePools.workers.total',
              usedPath: 'layers.idle.routinePools.workers.used',
              activeRoutineIdPath: 'layers.idle.routinePools.workers.activeRoutineId',
            },
          },
        },
        sublayers: [
          {
            id: 'main',
            type: 'progress',
            unlock: { always: true },
            sections: [
              {
                id: 'jobs',
                unlock: {
                  resourceGte: {
                    path: 'resources.wood',
                    value: 10,
                  },
                },
                elements: [
                  {
                    id: 'woodcut',
                    type: 'routine',
                    mode: 'manual',
                    slot: { poolId: 'workers' },
                    produces: [{ path: 'resources.wood', perSecond: 1 }],
                    consumes: [{ path: 'resources.energy', perSecond: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  engine.initialize(definition);
  engine.enqueueIntent({ type: 'ROUTINE_START', payload: { layerId: 'idle', routineId: 'woodcut' } });
  const tickOne = engine.tick();

  const idleLayer = tickOne.ui.layers.find((layer) => layer.id === 'idle');
  assert.ok(idleLayer);
  const jobsSection = idleLayer.sublayers[0].sections[0];
  assert.strictEqual(jobsSection.placeholder, true);
  assert.strictEqual(jobsSection.unlockProgress > 0, true);

  engine.stateStore.set('resources.wood', 10);
  const tickTwo = engine.tick();
  const jobsSectionUnlocked = tickTwo.ui.layers.find((layer) => layer.id === 'idle').sublayers[0].sections[0];
  const woodcutElement = jobsSectionUnlocked.elements[0];
  assert.strictEqual(woodcutElement.active, true);
  assert.strictEqual(woodcutElement.status, 'active');
  assert.deepStrictEqual(woodcutElement.intents.toggle, {
    type: 'ROUTINE_TOGGLE',
    payload: { layerId: 'idle', routineId: 'woodcut', poolId: 'workers' },
  });
}

function runRoutineApplyOrderFollowsDefinitionOrderCase() {
  const definition = {
    state: {
      resources: {
        energy: 1,
      },
      layers: {
        idle: {
          routinePools: {
            firstPool: { total: 1, used: 0, activeRoutine: null },
            secondPool: { total: 1, used: 0, activeRoutine: null },
          },
          routines: {
            zeta: { active: false },
            alpha: { active: false },
          },
        },
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        routineSystem: {
          slotPools: {
            firstPool: {
              totalPath: 'layers.idle.routinePools.firstPool.total',
              usedPath: 'layers.idle.routinePools.firstPool.used',
              activeRoutineIdPath: 'layers.idle.routinePools.firstPool.activeRoutine',
              singleActivePerPool: true,
            },
            secondPool: {
              totalPath: 'layers.idle.routinePools.secondPool.total',
              usedPath: 'layers.idle.routinePools.secondPool.used',
              activeRoutineIdPath: 'layers.idle.routinePools.secondPool.activeRoutine',
              singleActivePerPool: true,
            },
          },
        },
        sublayers: [
          {
            id: 'routines',
            sections: [
              {
                id: 'order-check',
                elements: [
                  {
                    id: 'zeta',
                    type: 'routine',
                    slot: { poolId: 'firstPool' },
                    mode: 'manual',
                    consumes: [{ path: 'resources.energy', perSecond: 1 }],
                    requires: [{ path: 'resources.energy', perSecond: 0 }],
                  },
                  {
                    id: 'alpha',
                    type: 'routine',
                    slot: { poolId: 'secondPool' },
                    mode: 'manual',
                    consumes: [{ path: 'resources.energy', perSecond: 1 }],
                    requires: [{ path: 'resources.energy', perSecond: 0 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const { routineSystem, stateStore } = createRuntimeSystems({ definition, devModeStrict: false });

  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'zeta' });
  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'alpha' });

  const report = routineSystem.update(1);
  assert.deepStrictEqual(report.stoppedBeforeDelta, ['idle/alpha']);
  assert.strictEqual(stateStore.get('resources.energy'), 0);
  assert.strictEqual(stateStore.get('layers.idle.routines.zeta.active'), true);
  assert.strictEqual(stateStore.get('layers.idle.routines.alpha.active'), false);
}

function run() {
  runRoutineIntentPerPoolCase();
  runSimultaneousCrossPoolCase();
  runSamePoolReplacementSingleTickCase();
  runUnderflowAutoStopCase();
  runUiIntegrationRoutineViewCase();
  runRoutineApplyOrderFollowsDefinitionOrderCase();
  console.log('routine system tests passed');
}

run();
