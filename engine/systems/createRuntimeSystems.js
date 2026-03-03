const { EventBus } = require('./event-bus/EventBus');
const { IntentRouter } = require('./intent/IntentRouter');
const { StateStore } = require('./state-store/StateStore');
const { TimeSystem } = require('./time/TimeSystem');
const { ModifierResolver } = require('./modifiers/ModifierResolver');
const { MultiplierCompiler } = require('./modifiers/MultiplierCompiler');
const { LayerResetService } = require('./reset/LayerResetService');
const { UnlockEvaluator } = require('./unlocks/UnlockEvaluator');
const { RoutineSystem } = require('./routines/RoutineSystem');
const { CharacteristicSystem } = require('./stats/CharacteristicSystem');
const { SaveSystem } = require('./save/SaveSystem');
const { DEFAULT_COMPATIBILITY_POLICY } = require('../validation/schema/schemaVersionPolicy');
const { UIComposer } = require('../ui/UIComposer');

/** @typedef {import('../core/contracts/EventBusContract').EventBusContract} EventBusContract */
/** @typedef {import('../core/contracts/StateStoreContract').StateStoreContract} StateStoreContract */
/** @typedef {import('../core/contracts/IntentRouterContract').IntentRouterContract} IntentRouterContract */
/** @typedef {import('../core/contracts/UnlockEvaluatorContract').UnlockEvaluatorContract} UnlockEvaluatorContract */
/** @typedef {import('../core/contracts/ModifierResolverContract').ModifierResolverContract} ModifierResolverContract */

function createRuntimeSystems(options = {}) {
  const strictValidation = options.devModeStrict !== false;
  const definition = options.definition || { state: {}, layers: [] };
  const schemaVersionPolicy = options.schemaVersionPolicy || DEFAULT_COMPATIBILITY_POLICY;
  const schemaVersion =
    (definition && definition.meta && definition.meta.schemaVersion) ||
    `${schemaVersionPolicy.supportedMajor}.${schemaVersionPolicy.minimumMinor}.0`;

  /** @type {EventBusContract} */
  const eventBus =
    options.eventBus ||
    new EventBus({
      strictValidation,
      maxEventsPerTick: options.maxEventsPerTick,
      maxDispatchCyclesPerTick: options.maxDispatchCyclesPerTick,
    });
  /** @type {StateStoreContract} */
  const stateStore = options.stateStore || new StateStore(definition.state || {});
  const timeSystem =
    options.timeSystem ||
    new TimeSystem({
      tickRate: options.tickRate,
      now: options.now,
    });
  /** @type {ModifierResolverContract} */
  const modifierResolver = options.modifierResolver || new ModifierResolver({ definition });
  const multiplierCompiler = options.multiplierCompiler || new MultiplierCompiler({ stateStore });
  const characteristicSystem =
    options.characteristicSystem ||
    new CharacteristicSystem({
      definition,
      stateStore,
    });
  const uiComposer = options.uiComposer || new UIComposer();
  const saveSystem =
    options.saveSystem ||
    new SaveSystem({
      schemaVersion,
      compatibilityPolicy: schemaVersionPolicy,
    });

  const hasInjectedNodeLockResolver = typeof options.isNodeLocked === 'function';
  if (!options.intentRouter && strictValidation && !hasInjectedNodeLockResolver) {
    throw new Error(
      'createRuntimeSystems requires an explicit isNodeLocked callback when constructing IntentRouter in strict mode.'
    );
  }

  /** @type {IntentRouterContract} */
  const intentRouter =
    options.intentRouter ||
    new IntentRouter({
      strictValidation,
      // Deterministic dependency injection rule:
      // production/strict runtime must provide explicit lock resolution from GameEngine unlock snapshots.
      isNodeLocked: hasInjectedNodeLockResolver ? options.isNodeLocked : () => false,
    });

  const layerResetService =
    options.layerResetService ||
    new LayerResetService({
      definition,
      stateStore,
      eventBus,
    });

  /** @type {UnlockEvaluatorContract} */
  const unlockEvaluator =
    options.unlockEvaluator ||
    new UnlockEvaluator({
      definition,
      stateStore,
      eventBus,
    });

  const routineSystem =
    options.routineSystem ||
    new RoutineSystem({
      definition,
      stateStore,
      modifierResolver,
      multiplierCompiler,
      characteristicSystem,
      eventBus,
    });

  return {
    eventBus,
    stateStore,
    timeSystem,
    modifierResolver,
    multiplierCompiler,
    characteristicSystem,
    intentRouter,
    layerResetService,
    unlockEvaluator,
    routineSystem,
    saveSystem,
    uiComposer,
  };
}

module.exports = {
  createRuntimeSystems,
};
