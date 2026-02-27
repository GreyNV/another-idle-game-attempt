const { parseGameDefinition } = require('../validation/parser/parseGameDefinition');

class GameEngine {
  constructor() {
    this.definition = null;
    this.initialized = false;
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
