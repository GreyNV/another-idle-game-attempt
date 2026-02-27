const LOCK_CHECK_POLICIES = Object.freeze({
  NONE: 'none',
  REJECT_IF_TARGET_LOCKED: 'reject-if-target-locked',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureOptionalString(payload, key) {
  return payload[key] === undefined || typeof payload[key] === 'string';
}

const INTENT_CATALOG = Object.freeze({
  START_JOB: Object.freeze({
    payloadSchema: Object.freeze({
      targetRef: 'string',
      jobId: 'string',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (typeof payload.targetRef !== 'string' || payload.targetRef.length === 0) {
        return 'payload.targetRef must be a non-empty string';
      }
      if (typeof payload.jobId !== 'string' || payload.jobId.length === 0) {
        return 'payload.jobId must be a non-empty string';
      }
      return null;
    },
    routingTarget: 'progressLayer',
    lockCheckPolicy: LOCK_CHECK_POLICIES.REJECT_IF_TARGET_LOCKED,
  }),
  STOP_JOB: Object.freeze({
    payloadSchema: Object.freeze({
      targetRef: 'string',
      jobId: 'string',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (typeof payload.targetRef !== 'string' || payload.targetRef.length === 0) {
        return 'payload.targetRef must be a non-empty string';
      }
      if (typeof payload.jobId !== 'string' || payload.jobId.length === 0) {
        return 'payload.jobId must be a non-empty string';
      }
      return null;
    },
    routingTarget: 'progressLayer',
    lockCheckPolicy: LOCK_CHECK_POLICIES.REJECT_IF_TARGET_LOCKED,
  }),
  REQUEST_LAYER_RESET: Object.freeze({
    payloadSchema: Object.freeze({
      targetRef: 'string?',
      layerId: 'string',
      reason: 'string?',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (!ensureOptionalString(payload, 'targetRef')) {
        return 'payload.targetRef must be a string when provided';
      }
      if (typeof payload.layerId !== 'string' || payload.layerId.length === 0) {
        return 'payload.layerId must be a non-empty string';
      }
      if (!ensureOptionalString(payload, 'reason')) {
        return 'payload.reason must be a string when provided';
      }
      return null;
    },
    routingTarget: 'LayerResetService',
    lockCheckPolicy: LOCK_CHECK_POLICIES.REJECT_IF_TARGET_LOCKED,
  }),
  PULL_GACHA: Object.freeze({
    payloadSchema: Object.freeze({
      targetRef: 'string',
      bannerId: 'string',
      count: 'number',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (typeof payload.targetRef !== 'string' || payload.targetRef.length === 0) {
        return 'payload.targetRef must be a non-empty string';
      }
      if (typeof payload.bannerId !== 'string' || payload.bannerId.length === 0) {
        return 'payload.bannerId must be a non-empty string';
      }
      if (typeof payload.count !== 'number' || !Number.isFinite(payload.count) || payload.count <= 0) {
        return 'payload.count must be a positive finite number';
      }
      return null;
    },
    routingTarget: 'gachaLayer',
    lockCheckPolicy: LOCK_CHECK_POLICIES.REJECT_IF_TARGET_LOCKED,
  }),
  ACTIVATE_MINIGAME: Object.freeze({
    payloadSchema: Object.freeze({
      targetRef: 'string',
      minigameId: 'string',
    }),
    validatePayload(payload) {
      if (!isPlainObject(payload)) {
        return 'payload must be an object';
      }
      if (typeof payload.targetRef !== 'string' || payload.targetRef.length === 0) {
        return 'payload.targetRef must be a non-empty string';
      }
      if (typeof payload.minigameId !== 'string' || payload.minigameId.length === 0) {
        return 'payload.minigameId must be a non-empty string';
      }
      return null;
    },
    routingTarget: 'minigameLayer',
    lockCheckPolicy: LOCK_CHECK_POLICIES.REJECT_IF_TARGET_LOCKED,
  }),
});

function getIntentCatalogEntry(intentType) {
  return INTENT_CATALOG[intentType] || null;
}

module.exports = {
  INTENT_CATALOG,
  LOCK_CHECK_POLICIES,
  getIntentCatalogEntry,
};
