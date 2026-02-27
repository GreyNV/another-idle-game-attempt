const assert = require('assert');

const { parseNodeRef, normalizeNodeRef } = require('../engine/systems/unlocks/nodeRef');
const {
  parseUnlockCondition,
  evaluateUnlockCondition,
  evaluateUnlockTransition,
} = require('../engine/systems/unlocks/unlockCondition');

function runNodeRefCases() {
  const cases = [
    {
      name: 'normalizes valid full ref',
      ref: ' layer:idle / sublayer:routines / section:jobs / element:job_woodcutter ',
      expectOk: true,
      expectedNormalized: 'layer:idle/sublayer:routines/section:jobs/element:job_woodcutter',
    },
    {
      name: 'rejects invalid scope',
      ref: 'layer:idle/zone:abc',
      expectOk: false,
      expectedCode: 'NODE_REF_SCOPE_INVALID',
    },
    {
      name: 'rejects out of order scope',
      ref: 'layer:idle/section:jobs',
      expectOk: false,
      expectedCode: 'NODE_REF_SCOPE_ORDER',
    },
    {
      name: 'rejects duplicate scope ids',
      ref: 'layer:idle/layer:idle2',
      expectOk: false,
      expectedCode: 'NODE_REF_SCOPE_DUPLICATE',
    },
  ];

  cases.forEach((testCase) => {
    const parsed = parseNodeRef(testCase.ref);
    assert.strictEqual(parsed.ok, testCase.expectOk, testCase.name);
    if (!testCase.expectOk) {
      assert.strictEqual(parsed.code, testCase.expectedCode, `${testCase.name} error code`);
      return;
    }

    const normalized = normalizeNodeRef(testCase.ref);
    assert.strictEqual(normalized.ok, true, `${testCase.name} normalize ok`);
    assert.strictEqual(normalized.value, testCase.expectedNormalized, `${testCase.name} normalized value`);
  });
}

function runUnlockAstCases() {
  const parseCases = [
    {
      name: 'parses mixed operators',
      raw: {
        all: [
          { resourceGte: { path: 'resources.xp', value: 100 } },
          { compare: { path: 'resources.gold', op: 'gt', value: 10 } },
          { any: [{ flag: { path: 'flags.tutorialComplete' } }, { always: true }] },
          { not: { flag: { path: 'flags.blocked' } } },
        ],
      },
      expectOk: true,
    },
    {
      name: 'rejects mixed root operators in single object',
      raw: { always: true, flag: { path: 'flags.ready' } },
      expectOk: false,
      expectedCode: 'UNLOCK_AST_SHAPE',
    },
    {
      name: 'rejects invalid comparison op',
      raw: { compare: { path: 'resources.gold', op: 'between', value: 10 } },
      expectOk: false,
      expectedCode: 'UNLOCK_COMPARE_OP',
    },
  ];

  parseCases.forEach((testCase) => {
    const parsed = parseUnlockCondition(testCase.raw);
    assert.strictEqual(parsed.ok, testCase.expectOk, testCase.name);
    if (!testCase.expectOk) {
      assert.strictEqual(parsed.code, testCase.expectedCode, `${testCase.name} error code`);
    }
  });
}

function runUnlockEvaluationCases() {
  const state = {
    resources: { xp: 120, gold: 14 },
    flags: { tutorialComplete: false, blocked: false },
  };

  const parsed = parseUnlockCondition({
    all: [
      { resourceGte: { path: 'resources.xp', value: 100 } },
      { compare: { path: 'resources.gold', op: 'gte', value: 12 } },
      { any: [{ flag: { path: 'flags.tutorialComplete' } }, { always: true }] },
      { not: { flag: { path: 'flags.blocked' } } },
    ],
  });
  assert.strictEqual(parsed.ok, true, 'mixed evaluation AST should parse');

  const result = evaluateUnlockCondition(parsed.value, state);
  assert.strictEqual(result, true, 'mixed AST should evaluate to true');

  const missingPathParsed = parseUnlockCondition({ flag: { path: 'flags.nonexistent' } });
  assert.strictEqual(missingPathParsed.ok, true, 'missing path flag should parse');
  const missingPathResult = evaluateUnlockCondition(missingPathParsed.value, state);
  assert.strictEqual(missingPathResult, false, 'missing path should evaluate false');

  const transitionFromLocked = evaluateUnlockTransition({
    wasUnlocked: false,
    ast: parsed.value,
    state,
    phase: 'end-of-tick',
  });
  assert.deepStrictEqual(transitionFromLocked, { unlocked: true, transitioned: true });

  const transitionAlreadyUnlocked = evaluateUnlockTransition({
    wasUnlocked: true,
    ast: missingPathParsed.value,
    state,
    phase: 'end-of-tick',
  });
  assert.deepStrictEqual(transitionAlreadyUnlocked, { unlocked: true, transitioned: false });

  assert.throws(() => {
    evaluateUnlockTransition({
      wasUnlocked: false,
      ast: parsed.value,
      state,
      phase: 'layer-update',
    });
  }, /end-of-tick/);
}

function run() {
  runNodeRefCases();
  runUnlockAstCases();
  runUnlockEvaluationCases();
  console.log('unlock-utils tests passed');
}

run();
