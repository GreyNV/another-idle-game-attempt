const { ValidationError } = require('../errors/ValidationError');
const { validateGameDefinitionSchema } = require('../schema/validateGameDefinitionSchema');
const { validateReferences } = require('../references/validateReferences');

/**
 * Parse and validate a game definition JSON payload.
 * Startup policy: fail-fast on any schema/reference error.
 *
 * @param {string|Record<string, unknown>} rawDefinition
 * @returns {Record<string, unknown>}
 */
function parseGameDefinition(rawDefinition) {
  const parsed = typeof rawDefinition === 'string' ? JSON.parse(rawDefinition) : rawDefinition;

  const schemaIssues = validateGameDefinitionSchema(parsed);
  const refIssues = validateReferences(parsed);
  const issues = [...schemaIssues, ...refIssues];

  if (issues.length > 0) {
    throw new ValidationError(issues);
  }

  return parsed;
}

module.exports = {
  parseGameDefinition,
};
