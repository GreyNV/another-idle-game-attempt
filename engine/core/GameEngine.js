const { parseGameDefinition } = require('../validation/parser/parseGameDefinition');
const { createRuntimeSystems } = require('../systems/createRuntimeSystems');
const { LayerRegistry } = require('../plugins/LayerRegistry');
const { registerBuiltinLayers } = require('../plugins/layers/registerBuiltinLayers');
const { EVENT_CATALOG } = require('../systems/catalogs/eventCatalog');

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
    this.runtimeOptions = options;
    this.devModeStrict = devModeStrict;
    this.eventBus = null;
    this.stateStore = null;
    this.intentRouter = null;
    this.timeSystem = null;
    this.modifierResolver = null;
    this.layerResetService = null;
    this.unlockEvaluator = null;
    this.uiComposer = null;
    this.layerRegistry = options.layerRegistry || new LayerRegistry();
    this.layerInstances = [];
    this.runtimeSubscriptionTokens = [];
    this.layerEventSubscriptionTokens = [];

    this.onLayerUpdate = typeof options.onLayerUpdate === 'function' ? options.onLayerUpdate : () => {};
    this.onUnlockEvaluation = typeof options.onUnlockEvaluation === 'function' ? options.onUnlockEvaluation : () => {};
    this.onRenderCompose =
      typeof options.onRenderCompose === 'function'
        ? options.onRenderCompose
        : (context) =>
            this.uiComposer.compose(context.definition, {
              unlockState: context.summary.unlocks,
              isUnlocked: (nodeRef) => this.#isUnlockedRef(nodeRef, context.summary.unlocks),
            });

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

    const systems = createRuntimeSystems({
      ...this.runtimeOptions,
      devModeStrict: this.devModeStrict,
      definition: this.definition,
    });

    this.eventBus = systems.eventBus;
    this.stateStore = systems.stateStore;
    this.intentRouter = systems.intentRouter;
    this.timeSystem = systems.timeSystem;
    this.modifierResolver = systems.modifierResolver;
    this.layerResetService = systems.layerResetService;
    this.unlockEvaluator = systems.unlockEvaluator;
    this.uiComposer = systems.uiComposer;

    registerBuiltinLayers(this.layerRegistry);
    this.layerInstances = this.#instantiateLayersFromDefinition();

    this.#wireRuntimeSystems();
    this.#wireLayerEventSubscriptions();
    this.initialized = true;
  }

  /**
   * Tear down runtime subscriptions and layer instances.
   * Safe to call multiple times.
   */
  destroy() {
    for (const token of this.runtimeSubscriptionTokens) {
      this.eventBus.unsubscribe(token);
    }
    this.runtimeSubscriptionTokens = [];

    for (const token of this.layerEventSubscriptionTokens) {
      this.eventBus.unsubscribe(token);
    }
    this.layerEventSubscriptionTokens = [];

    for (const layerInstance of this.layerInstances) {
      layerInstance.destroy();
    }
    this.layerInstances = [];

    this.initialized = false;
    this.definition = null;
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
   * 2) EventBus.dispatchQueued() processes queue FIFO and snapshots subscribers per dispatch cycle.
   * 3) Events published by handlers during event-dispatch are queued for the next dispatch cycle in
   *    the same tick. Dispatch cycles are FIFO and subscriber-snapshot based.
   * 4) Guardrails:
   *    - maxEventsPerTick throws on runaway recursive publishes.
   *    - maxDispatchCyclesPerTick defers remaining queued events to the next tick.
   */
  tick() {
    this.#assertInitialized();

    this.phaseCursor = -1;
    const summary = {
      intentsRouted: [],
      dt: 0,
      updatedLayers: [],
      dispatchedHandlers: 0,
      dispatch: null,
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
    summary.dispatch = this.eventBus.getLastDispatchReport();

    this.#enterPhase(ENGINE_PHASES.UNLOCK_EVALUATION);
    summary.unlocks = this.#runUnlockEvaluationPhase(summary);

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

    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      const layerInstance = this.layerInstances[index];
      // Deterministic invariant: process in exact parsed JSON layers[] order (no sorting/reordering).
      layerInstance.update(dt);
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
      stateStore: this.stateStore,
      modifierResolver: this.modifierResolver,
      layerResetService: this.layerResetService,
      intentRouter: this.intentRouter,
    };
  }

  #runUnlockEvaluationPhase(summary) {
    const unlockSummary = this.unlockEvaluator.evaluateAll({ phase: 'end-of-tick' });
    this.stateStore.setDerived('unlocks', unlockSummary);
    this.onUnlockEvaluation(this.#buildPhaseContext({ ...summary, unlocks: unlockSummary }), unlockSummary);
    return unlockSummary;
  }

  #wireRuntimeSystems() {
    this.intentRouter.register('REQUEST_LAYER_RESET', (intent) => {
      this.eventBus.publish({
        type: 'LAYER_RESET_REQUESTED',
        payload: {
          layerId: intent.payload.layerId,
          reason: intent.payload.reason,
          sourceIntent: intent.type,
        },
      });

      return this.layerResetService.preview(intent.payload.layerId);
    });

    const token = this.eventBus.subscribe(
      'LAYER_RESET_REQUESTED',
      (event) => {
        this.layerResetService.execute({
          layerId: event.payload.layerId,
          reason: event.payload.reason,
        });
      },
      'LayerResetService'
    );
    this.runtimeSubscriptionTokens.push(token);
  }

  #wireLayerEventSubscriptions() {
    const eventTypes = Object.entries(EVENT_CATALOG)
      .filter(([, catalogEntry]) => Array.isArray(catalogEntry.consumers))
      .map(([eventType, catalogEntry]) => ({ eventType, consumers: catalogEntry.consumers }));

    for (const layerInstance of this.layerInstances) {
      for (const { eventType, consumers } of eventTypes) {
        if (!consumers.includes(layerInstance.type)) {
          continue;
        }

        const token = this.eventBus.subscribe(
          eventType,
          (event) => {
            layerInstance.onEvent(event);
          },
          `Layer:${layerInstance.id}`
        );
        this.layerEventSubscriptionTokens.push(token);
      }
    }
  }

  #instantiateLayersFromDefinition() {
    const layers = Array.isArray(this.definition.layers) ? this.definition.layers : [];

    return layers.map((layerDefinition) => {
      const layerContext = this.#buildLayerContext(layerDefinition);
      const layerInstance = this.layerRegistry.createLayer(layerDefinition, layerContext);
      layerInstance.init(layerContext);
      return layerInstance;
    });
  }

  #buildLayerContext(layerDefinition) {
    const layerStatePath = `layers.${layerDefinition.id}`;

    return {
      layerId: layerDefinition.id,
      layerType: layerDefinition.type,
      eventBus: {
        publish: (event) => this.eventBus.publish(event),
        subscribe: (eventType, handler, scope) => this.eventBus.subscribe(eventType, handler, scope),
        unsubscribe: (token) => this.eventBus.unsubscribe(token),
      },
      state: {
        get: (path) => this.stateStore.get(path),
        getOwn: () => this.stateStore.get(layerStatePath),
        setOwn: (pathSuffix, value) => this.stateStore.set(this.#buildLayerWritePath(layerStatePath, pathSuffix), value),
        patchOwn: (pathSuffix, partial) => this.stateStore.patch(this.#buildLayerWritePath(layerStatePath, pathSuffix), partial),
        snapshot: () => this.stateStore.snapshot(),
      },
      modifierResolver: this.modifierResolver,
      layerResetService: this.layerResetService,
    };
  }


  #isUnlockedRef(nodeRef, unlockSummary) {
    if (!unlockSummary) {
      return true;
    }

    if (Array.isArray(unlockSummary.unlockedRefs)) {
      return unlockSummary.unlockedRefs.includes(nodeRef);
    }

    if (unlockSummary.unlocked && typeof unlockSummary.unlocked === 'object') {
      return Boolean(unlockSummary.unlocked[nodeRef]);
    }

    return true;
  }

  #buildLayerWritePath(layerStatePath, pathSuffix) {
    if (pathSuffix === undefined || pathSuffix === null || pathSuffix === '') {
      return layerStatePath;
    }

    if (typeof pathSuffix !== 'string') {
      throw new Error('Layer state path suffix must be a string when provided.');
    }

    if (pathSuffix.startsWith('layers.')) {
      throw new Error('Cross-layer state write denied: use layer-local path suffixes only.');
    }

    return `${layerStatePath}.${pathSuffix}`;
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
