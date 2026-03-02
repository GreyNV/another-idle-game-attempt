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
const { UIComposer } = require('../ui/UIComposer');

function createRuntimeSystems(options = {}) {
  const strictValidation = options.devModeStrict !== false;
  const definition = options.definition || { state: {}, layers: [] };

  const eventBus =
    options.eventBus ||
    new EventBus({
      strictValidation,
      maxEventsPerTick: options.maxEventsPerTick,
      maxDispatchCyclesPerTick: options.maxDispatchCyclesPerTick,
    });
  const stateStore = options.stateStore || new StateStore(definition.state || {});
  const timeSystem = options.timeSystem || new TimeSystem();
  const modifierResolver = options.modifierResolver || new ModifierResolver({ definition });
  const multiplierCompiler = options.multiplierCompiler || new MultiplierCompiler({ stateStore });
  const characteristicSystem =
    options.characteristicSystem ||
    new CharacteristicSystem({
      definition,
      stateStore,
    });
  const uiComposer = options.uiComposer || new UIComposer();

  const intentRouter =
    options.intentRouter ||
    new IntentRouter({
      strictValidation,
      isNodeLocked: options.isNodeLocked || (() => false),
    });

  const layerResetService =
    options.layerResetService ||
    new LayerResetService({
      definition,
      stateStore,
      eventBus,
    });

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
    uiComposer,
  };
}

module.exports = {
  createRuntimeSystems,
};
