const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { GameEngine, ENGINE_PHASE_SEQUENCE } = require('../engine/core/GameEngine');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8')
  );
}

function runPhaseOrderAndLayerOrderCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const phaseTrace = [];

  const engine = new GameEngine({
    timeSystem: {
      getDeltaTime() {
        phaseTrace.push('time-system');
        return 16;
      },
    },
    onLayerUpdate(layer, context) {
      phaseTrace.push(`layer:${context.phase}:${layer.id}`);
    },
    onUnlockEvaluation(context) {
      phaseTrace.push(`unlock:${context.phase}`);
      return { changed: [] };
    },
    onRenderCompose(context) {
      phaseTrace.push(`render:${context.phase}`);
      return { root: 'ui' };
    },
  });

  engine.initialize(validDefinition);
  const summary = engine.tick();

  assert.strictEqual(summary.dt, 16);
  assert.deepStrictEqual(summary.updatedLayers, ['idle']);
  assert.deepStrictEqual(summary.ui, { root: 'ui' });

  assert.deepStrictEqual(
    phaseTrace,
    ['time-system', 'layer:layer-update:idle', 'unlock:unlock-evaluation', 'render:render'],
    'hooks should run in deterministic phase order'
  );
  assert.deepStrictEqual(ENGINE_PHASE_SEQUENCE, [
    'input',
    'time',
    'layer-update',
    'event-dispatch',
    'unlock-evaluation',
    'render',
  ]);
}

function runSameTickDispatchCase() {
  const validDefinition = loadFixture('valid-definition.json');
  const delivered = [];

  const engine = new GameEngine({
    devModeStrict: false,
    timeSystem: { getDeltaTime: () => 1 },
    onLayerUpdate(_layer, context) {
      context.eventBus.publish({ type: 'LAYER_RESET_REQUESTED', payload: { layerId: 'idle' } });
    },
  });

  engine.initialize(validDefinition);
  engine.eventBus.subscribe('LAYER_RESET_REQUESTED', (event) => {
    delivered.push(event.type);
    engine.eventBus.publish({ type: 'LAYER_RESET_EXECUTED', payload: { layerId: event.payload.layerId } });
  });
  engine.eventBus.subscribe('LAYER_RESET_EXECUTED', (event) => {
    delivered.push(event.type);
  });

  const tickOne = engine.tick();
  assert.strictEqual(tickOne.dispatchedHandlers, 1, 'first tick dispatches only queue snapshot');
  assert.deepStrictEqual(delivered, ['LAYER_RESET_REQUESTED']);

  const tickTwo = engine.tick();
  assert.strictEqual(tickTwo.dispatchedHandlers, 2, 'second tick dispatches queued + next snapshot event');
  assert.deepStrictEqual(delivered, ['LAYER_RESET_REQUESTED', 'LAYER_RESET_EXECUTED', 'LAYER_RESET_REQUESTED']);
}

function runGuardrailCases() {
  const validDefinition = loadFixture('valid-definition.json');

  const engine = new GameEngine({
    timeSystem: { getDeltaTime: () => -1 },
  });
  engine.initialize(validDefinition);

  assert.throws(() => engine.tick(), /non-negative number/);
}

function run() {
  runPhaseOrderAndLayerOrderCase();
  runSameTickDispatchCase();
  runGuardrailCases();
  console.log('game-engine-phase-loop tests passed');
}

run();
