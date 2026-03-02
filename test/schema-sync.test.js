const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Ajv2020 = require('ajv/dist/2020');
const addKeywords = require('ajv-keywords');

const { parseGameDefinition, ValidationError } = require('../engine');

const FIXTURE_DIR = path.join(__dirname, '..', 'engine', 'validation', 'fixtures');
const SCHEMA_PATH = path.join(__dirname, '..', 'engine', 'validation', 'schema', 'game-definition.schema.json');

const expectedInvalidByFixture = {
  'invalid-schema-version.json': { category: 'schema', code: 'SCHEMA_VERSION_MAJOR_MISMATCH' },
  'invalid-duplicate-ids.json': { category: 'schema', code: 'ID_DUPLICATE' },
  'invalid-systems-array.json': { category: 'schema', code: 'SYSTEMS_SHAPE_MIGRATED' },
  'invalid-softcap-mode.json': { category: 'schema', code: 'SOFTCAP_MODE_ENUM' },
  'invalid-routine-schema-1.0.0.json': { category: 'schema', code: 'ELEMENT_ROUTINE_REQUIRES_SCHEMA_1_2_0' },
  'invalid-target-reference.json': { category: 'reference', code: 'REF_ELEMENT_MISSING' },
  'invalid-unlock-path.json': { category: 'reference', code: 'REF_UNLOCK_PATH_MISSING' },
};

const validFixtures = [
  'valid-definition.json',
  'valid-routine-schema-1.2.0.json',
  'prototype-path-definition.json',
];

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function run() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addKeywords(ajv, ['uniqueItemProperties']);
  const validate = ajv.compile(schema);

  validFixtures.forEach((fixtureName) => {
    const fixture = loadFixture(fixtureName);

    const schemaValid = validate(fixture);
    assert.strictEqual(schemaValid, true, `${fixtureName} should pass JSON schema validation`);

    const parsed = parseGameDefinition(fixture);
    assert(parsed && typeof parsed === 'object', `${fixtureName} should parse successfully`);
  });

  Object.entries(expectedInvalidByFixture).forEach(([fixtureName, expected]) => {
    const fixture = loadFixture(fixtureName);

    const schemaValid = validate(fixture);
    if (expected.category === 'schema') {
      assert.strictEqual(schemaValid, false, `${fixtureName} should fail JSON schema validation`);
    } else {
      assert.strictEqual(schemaValid, true, `${fixtureName} should remain schema-valid and fail at reference validation`);
    }

    let caught = null;
    try {
      parseGameDefinition(fixture);
    } catch (error) {
      caught = error;
    }

    assert(caught instanceof ValidationError, `${fixtureName} should throw ValidationError`);

    const codeFound = caught.issues.some((issue) => issue.code === expected.code);
    assert(codeFound, `${fixtureName} should include parser issue code ${expected.code}`);

    const categoryFound = caught.issues.some((issue) => {
      if (expected.category === 'schema') {
        return !issue.code.startsWith('REF_');
      }
      return issue.code.startsWith('REF_');
    });
    assert(categoryFound, `${fixtureName} should include ${expected.category} issue category`);
  });

  console.log('schema-sync tests passed');
}

run();
