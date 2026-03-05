const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const { AuthoringFacade } = require('../engine');

function loadFixture(name) {
  const fixturePath = path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

async function loadModule(relativePath) {
  const modulePath = path.join(__dirname, '..', relativePath);
  return import(pathToFileURL(modulePath).href);
}

async function run() {
  const simulationState = await loadModule('apps/author-ui/src/simulation/simulationState.js');
  const compareRuns = await loadModule('apps/author-ui/src/simulation/compareRuns.js');

  const presetsPath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'simulation', 'ScenarioPresets.json');
  const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

  const earlyPreset = presets.early;
  assert.ok(earlyPreset, 'early preset is present');

  const mappedIntents = (earlyPreset.scenario.intentsByTick || []).flatMap((row, tick) =>
    (Array.isArray(row) ? row : []).map((intent) => ({
      tick,
      type: intent && intent.type,
      payload: intent && intent.payload,
    }))
  );
  const earlyDraft = simulationState.createScenarioDraftFromPreset({
    id: 'early',
    scenario: {
      ...earlyPreset.scenario,
      intents: mappedIntents,
    },
  });
  const payload = simulationState.buildSimulationPayload({ schemaVersion: 'progress-authoring/1', progress: {} }, earlyDraft);

  assert.strictEqual(payload.scenario.ticks, earlyPreset.scenario.ticks, 'preset ticks are wired');
  assert.strictEqual(payload.scenario.dt, earlyPreset.scenario.dt, 'preset dt is wired');
  assert.strictEqual(
    payload.scenario.intentsByTick[0][0].type,
    earlyPreset.scenario.intentsByTick[0][0].type,
    'intentsByTick payload is formed from preset rows'
  );

  const summary = compareRuns.summarizeDiffResult({
    equal: false,
    truncated: false,
    changes: [
      { op: 'add', path: '/resources/gold' },
      { op: 'remove', path: '/resources/xp' },
      { op: 'replace', path: '/layers/idle' },
    ],
  });
  const renderedSummary = compareRuns.formatCompareSummary(summary);

  assert.strictEqual(renderedSummary, '3 changes: +1 / -1 / ~1', 'compare summary rendering is deterministic');

  const facade = new AuthoringFacade();
  const definition = loadFixture('valid-definition.json');
  const deterministicScenario = {
    ...payload.scenario,
    seed: 77,
    ticks: 60,
    horizonSec: 6,
    dt: 100,
  };

  const first = facade.simulate(definition, deterministicScenario);
  const second = facade.simulate(definition, deterministicScenario);

  assert.strictEqual(first.ok, true, 'first simulation succeeded');
  assert.strictEqual(second.ok, true, 'second simulation succeeded');
  assert.strictEqual(
    first.simulation.report.hash.value,
    second.simulation.report.hash.value,
    'run hash is stable for same input scenario'
  );

  console.log('author-ui simulation tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
