const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadSimulationModel() {
  const filePath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'simulation', 'model.js');
  return import(pathToFileURL(filePath).href);
}

function loadPresets() {
  const filePath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'simulation', 'ScenarioPresets.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function run() {
  const { controlsFromPreset, buildSimulationPayload, buildIntentsByTick } = await loadSimulationModel();
  const presets = loadPresets();

  const controls = controlsFromPreset(presets, 'mid');
  assert.strictEqual(controls.presetKey, 'mid');
  assert.strictEqual(controls.ticks, presets.mid.scenario.ticks);
  assert.strictEqual(controls.horizonSec, presets.mid.scenario.horizonSec);
  assert.strictEqual(controls.dt, presets.mid.scenario.dt);
  assert.strictEqual(controls.snapshotIntervalSec, presets.mid.scenario.snapshotIntervalSec);
  assert.strictEqual(controls.intentRows.length >= 2, true, 'mid preset should map scripted intents into table rows');

  const payload = buildSimulationPayload({ schemaVersion: 'progress-authoring/1', progress: {} }, controls);
  assert.strictEqual(payload.scenario.ticks, controls.ticks);
  assert.strictEqual(payload.scenario.horizonSec, controls.horizonSec);
  assert.strictEqual(payload.scenario.dt, controls.dt);
  assert.strictEqual(payload.scenario.snapshotIntervalSec, controls.snapshotIntervalSec);
  assert.strictEqual(Array.isArray(payload.scenario.intentsByTick), true);
  assert.strictEqual(payload.scenario.intentsByTick.length, controls.ticks);

  const built = buildIntentsByTick(
    [
      { id: 'a', tick: 0, type: 'TEST_INTENT', payloadJson: '{"ok":true}' },
      { id: 'b', tick: 1, type: 'BROKEN_INTENT', payloadJson: '{not-json}' },
      { id: 'c', tick: 99999, type: 'OUT_OF_RANGE', payloadJson: '{}' },
    ],
    3
  );

  assert.deepStrictEqual(built[0][0], { type: 'TEST_INTENT', payload: { ok: true } });
  assert.deepStrictEqual(built[1][0], { type: 'BROKEN_INTENT', payload: {} });
  assert.strictEqual(built[2].length, 0);

  console.log('author-ui-simulation-presets tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
