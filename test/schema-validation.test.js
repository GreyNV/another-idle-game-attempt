const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { parseGameDefinition, ValidationError } = require('../engine/validation');
const { GameEngine } = require('../engine/core/GameEngine');
const { EventBus } = require('../engine/systems/event-bus/EventBus');
const { IntentRouter } = require('../engine/systems/intent/IntentRouter');

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

  const engine = new GameEngine();
  engine.initialize(valid);
  assert.strictEqual(engine.initialized, true);

  const invalidEngine = new GameEngine();
  assert.throws(() => invalidEngine.initialize(loadFixture('invalid-target-reference.json')), ValidationError);

  runCatalogValidationChecks();

  console.log('schema-validation tests passed');
}

run();
