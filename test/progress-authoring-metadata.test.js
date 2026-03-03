const assert = require('assert');

const { progressAuthoringMetadata } = require('../engine');

function run() {
  const { kinds, palette } = progressAuthoringMetadata;
  const allowedKinds = Object.keys(kinds);

  assert.deepStrictEqual(
    allowedKinds,
    ['resources', 'routines', 'buyables', 'upgrades'],
    'allowed entity kinds should stay deterministic'
  );

  const groupedKinds = palette.groups.flatMap((group) => group.kinds);
  assert.deepStrictEqual(groupedKinds, allowedKinds, 'palette groups should include all allowed kinds in order');

  for (const kind of allowedKinds) {
    const kindMetadata = kinds[kind];

    assert.strictEqual(kindMetadata.kind, kind, `${kind} kind key should match metadata.kind`);
    assert.strictEqual(typeof palette.labels[kind], 'string', `${kind} should expose a palette label`);
    assert.ok(palette.labels[kind].length > 0, `${kind} palette label should not be empty`);

    assert.strictEqual(kindMetadata.output.sectionPath, `progress.${kind}`);
    assert.strictEqual(kindMetadata.output.orderPath, `progress.${kind}.order`);
    assert.strictEqual(kindMetadata.output.byIdPath, `progress.${kind}.byId`);
    assert.strictEqual(kindMetadata.output.entryPathTemplate, `progress.${kind}.byId.{id}`);

    const fieldsByKey = Object.fromEntries(kindMetadata.fields.map((field) => [field.key, field]));

    for (const field of kindMetadata.fields) {
      assert.strictEqual(
        field.persistedPath,
        `progress.${kind}.byId.{id}.${field.key}`,
        `${kind}.${field.key} persistedPath must align to GameDefinition output`
      );

      if (field.required) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(kindMetadata.defaultTemplate, field.key),
          `${kind}.${field.key} required field must have a default`
        );
      }
    }

    assert.strictEqual(fieldsByKey.id.required, true, `${kind}.id should be required`);
    assert.strictEqual(fieldsByKey.id.input.kind, 'id', `${kind}.id should use id input`);
  }

  console.log('progress-authoring-metadata tests passed');
}

run();
