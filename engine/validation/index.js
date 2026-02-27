const { parseGameDefinition } = require('./parser/parseGameDefinition');
const { validateGameDefinitionSchema } = require('./schema/validateGameDefinitionSchema');
const { validateReferences } = require('./references/validateReferences');
const { ValidationError } = require('./errors/ValidationError');

module.exports = {
  parseGameDefinition,
  validateGameDefinitionSchema,
  validateReferences,
  ValidationError,
};
