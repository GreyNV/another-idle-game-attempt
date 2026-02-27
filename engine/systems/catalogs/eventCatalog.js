const PHASE_CONSTRAINTS = Object.freeze({
  INPUT: 'input',
  TIME: 'time',
  LAYER_UPDATE: 'layer-update',
  EVENT_DISPATCH: 'event-dispatch',
  UNLOCK_EVALUATION: 'unlock-evaluation',
  RENDER: 'render',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expectString(payload, key) {
  return typeof payload[key] === 'string' && payload[key].length > 0;
}

const EVENT_CATALOG = Object.freeze({
  UNLOCKED: Object.freeze({
    payloadSchema: Object.freeze({
      targetRef: 'string',
      reason: 'string?',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (!expectString(payload, 'targetRef')) {
        return 'payload.targetRef must be a non-empty string';
      }
      if (payload.reason !== undefined && typeof payload.reason !== 'string') {
        return 'payload.reason must be a string when provided';
      }
      return null;
    },
    producers: Object.freeze(['UnlockEvaluator']),
    consumers: Object.freeze(['progressLayer']),
    phaseConstraints: Object.freeze([PHASE_CONSTRAINTS.UNLOCK_EVALUATION]),
  }),
  LAYER_RESET_REQUESTED: Object.freeze({
    payloadSchema: Object.freeze({
      layerId: 'string',
      reason: 'string?',
      sourceIntent: 'string?',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (!expectString(payload, 'layerId')) {
        return 'payload.layerId must be a non-empty string';
      }
      if (payload.reason !== undefined && typeof payload.reason !== 'string') {
        return 'payload.reason must be a string when provided';
      }
      if (payload.sourceIntent !== undefined && typeof payload.sourceIntent !== 'string') {
        return 'payload.sourceIntent must be a string when provided';
      }
      return null;
    },
    producers: Object.freeze(['IntentRouter', 'progressLayer']),
    consumers: Object.freeze(['LayerResetService']),
    phaseConstraints: Object.freeze([PHASE_CONSTRAINTS.INPUT, PHASE_CONSTRAINTS.EVENT_DISPATCH]),
  }),
  LAYER_RESET_EXECUTED: Object.freeze({
    payloadSchema: Object.freeze({
      layerId: 'string',
      preservedKeys: 'string[]?',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (!expectString(payload, 'layerId')) {
        return 'payload.layerId must be a non-empty string';
      }
      if (payload.preservedKeys !== undefined) {
        if (!Array.isArray(payload.preservedKeys) || payload.preservedKeys.some((key) => typeof key !== 'string')) {
          return 'payload.preservedKeys must be an array of strings when provided';
        }
      }
      return null;
    },
    producers: Object.freeze(['LayerResetService']),
    consumers: Object.freeze(['progressLayer']),
    phaseConstraints: Object.freeze([PHASE_CONSTRAINTS.EVENT_DISPATCH]),
  }),
});

function getEventCatalogEntry(eventType) {
  return EVENT_CATALOG[eventType] || null;
}

module.exports = {
  EVENT_CATALOG,
  PHASE_CONSTRAINTS,
  getEventCatalogEntry,
};
