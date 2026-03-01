const assert = require('assert');

const { parseNodeRef, normalizeNodeRef } = require('../engine/systems/unlocks/nodeRef');
const {
  parseUnlockCondition,
  evaluateUnlockCondition,
  evaluateUnlockProgress,
  evaluateUnlockTransition,
} = require('../engine/systems/unlocks/unlockCondition');
const { UnlockEvaluator } = require('../engine/systems/unlocks/UnlockEvaluator');

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


function runUnlockProgressCases() {
  const state = {
    resources: { xp: 50, cap: 100, debt: -20 },
    flags: { ready: false },
  };

  const progressAst = parseUnlockCondition({
    all: [
      { resourceGte: { path: 'resources.xp', value: 100 } },
      { compare: { path: 'resources.cap', op: 'gte', value: 200 } },
      { any: [{ flag: { path: 'flags.ready' } }, { compare: { path: 'resources.debt', op: 'lte', value: -10 } }] },
      { not: { flag: { path: 'flags.ready' } } },
    ],
  });
  assert.strictEqual(progressAst.ok, true, 'progress AST should parse');

  const progress = evaluateUnlockProgress(progressAst.value, state);
  assert.strictEqual(progress, 0.75, 'all should average child progress deterministically');

  const eqAst = parseUnlockCondition({ compare: { path: 'resources.xp', op: 'eq', value: 50 } });
  assert.strictEqual(eqAst.ok, true, 'eq AST should parse');
  assert.strictEqual(evaluateUnlockProgress(eqAst.value, state), 1, 'eq progress is binary when true');

  const neqAst = parseUnlockCondition({ compare: { path: 'resources.xp', op: 'neq', value: 50 } });
  assert.strictEqual(neqAst.ok, true, 'neq AST should parse');
  assert.strictEqual(evaluateUnlockProgress(neqAst.value, state), 0, 'neq progress is binary when false');


  const gtBoundaryAst = parseUnlockCondition({ compare: { path: 'resources.xp', op: 'gt', value: 50 } });
  assert.strictEqual(gtBoundaryAst.ok, true, 'gt boundary AST should parse');
  const gtBoundaryProgress = evaluateUnlockProgress(gtBoundaryAst.value, state);
  assert(gtBoundaryProgress < 1, 'gt boundary progress must stay below 1 while still locked');
  assert.strictEqual(evaluateUnlockCondition(gtBoundaryAst.value, state), false, 'gt boundary remains locked at equality');

  const ltBoundaryAst = parseUnlockCondition({ compare: { path: 'resources.cap', op: 'lt', value: 100 } });
  assert.strictEqual(ltBoundaryAst.ok, true, 'lt boundary AST should parse');
  const ltBoundaryProgress = evaluateUnlockProgress(ltBoundaryAst.value, state);
  assert(ltBoundaryProgress < 1, 'lt boundary progress must stay below 1 while still locked');
  assert.strictEqual(evaluateUnlockCondition(ltBoundaryAst.value, state), false, 'lt boundary remains locked at equality');


  const notGtBoundaryAst = parseUnlockCondition({ not: { compare: { path: 'resources.xp', op: 'gt', value: 50 } } });
  assert.strictEqual(notGtBoundaryAst.ok, true, 'not(gt) boundary AST should parse');
  assert.strictEqual(evaluateUnlockCondition(notGtBoundaryAst.value, state), true, 'not(gt) should be unlocked at equality boundary');
  assert.strictEqual(evaluateUnlockProgress(notGtBoundaryAst.value, state), 1, 'not(gt) progress should be 1 when unlocked at equality boundary');

  const notLtBoundaryAst = parseUnlockCondition({ not: { compare: { path: 'resources.cap', op: 'lt', value: 100 } } });
  assert.strictEqual(notLtBoundaryAst.ok, true, 'not(lt) boundary AST should parse');
  assert.strictEqual(evaluateUnlockCondition(notLtBoundaryAst.value, state), true, 'not(lt) should be unlocked at equality boundary');
  assert.strictEqual(evaluateUnlockProgress(notLtBoundaryAst.value, state), 1, 'not(lt) progress should be 1 when unlocked at equality boundary');


  const gteZeroFarAst = parseUnlockCondition({ compare: { path: 'resources.debt', op: 'gte', value: 0 } });
  assert.strictEqual(gteZeroFarAst.ok, true, 'gte zero AST should parse');
  const gteZeroFarProgress = evaluateUnlockProgress(gteZeroFarAst.value, state);
  assert(gteZeroFarProgress > 0 && gteZeroFarProgress < 1, 'gte zero progress should be partial when approaching boundary from below');

  const gteZeroNearState = { ...state, resources: { ...state.resources, debt: -1 } };
  const gteZeroNearProgress = evaluateUnlockProgress(gteZeroFarAst.value, gteZeroNearState);
  assert(gteZeroNearProgress > gteZeroFarProgress, 'gte zero progress should increase as current gets closer to zero');

  const lteZeroFarAst = parseUnlockCondition({ compare: { path: 'resources.cap', op: 'lte', value: 0 } });
  assert.strictEqual(lteZeroFarAst.ok, true, 'lte zero AST should parse');
  const lteZeroFarProgress = evaluateUnlockProgress(lteZeroFarAst.value, state);
  assert(lteZeroFarProgress > 0 && lteZeroFarProgress < 1, 'lte zero progress should be partial when approaching boundary from above');

  const lteZeroNearState = { ...state, resources: { ...state.resources, cap: 1 } };
  const lteZeroNearProgress = evaluateUnlockProgress(lteZeroFarAst.value, lteZeroNearState);
  assert(lteZeroNearProgress > lteZeroFarProgress, 'lte zero progress should increase as current gets closer to zero');

  const missingPathAst = parseUnlockCondition({ resourceGte: { path: 'resources.unknown', value: 10 } });
  assert.strictEqual(missingPathAst.ok, true, 'missing path AST should parse');
  assert.strictEqual(evaluateUnlockProgress(missingPathAst.value, state), 0, 'missing numeric path has zero progress');
}

function runUnlockEvaluatorStatusCases() {
  const definition = {
    layers: [
      {
        id: 'idle',
        unlock: { always: true },
        sublayers: [
          {
            id: 'jobs',
            unlock: { compare: { path: 'resources.xp', op: 'gte', value: 10 } },
            sections: [
              {
                id: 'manual',
                unlock: { compare: { path: 'resources.gold', op: 'gte', value: 10 } },
                elements: [
                  {
                    id: 'foraging',
                    unlock: { flag: { path: 'resources.flags.unlocked' } },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const published = [];
  const evaluator = new UnlockEvaluator({
    definition,
    stateStore: {
      snapshot: () => ({
        canonical: {
          resources: {
            xp: 5,
            gold: 0,
            flags: { unlocked: false },
          },
        },
      }),
    },
    eventBus: {
      publish: (event) => {
        published.push(event);
      },
    },
  });

  const summary = evaluator.evaluateAll({ phase: 'end-of-tick' });
  const refs = [
    'layer:idle',
    'layer:idle/sublayer:jobs',
    'layer:idle/sublayer:jobs/section:manual',
    'layer:idle/sublayer:jobs/section:manual/element:foraging',
  ];

  assert.deepStrictEqual(Object.keys(summary.statusByRef), refs, 'statusByRef must include every collected target ref');
  assert.strictEqual(summary.statusByRef['layer:idle'].unlocked, true, 'always-unlocked layer must report unlocked');
  assert.strictEqual(summary.statusByRef['layer:idle'].progress, 1, 'unlocked nodes report progress=1');
  assert.strictEqual(
    summary.statusByRef['layer:idle'].showPlaceholder,
    false,
    'unlocked nodes should never show placeholders'
  );

  assert.strictEqual(summary.statusByRef['layer:idle/sublayer:jobs'].unlocked, false, 'locked sublayer remains locked');
  assert(summary.statusByRef['layer:idle/sublayer:jobs'].progress > 0, 'locked sublayer should report partial progress');
  assert.strictEqual(
    summary.statusByRef['layer:idle/sublayer:jobs'].showPlaceholder,
    true,
    'locked refs with partial progress should show placeholders'
  );

  assert.strictEqual(
    summary.statusByRef['layer:idle/sublayer:jobs/section:manual'].showPlaceholder,
    false,
    'locked refs with zero progress should not show placeholders'
  );
  assert.strictEqual(
    summary.statusByRef['layer:idle/sublayer:jobs/section:manual/element:foraging'].showPlaceholder,
    false,
    'locked refs with zero progress should keep placeholders hidden'
  );

  assert.deepStrictEqual(
    published.map((event) => event.payload.targetRef),
    ['layer:idle'],
    'UNLOCKED should only publish for transitioned refs'
  );
}

function run() {
  runNodeRefCases();
  runUnlockAstCases();
  runUnlockEvaluationCases();
  runUnlockProgressCases();
  runUnlockEvaluatorStatusCases();
  console.log('unlock-utils tests passed');
}

run();
