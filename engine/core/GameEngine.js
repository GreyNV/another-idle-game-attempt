const { parseGameDefinition } = require('../validation/parser/parseGameDefinition');
const { EventBus } = require('../systems/event-bus/EventBus');
const { IntentRouter } = require('../systems/intent/IntentRouter');

const ENGINE_PHASES = Object.freeze({
  INPUT: 'input',
  TIME: 'time',
  LAYER_UPDATE: 'layer-update',
  EVENT_DISPATCH: 'event-dispatch',
  UNLOCK_EVALUATION: 'unlock-evaluation',
  RENDER: 'render',
});

const ENGINE_PHASE_SEQUENCE = Object.freeze([
  ENGINE_PHASES.INPUT,
  ENGINE_PHASES.TIME,
  ENGINE_PHASES.LAYER_UPDATE,
  ENGINE_PHASES.EVENT_DISPATCH,
  ENGINE_PHASES.UNLOCK_EVALUATION,
  ENGINE_PHASES.RENDER,
]);

class GameEngine {
  constructor(options = {}) {
    const devModeStrict = options.devModeStrict !== undefined ? Boolean(options.devModeStrict) : true;

    this.definition = null;
    this.initialized = false;
    this.eventBus = new EventBus({ strictValidation: devModeStrict });
    this.intentRouter = new IntentRouter({ strictValidation: devModeStrict });

    this.timeSystem = options.timeSystem || { getDeltaTime: () => 0 };
    this.onLayerUpdate = typeof options.onLayerUpdate === 'function' ? options.onLayerUpdate : () => {};
    this.onUnlockEvaluation = typeof options.onUnlockEvaluation === 'function' ? options.onUnlockEvaluation : () => ({});
    this.onRenderCompose = typeof options.onRenderCompose === 'function' ? options.onRenderCompose : () => null;

    this.intentQueue = [];
    this.lastTickSummary = null;
    this.currentPhase = null;
    this.phaseCursor = -1;
  }

  /**
   * Fail engine initialization on any schema/reference error.
   * @param {string|Record<string, unknown>} rawDefinition
   */
  initialize(rawDefinition) {
    this.definition = parseGameDefinition(rawDefinition);
    this.initialized = true;
  }

  /**
   * Queue user/UI intents for the next input phase.
   * UI remains read-only and emits intents only.
   * @param {Record<string, unknown>} intent
   */
  enqueueIntent(intent) {
    this.#assertInitialized();
    this.intentQueue.push(intent);
  }

  /**
   * Execute a deterministic tick loop.
   *
   * Same-tick event semantics:
   * 1) Events published during input/time/layer-update are dispatched in this same tick.
   * 2) EventBus.dispatchQueued() snapshots queue + subscribers at dispatch start.
   *    Any events published by dispatch handlers are enqueued for the next tick,
   *    preventing re-entrant same-cycle cascades while preserving FIFO order.
   */
  tick() {
    this.#assertInitialized();

    this.phaseCursor = -1;
    const summary = {
      intentsRouted: [],
      dt: 0,
      updatedLayers: [],
      dispatchedHandlers: 0,
      unlocks: null,
      ui: null,
    };

    this.#enterPhase(ENGINE_PHASES.INPUT);
    summary.intentsRouted = this.#runInputPhase();

    this.#enterPhase(ENGINE_PHASES.TIME);
    summary.dt = this.#runTimePhase();

    this.#enterPhase(ENGINE_PHASES.LAYER_UPDATE);
    summary.updatedLayers = this.#runLayerUpdatePhase(summary.dt);

    this.#enterPhase(ENGINE_PHASES.EVENT_DISPATCH);
    summary.dispatchedHandlers = this.eventBus.dispatchQueued();

    this.#enterPhase(ENGINE_PHASES.UNLOCK_EVALUATION);
    summary.unlocks = this.onUnlockEvaluation(this.#buildPhaseContext(summary));

    this.#enterPhase(ENGINE_PHASES.RENDER);
    summary.ui = this.onRenderCompose(this.#buildPhaseContext(summary));

    this.#exitPhaseLoop();
    this.lastTickSummary = summary;
    return summary;
  }

  #runInputPhase() {
    const queued = this.intentQueue;
    this.intentQueue = [];

    const routed = [];
    for (const intent of queued) {
      const result = this.intentRouter.route(intent);
      routed.push(result);
    }

    return routed;
  }

  #runTimePhase() {
    const dt = this.timeSystem.getDeltaTime();
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error(`TimeSystem.getDeltaTime() must return a finite, non-negative number. Received: ${dt}`);
    }

    return dt;
  }

  #runLayerUpdatePhase(dt) {
    const layers = Array.isArray(this.definition.layers) ? this.definition.layers : [];
    const updatedLayerIds = [];

    for (const layer of layers) {
      // Deterministic invariant: process in exact parsed JSON layers[] order (no sorting/reordering).
      this.onLayerUpdate(layer, this.#buildPhaseContext({ dt }));
      updatedLayerIds.push(layer.id);
    }

    return updatedLayerIds;
  }

  #buildPhaseContext(summary) {
    return {
      phase: this.currentPhase,
      summary,
      definition: this.definition,
      eventBus: this.eventBus,
      intentRouter: this.intentRouter,
    };
  }

  #enterPhase(phase) {
    const nextIndex = this.phaseCursor + 1;
    const expectedPhase = ENGINE_PHASE_SEQUENCE[nextIndex];
    if (expectedPhase !== phase) {
      throw new Error(`Phase order violation: expected "${expectedPhase}" but received "${phase}"`);
    }

    this.phaseCursor = nextIndex;
    this.currentPhase = phase;
    this.eventBus.allowedPhase = phase;
  }

  #exitPhaseLoop() {
    if (this.phaseCursor !== ENGINE_PHASE_SEQUENCE.length - 1) {
      throw new Error('Phase loop completed early; all phases must execute exactly once per tick.');
    }

    this.currentPhase = null;
    this.eventBus.allowedPhase = null;
  }

  #assertInitialized() {
    if (!this.initialized || !this.definition) {
      throw new Error('GameEngine must be initialized before runtime operations.');
    }
  }
}

module.exports = {
  ENGINE_PHASES,
  ENGINE_PHASE_SEQUENCE,
  GameEngine,
};
