const { parseGameDefinition } = require('../validation/parser/parseGameDefinition');
const { EventBus } = require('../systems/event-bus/EventBus');
const { IntentRouter } = require('../systems/intent/IntentRouter');

class GameEngine {
  constructor(options = {}) {
    const devModeStrict = options.devModeStrict !== undefined ? Boolean(options.devModeStrict) : true;

    this.definition = null;
    this.initialized = false;
    this.eventBus = new EventBus({ strictValidation: devModeStrict });
    this.intentRouter = new IntentRouter({ strictValidation: devModeStrict });
  }

  /**
   * Fail engine initialization on any schema/reference error.
   * @param {string|Record<string, unknown>} rawDefinition
   */
  initialize(rawDefinition) {
    this.definition = parseGameDefinition(rawDefinition);
    this.initialized = true;
  }
}

module.exports = {
  GameEngine,
};
