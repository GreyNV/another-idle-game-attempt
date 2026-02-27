const { EventBus } = require('./event-bus/EventBus');
const { IntentRouter } = require('./intent/IntentRouter');
const { StateStore } = require('./state-store/StateStore');
const { TimeSystem } = require('./time/TimeSystem');
const { ModifierResolver } = require('./modifiers/ModifierResolver');
const { LayerResetService } = require('./reset/LayerResetService');
const { UIComposer } = require('../ui/UIComposer');

function createRuntimeSystems(options = {}) {
  const strictValidation = options.devModeStrict !== false;
  const definition = options.definition || { state: {}, layers: [] };

  const eventBus = options.eventBus || new EventBus({ strictValidation });
  const stateStore = options.stateStore || new StateStore(definition.state || {});
  const timeSystem = options.timeSystem || new TimeSystem();
  const modifierResolver = options.modifierResolver || new ModifierResolver({ definition });
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

  return {
    eventBus,
    stateStore,
    timeSystem,
    modifierResolver,
    intentRouter,
    layerResetService,
    uiComposer,
  };
}

module.exports = {
  createRuntimeSystems,
};
