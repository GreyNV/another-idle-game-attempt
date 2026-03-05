const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { AuthoringFacade } = require('../engine');

async function loadSimulationModel() {
  const filePath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'simulation', 'model.js');
  return import(pathToFileURL(filePath).href);
}

function loadPresets() {
  const filePath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'simulation', 'ScenarioPresets.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadValidDefinition() {
  const fixturePath = path.join(__dirname, '..', 'engine', 'validation', 'fixtures', 'valid-definition.json');
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

async function run() {
  const facade = new AuthoringFacade();
  const { controlsFromPreset, buildSimulationPayload } = await loadSimulationModel();
  const presets = loadPresets();
  const definition = loadValidDefinition();

  const controls = controlsFromPreset(presets, 'early');
  const payload = buildSimulationPayload(definition, {
    ...controls,
    ticks: 3,
    horizonSec: 0.3,
    intentsByTick: undefined,
    intentRows: [],
  });

  const firstRun = facade.simulate(payload.definitionJson, payload.scenario, payload.options || {});
  const secondRun = facade.simulate(payload.definitionJson, payload.scenario, payload.options || {});

  assert.strictEqual(firstRun.ok, true);
  assert.strictEqual(secondRun.ok, true);
  assert.strictEqual(firstRun.simulation.report.hash.algorithm, secondRun.simulation.report.hash.algorithm);
  assert.strictEqual(firstRun.simulation.report.hash.value, secondRun.simulation.report.hash.value);
  assert.strictEqual(firstRun.simulation.runId, secondRun.simulation.runId);

  console.log('authoring-simulation-hash-stability tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
