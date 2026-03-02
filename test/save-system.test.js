const assert = require('assert');

const { SaveSystem } = require('../engine/systems/save/SaveSystem');

function runRoundTripCase() {
  const system = new SaveSystem({ schemaVersion: '1.2.0' });
  const snapshot = {
    canonical: { resources: { xp: 10, gold: 5 } },
    derived: { unlocks: { unlockedRefs: ['layer:idle'] } },
  };

  const payload = system.serialize(snapshot, { slot: 'autosave-1' });
  const restored = system.deserialize(payload);

  assert.strictEqual(payload.schemaVersion, '1.2.0');
  assert.deepStrictEqual(restored.snapshot, snapshot);
  assert.deepStrictEqual(restored.metadata, { slot: 'autosave-1' });
}

function runDeterministicSerializationCase() {
  const system = new SaveSystem({ schemaVersion: '1.2.0' });
  const snapshot = {
    canonical: { resources: { gold: 1, xp: 2 } },
    derived: { unlocks: { unlockedRefs: [] } },
  };

  const payloadA = system.serialize(snapshot, { source: 'tick-10' });
  const payloadB = system.serialize(snapshot, { source: 'tick-10' });

  assert.deepStrictEqual(payloadA, payloadB);
  assert.strictEqual(JSON.stringify(payloadA), JSON.stringify(payloadB));
}

function runMigrationCase() {
  const system = new SaveSystem({ schemaVersion: '1.2.0' });
  const baselinePayload = {
    schemaVersion: '1.2.0',
    snapshot: {
      canonical: { resources: { xp: 1 } },
      derived: {},
    },
    metadata: { slot: 'manual-1' },
  };

  const migrated = system.migrate(baselinePayload, '1.2.0');
  assert.deepStrictEqual(migrated, baselinePayload);

  assert.throws(
    () =>
      system.migrate(
        {
          schemaVersion: '1.1.0',
          snapshot: baselinePayload.snapshot,
          metadata: baselinePayload.metadata,
        },
        '1.2.0'
      ),
    /no migration path/
  );
}

runRoundTripCase();
runDeterministicSerializationCase();
runMigrationCase();

console.log('save-system tests passed');
