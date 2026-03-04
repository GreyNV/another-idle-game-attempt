import assert from 'node:assert/strict';

const entrypoint = await import('../engine/index.mjs');

assert.ok(
  Object.prototype.hasOwnProperty.call(entrypoint, 'progressAuthoringMetadata'),
  'ESM entrypoint should expose progressAuthoringMetadata as a named export'
);
assert.ok(entrypoint.progressAuthoringMetadata, 'progressAuthoringMetadata should be defined');

assert.ok(
  Object.prototype.hasOwnProperty.call(entrypoint, 'PROGRESS_ENTITY_KINDS'),
  'ESM entrypoint should expose PROGRESS_ENTITY_KINDS as a named export'
);
assert.deepStrictEqual(entrypoint.PROGRESS_ENTITY_KINDS, ['resources', 'routines', 'buyables', 'upgrades']);

console.log('engine-esm-entrypoint tests passed');
