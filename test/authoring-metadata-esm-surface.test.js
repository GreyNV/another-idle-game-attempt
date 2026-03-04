const assert = require('assert');

async function run() {
  const cjs = require('../engine/authoring/progressAuthoringMetadata');
  const esm = await import('../engine/index.mjs');

  assert.deepStrictEqual(
    esm.PROGRESS_ENTITY_KINDS,
    cjs.PROGRESS_ENTITY_KINDS,
    'ESM metadata kind list should match CJS source of truth'
  );

  assert.deepStrictEqual(
    esm.progressAuthoringMetadata,
    cjs.progressAuthoringMetadata,
    'ESM progress metadata should match CJS source of truth'
  );

  assert.deepStrictEqual(
    esm.asKindList(),
    cjs.asKindList(),
    'ESM asKindList should match CJS behavior'
  );

  console.log('authoring-metadata-esm-surface tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
