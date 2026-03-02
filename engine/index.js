const { GameEngine } = require('./core/GameEngine');
const { LayerRegistry } = require('./plugins/LayerRegistry');
const {
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
  ValidationError,
} = require('./validation');
const { AuthoringFacade } = require('./authoring/AuthoringFacade');

module.exports = {
  GameEngine,
  LayerRegistry,
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
  ValidationError,
  AuthoringFacade,
};
