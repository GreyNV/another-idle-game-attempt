const assert = require('assert');
const { createRuntimeSystems } = require('../engine/systems/createRuntimeSystems');

function buildRoutineDefinition() {
  return {
    state: {
      resources: {
        wood: 0,
        energy: 10,
      },
      layers: {
        idle: {},
      },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
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
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function runRoutineSystemCase() {
  const definition = buildRoutineDefinition();
  const systems = createRuntimeSystems({ definition, devModeStrict: false });
  const { routineSystem, stateStore } = systems;

  const startResult = routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'woodcut' });
  assert.strictEqual(startResult.code, 'ROUTINE_STARTED');

  routineSystem.update(1);
  assert.strictEqual(stateStore.get('resources.wood'), 2);
  assert.strictEqual(stateStore.get('resources.energy'), 9);

  const poolSwitchResult = routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'fishing' });
  assert.strictEqual(poolSwitchResult.code, 'ROUTINE_STARTED');
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), false);
  assert.strictEqual(stateStore.get('layers.idle.routines.fishing.active'), true);

  const toggleResult = routineSystem.handleIntent('ROUTINE_TOGGLE', { layerId: 'idle', routineId: 'fishing' });
  assert.strictEqual(toggleResult.code, 'ROUTINE_STOPPED');
  assert.strictEqual(stateStore.get('layers.idle.routines.fishing.active'), false);

  routineSystem.handleIntent('ROUTINE_START', { layerId: 'idle', routineId: 'woodcut' });
  stateStore.set('resources.energy', 0);
  const updateReport = routineSystem.update(1);
  assert.deepStrictEqual(updateReport.stoppedBeforeDelta, ['idle/woodcut']);
  assert.strictEqual(stateStore.get('resources.wood'), 2);
  assert.strictEqual(stateStore.get('layers.idle.routines.woodcut.active'), false);
}

function run() {
  runRoutineSystemCase();
  console.log('routine system tests passed');
}

run();
