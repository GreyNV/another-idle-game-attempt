const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { AuthoringFacade } = require('../engine/authoring/AuthoringFacade');

function loadFixture(name) {
  const fixturePath = path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function run() {
  const facade = new AuthoringFacade();
  const definition = loadFixture('valid-mixed-layers.json');

  const created = facade.createSession(definition, { defaultDt: 1000 });
  assert.strictEqual(created.ok, true);
  assert.ok(created.session.id);
  assert.strictEqual(created.session.tick, 0);

  const firstStep = facade.stepSession(created.session.id, {
    ticks: 1,
    intents: [
      {
        type: 'ROUTINE_START',
        payload: {
          layerId: 'idle',
          routineId: 'starter-routine',
          poolId: 'workerSlots',
        },
      },
    ],
  });
  assert.strictEqual(firstStep.ok, true);
  assert.strictEqual(firstStep.session.tick, 1);

  const secondStep = facade.stepSession(created.session.id, { ticks: 2 });
  assert.strictEqual(secondStep.ok, true);
  assert.strictEqual(secondStep.session.tick, 3);
  assert.strictEqual(secondStep.snapshot.canonical.resources.xp > 0, true);

  const snap = facade.snapshotSession(created.session.id);
  assert.strictEqual(snap.ok, true);
  assert.strictEqual(snap.session.tick, 3);

  const disposed = facade.disposeSession(created.session.id);
  assert.strictEqual(disposed.ok, true);

  const missing = facade.stepSession(created.session.id, { ticks: 1 });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.diagnostics[0].code, 'AUTHORING_SESSION_NOT_FOUND');

  const reset = facade.createSession(definition, { defaultDt: 100 });
  assert.strictEqual(reset.ok, true);
  assert.notStrictEqual(reset.session.id, created.session.id);
  assert.strictEqual(reset.session.tick, 0);
  facade.disposeSession(reset.session.id);

  console.log('preview-session lifecycle tests passed');
}

run();
