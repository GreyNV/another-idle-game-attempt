const DIAGNOSTIC_CODES = Object.freeze({
  JSON_PARSE_ERROR: 'AUTHORING_JSON_PARSE',
  VALIDATION_ERROR: 'AUTHORING_VALIDATION',
  ENGINE_INIT_ERROR: 'AUTHORING_ENGINE_INIT',
  SIMULATION_ERROR: 'AUTHORING_SIMULATION',
  DIFF_INPUT_ERROR: 'AUTHORING_DIFF_INPUT',
});

/**
 * @typedef {Object} AuthoringDiagnostic
 * @property {string} code
 * @property {string} path
 * @property {string} message
 * @property {string} hint
 */

/**
 * @typedef {Object} AuthoringValidationResult
 * @property {boolean} ok
 * @property {AuthoringDiagnostic[]} diagnostics
 */

/**
 * @typedef {Object} AuthoringSessionDto
 * @property {string} id
 * @property {number} createdAt
 * @property {Record<string, unknown>} definitionMeta
 */

module.exports = {
  DIAGNOSTIC_CODES,
};
