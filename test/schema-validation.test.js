const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { parseGameDefinition, ValidationError } = require('../engine/validation');
const { GameEngine } = require('../engine/core/GameEngine');

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

function run() {
  const valid = loadFixture('valid-definition.json');
  const parsed = parseGameDefinition(valid);
  assert.strictEqual(parsed.meta.gameId, 'idle-valid');

  expectInvalid('invalid-schema-version.json', 'SCHEMA_VERSION_MAJOR_MISMATCH', '/meta/schemaVersion');
  expectInvalid('invalid-duplicate-ids.json', 'ID_DUPLICATE', '/systems/1/id');
  expectInvalid('invalid-target-reference.json', 'REF_ELEMENT_MISSING', '/effect/targetRef');
  expectInvalid('invalid-unlock-path.json', 'REF_UNLOCK_PATH_MISSING', '/unlock/resourceGte/path');
  expectInvalid('invalid-softcap-mode.json', 'SOFTCAP_MODE_ENUM', '/softcaps/0/mode');

  const engine = new GameEngine();
  engine.initialize(valid);
  assert.strictEqual(engine.initialized, true);

  const invalidEngine = new GameEngine();
  assert.throws(() => invalidEngine.initialize(loadFixture('invalid-target-reference.json')), ValidationError);

  console.log('schema-validation tests passed');
}

run();
