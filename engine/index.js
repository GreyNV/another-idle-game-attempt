const { GameEngine } = require('./core/GameEngine');
const { LayerRegistry } = require('./plugins/LayerRegistry');
const {
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
  ValidationError,
} = require('./validation');

module.exports = {
  GameEngine,
  LayerRegistry,
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
  ValidationError,
};
