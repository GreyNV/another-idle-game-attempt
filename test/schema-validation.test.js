const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { GameEngine, parseGameDefinition, ValidationError } = require('../engine');
const { EventBus } = require('../engine/systems/event-bus/EventBus');
const { IntentRouter } = require('../engine/systems/intent/IntentRouter');
const { compareSchemaVersions } = require('../engine/validation/schema/schemaVersionPolicy');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8')
  );
}

function expectInvalid(name, expectedCode, expectedPathPart) {
  const fixture = loadFixture(name);
  let caught = null;
  try {
    parseGameDefinition(fixture);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, `${name} should throw ValidationError`);
  const hasCode = caught.issues.some((issue) => issue.code === expectedCode);
  const hasPath = caught.issues.some((issue) => issue.path.includes(expectedPathPart));
  assert(hasCode, `${name} should contain issue code ${expectedCode}`);
  assert(hasPath, `${name} should contain path ${expectedPathPart}`);

  const first = caught.issues[0];
  assert(first.hint && first.hint.length > 0, `${name} should include remediation hint`);
}

function runCatalogValidationChecks() {
  const strictEventBus = new EventBus({ strictValidation: true });

  strictEventBus.publish({
    type: 'UNLOCKED',
    phase: 'unlock-evaluation',
    payload: { targetRef: 'layers.progressLayer.sections.jobs' },
  });

  assert.throws(() => {
    strictEventBus.publish({
      type: 'UNLOCKED',
      phase: 'render',
      payload: { targetRef: 'layers.progressLayer.sections.jobs' },
    });
  }, /cannot be published during phase/);

  assert.throws(() => {
    strictEventBus.publish({
      type: 'LAYER_RESET_EXECUTED',
      phase: 'event-dispatch',
      payload: { preservedKeys: ['xp'] },
    });
  }, /payload.layerId must be a non-empty string/);

  const received = [];
  strictEventBus.subscribe('UNLOCKED', (event) => {
    received.push(event.type);
  });
  assert.strictEqual(strictEventBus.dispatchQueued(), 1);
  assert.deepStrictEqual(received, ['UNLOCKED']);

  const intentRouter = new IntentRouter({
    strictValidation: true,
    isNodeLocked(targetRef) {
      return targetRef === 'layers.progressLayer.sections.jobs';
    },
  });

  intentRouter.register('START_JOB', (intent, entry) => ({
    routed: intent.type,
    target: entry.routingTarget,
  }));

  const lockedResult = intentRouter.route({
    type: 'START_JOB',
    payload: {
      targetRef: 'layers.progressLayer.sections.jobs',
      jobId: 'woodcutting',
    },
  });
  assert.strictEqual(lockedResult.ok, false);
  assert.strictEqual(lockedResult.code, 'INTENT_TARGET_LOCKED');

  const payloadInvalidResult = intentRouter.route({
    type: 'STOP_JOB',
    payload: {
      targetRef: 'layers.progressLayer.sections.jobs',
    },
  });
  assert.strictEqual(payloadInvalidResult.ok, false);
  assert.strictEqual(payloadInvalidResult.code, 'INTENT_PAYLOAD_INVALID');

  const routedResult = intentRouter.route({
    type: 'START_JOB',
    payload: {
      targetRef: 'layers.progressLayer.sections.unlocked',
      jobId: 'woodcutting',
    },
  });
  assert.strictEqual(routedResult.ok, true);
  assert.strictEqual(routedResult.routingTarget, 'progressLayer');
}



function runSchemaVersionComparisonChecks() {
  assert.strictEqual(compareSchemaVersions('1.0', '1.0.0'), 0);
  assert.strictEqual(compareSchemaVersions('1.1.9', '1.2.0') < 0, true);
  assert.strictEqual(compareSchemaVersions('1.2.0', '1.1.9') > 0, true);
  assert.strictEqual(compareSchemaVersions('1.2.0', '1.2.0'), 0);
}

function runRoutineSchemaGateChecks() {
  const validRoutine = loadFixture('valid-routine-schema-1.2.0.json');
  const parsed = parseGameDefinition(validRoutine);
  assert.strictEqual(parsed.meta.gameId, 'idle-routine-valid');

  let caught = null;
  try {
    parseGameDefinition(loadFixture('invalid-routine-schema-1.0.0.json'));
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, 'invalid-routine-schema-1.0.0.json should fail schema validation');
  const routineIssue = caught.issues.find((entry) => entry.code === 'ELEMENT_ROUTINE_REQUIRES_SCHEMA_1_2_0');
  assert(routineIssue, 'Expected ELEMENT_ROUTINE_REQUIRES_SCHEMA_1_2_0 issue');
  assert.match(routineIssue.message, /woodcut-routine/);
  assert.match(routineIssue.hint, /1.2.0/);
}


function runRoutineSchemaValidationChecks() {
  const validWithSlotPools = {
    meta: { schemaVersion: '1.2.0', gameId: 'routine-slot-pools-valid' },
    systems: { tickMs: 100 },
    state: {
      resources: { xp: 0 },
      flags: { jobUnlocked: false },
      layers: {
        idle: {
          routinePools: {
            workers: {
              total: 2,
              used: 0,
              activeRoutineId: null,
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
          slotPools: {
            workers: {
              totalPath: 'layers.idle.routinePools.workers.total',
              usedPath: 'layers.idle.routinePools.workers.used',
              activeRoutineIdPath: 'layers.idle.routinePools.workers.activeRoutineId',
              singleActivePerPool: true,
            },
          },
        },
        sublayers: [
          {
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'woodcut-routine',
                    type: 'routine',
                    mode: 'auto',
                    slot: { poolId: 'workers' },
                    produces: [{ path: 'resources.xp', perSecond: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const normalized = parseGameDefinition(validWithSlotPools);
  assert(normalized.layers[0].routineSystem.slotPoolsById.workers, 'Expected slot pool map entry for workers');
  assert.strictEqual(normalized.layers[0].routineSystem.slotPoolsById.workers.singleActivePerPool, true);
  assert(normalized.layers[0].runtime.routineDefinitionsById['woodcut-routine'], 'Expected runtime routine definition map entry');
  assert.strictEqual(normalized.layers[0].runtime.routineDefinitionsById['woodcut-routine'].slot.cost, 1);

  const routineInvalidShape = {
    meta: { schemaVersion: '1.2.0', gameId: 'routine-shape-invalid' },
    systems: { tickMs: 100 },
    state: { resources: { xp: 0 }, flags: { jobUnlocked: false } },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        sublayers: [
          {
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'woodcut-routine',
                    type: 'routine',
                    mode: '',
                    slot: { poolId: '', cost: 0 },
                    produces: [{ path: 'resources.xp', perSecond: -1 }],
                    unknownField: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  let caught = null;
  try {
    parseGameDefinition(routineInvalidShape);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, 'routineInvalidShape should fail schema validation');
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_UNKNOWN_FIELD' && entry.path.includes('/unknownField')));
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_MODE_REQUIRED' && entry.path.includes('/mode')));
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_SLOT_POOL_ID_REQUIRED' && entry.path.includes('/slot/poolId')));
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_SLOT_COST_INVALID' && entry.path.includes('/slot/cost')));
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_PER_SECOND_INVALID' && entry.path.includes('/produces/0/perSecond')));

  const routineMissingPaths = {
    meta: { schemaVersion: '1.2.0', gameId: 'routine-path-invalid' },
    systems: { tickMs: 100 },
    state: {
      resources: { xp: 0 },
      flags: { jobUnlocked: false },
    },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        sublayers: [
          {
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'woodcut-routine',
                    type: 'routine',
                    mode: 'auto',
                    slot: { poolId: 'workers', cost: 1 },
                    produces: [{ path: 'resources.missing', perSecond: 1 }],
                    consumes: [{ path: 'resources.missing2', perSecond: 0 }],
                    requires: [{ path: 'flags.missingRequirement' }],
                    effects: { setFlag: { path: 'resources.badFlag' } },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  caught = null;
  try {
    parseGameDefinition(routineMissingPaths);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, 'routineMissingPaths should fail reference validation');
  assert(caught.issues.some((entry) => entry.code === 'REF_ROUTINE_PATH_MISSING' && entry.path.includes('/produces/0/path')));
  assert(caught.issues.some((entry) => entry.code === 'REF_ROUTINE_PATH_MISSING' && entry.path.includes('/consumes/0/path')));
  assert(caught.issues.some((entry) => entry.code === 'REF_ROUTINE_PATH_MISSING' && entry.path.includes('/requires/0/path')));
  assert(caught.issues.some((entry) => entry.code === 'REF_SET_FLAG_PATH_POLICY' && entry.path.includes('/effects/setFlag/path')));

  const routineUnknownPool = {
    meta: { schemaVersion: '1.2.0', gameId: 'routine-unknown-pool' },
    systems: { tickMs: 100 },
    state: {
      resources: { xp: 0 },
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
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'woodcut-routine',
                    type: 'routine',
                    mode: 'auto',
                    slot: { poolId: 'missingPool', cost: 1 },
                    produces: [{ path: 'resources.xp', perSecond: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  caught = null;
  try {
    parseGameDefinition(routineUnknownPool);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, 'routineUnknownPool should fail reference validation');
  assert(caught.issues.some((entry) => entry.code === 'REF_ROUTINE_SLOT_POOL_UNKNOWN' && entry.path.includes('/slot/poolId')));

  const malformedRoutineDefinitions = {
    meta: { schemaVersion: '1.2.0', gameId: 'routine-malformed-definitions' },
    systems: { tickMs: 100 },
    state: {
      resources: { xp: 0 },
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
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'invalid-mode',
                    type: 'routine',
                    mode: 'queued',
                    slot: { poolId: 'workers', cost: 1 },
                    produces: [{ path: 'resources.xp', perSecond: 1 }],
                  },
                  {
                    id: 'invalid-delta-entry',
                    type: 'routine',
                    mode: 'manual',
                    slot: { poolId: 'workers', cost: 1 },
                    produces: [{ path: '', perSecond: 'fast' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  caught = null;
  try {
    parseGameDefinition(malformedRoutineDefinitions);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, 'malformedRoutineDefinitions should fail schema validation');
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_PATH_REQUIRED' && entry.path.includes('/produces/0/path')));
  assert(caught.issues.some((entry) => entry.code === 'ROUTINE_PER_SECOND_INVALID' && entry.path.includes('/produces/0/perSecond')));
}

function runSoftcapModeAlignmentCheck() {
  const fixture = loadFixture('invalid-softcap-mode.json');
  assert.strictEqual(fixture.layers[0].softcaps[0].mode, 'log');

  let caught = null;
  try {
    parseGameDefinition(fixture);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof ValidationError, 'invalid-softcap-mode.json should fail schema validation');
  const modeIssue = caught.issues.find((issue) => issue.code === 'SOFTCAP_MODE_ENUM');
  assert(modeIssue, 'Expected SOFTCAP_MODE_ENUM issue');
  assert.match(modeIssue.message, /power/);
  assert.doesNotMatch(modeIssue.message, /linear|log/);
}

function run() {
  const valid = loadFixture('valid-definition.json');
  const parsed = parseGameDefinition(valid);
  assert.strictEqual(parsed.meta.gameId, 'idle-valid');

  expectInvalid('invalid-schema-version.json', 'SCHEMA_VERSION_MAJOR_MISMATCH', '/meta/schemaVersion');
  expectInvalid('invalid-duplicate-ids.json', 'ID_DUPLICATE', '/layers/0/sublayers/0/sections/0/elements/1/id');
  expectInvalid('invalid-target-reference.json', 'REF_ELEMENT_MISSING', '/effect/targetRef');
  expectInvalid('invalid-unlock-path.json', 'REF_UNLOCK_PATH_MISSING', '/unlock/path');
  expectInvalid('invalid-systems-array.json', 'SYSTEMS_SHAPE_MIGRATED', '/systems');
  expectInvalid('invalid-softcap-mode.json', 'SOFTCAP_MODE_ENUM', '/softcaps/0/mode');
  runSoftcapModeAlignmentCheck();
  runSchemaVersionComparisonChecks();
  runRoutineSchemaGateChecks();
  runRoutineSchemaValidationChecks();

  const engine = new GameEngine();
  engine.initialize(valid);
  assert.strictEqual(engine.initialized, true);

  const invalidEngine = new GameEngine();
  assert.throws(() => invalidEngine.initialize(loadFixture('invalid-target-reference.json')), ValidationError);

  runCatalogValidationChecks();

  console.log('schema-validation tests passed');
}

run();
