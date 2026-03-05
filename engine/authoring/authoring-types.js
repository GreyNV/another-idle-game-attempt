const crypto = require('crypto');

const DIAGNOSTIC_CODES = Object.freeze({
  JSON_PARSE_ERROR: 'AUTHORING_JSON_PARSE',
  VALIDATION_ERROR: 'AUTHORING_VALIDATION',
  ENGINE_INIT_ERROR: 'AUTHORING_ENGINE_INIT',
  SIMULATION_ERROR: 'AUTHORING_SIMULATION',
  DIFF_INPUT_ERROR: 'AUTHORING_DIFF_INPUT',
  SESSION_NOT_FOUND: 'AUTHORING_SESSION_NOT_FOUND',
  SESSION_STEP_INPUT_INVALID: 'AUTHORING_SESSION_STEP_INPUT_INVALID',
});

const AUTHORING_REPORT_DEFAULTS = Object.freeze({
  eventTailLimit: 25,
  defaultSeed: 0,
  hashAlgorithm: 'sha256',
});

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const serializedEntries = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
  return `{${serializedEntries.join(',')}}`;
}

function hashDeterministicPayload(value, algorithm = AUTHORING_REPORT_DEFAULTS.hashAlgorithm) {
  const serialized = stableSerialize(value);
  const hash = crypto.createHash(algorithm).update(serialized).digest('hex');
  return {
    algorithm,
    serialized,
    hash,
  };
}

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
 * @typedef {Object} UnlockTransitionDto
 * @property {string} targetRef
 * @property {number} tick
 */

/**
 * @typedef {Object} ResourceKpiDto
 * @property {number} start
 * @property {number} end
 * @property {number} min
 * @property {number} max
 */

/**
 * @typedef {Object} AuthoringSimulationReportDto
 * @property {number} tickCount
 * @property {number} dt
 * @property {number} seed
 * @property {Record<string, number>} intentsRouted
 * @property {{ countsByType: Record<string, number>, tail: Array<{ tick: number, type: string, payload: Record<string, unknown> }> }} eventsDispatched
 * @property {UnlockTransitionDto[]} unlockTransitions
 * @property {Record<string, ResourceKpiDto>} resourceKpis
 * @property {Array<{ code: string, tick: number, message: string }>} warnings
 * @property {{ algorithm: string, value: string }} hash
 */


/**
 * @typedef {Object} RecordingSnapshotDto
 * @property {number} tick
 * @property {number} tSec
 * @property {Record<string, number>} resources
 * @property {Record<string, number>} netRates
 */

/**
 * @typedef {Object} RecordingEventDto
 * @property {'routine_completion'|'purchase'} kind
 * @property {number} tick
 * @property {number} tSec
 */

/**
 * @typedef {Object} RecordingDto
 * @property {RecordingSnapshotDto[]} snapshots
 * @property {RecordingEventDto[]} events
 */

/**
 * @typedef {Object} AuthoringSessionDto
 * @property {string} id
 * @property {number} createdAt
 * @property {Record<string, unknown>} definitionMeta
 */

module.exports = {
  AUTHORING_REPORT_DEFAULTS,
  DIAGNOSTIC_CODES,
  hashDeterministicPayload,
  stableSerialize,
};

