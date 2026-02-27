const { getIntentCatalogEntry, LOCK_CHECK_POLICIES } = require('../catalogs/intentCatalog');

class IntentRouter {
  constructor(options = {}) {
    this.strictValidation = options.strictValidation !== false;
    this.handlers = new Map();
    this.isNodeLocked = options.isNodeLocked || (() => false);
  }

  register(intentType, handler) {
    if (typeof intentType !== 'string' || intentType.length === 0) {
      throw new Error('intentType must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error('handler must be a function');
    }

    this.handlers.set(intentType, handler);
  }

  route(intent) {
    const normalized = this.#normalizeIntent(intent);
    const entry = getIntentCatalogEntry(normalized.type);

    if (!entry) {
      return {
        ok: false,
        code: 'INTENT_CATALOG_MISSING',
        reason: `Intent catalog missing entry for type ${normalized.type}`,
      };
    }

    if (this.strictValidation) {
      const payloadError = entry.validatePayload(normalized.payload);
      if (payloadError) {
        return {
          ok: false,
          code: 'INTENT_PAYLOAD_INVALID',
          reason: payloadError,
        };
      }
    }

    if (entry.lockCheckPolicy === LOCK_CHECK_POLICIES.REJECT_IF_TARGET_LOCKED) {
      const targetRef = normalized.payload.targetRef;
      if (targetRef && this.isNodeLocked(targetRef)) {
        return {
          ok: false,
          code: 'INTENT_TARGET_LOCKED',
          reason: `Target node is locked: ${targetRef}`,
          routingTarget: entry.routingTarget,
        };
      }
    }

    const handler = this.handlers.get(normalized.type);
    if (!handler) {
      return {
        ok: false,
        code: 'INTENT_HANDLER_MISSING',
        reason: `No handler registered for intent ${normalized.type}`,
        routingTarget: entry.routingTarget,
      };
    }

    const result = handler(normalized, entry);
    return {
      ok: true,
      code: 'INTENT_ROUTED',
      routingTarget: entry.routingTarget,
      result,
    };
  }

  #normalizeIntent(intent) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
      throw new Error('intent must be an object');
    }
    if (typeof intent.type !== 'string' || intent.type.length === 0) {
      throw new Error('intent.type must be a non-empty string');
    }

    return {
      type: intent.type,
      payload: intent.payload || {},
      source: intent.source || 'ui',
    };
  }
}

module.exports = {
  IntentRouter,
};
