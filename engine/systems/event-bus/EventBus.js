const { getEventCatalogEntry } = require('../catalogs/eventCatalog');

class EventBus {
  constructor(options = {}) {
    this.strictValidation = Boolean(options.strictValidation);
    this.allowedPhase = options.allowedPhase || null;
    this.queue = [];
    this.subscribers = new Map();
    this.nextToken = 1;
  }

  publish(event) {
    const normalized = this.#normalizeEvent(event);

    if (this.strictValidation) {
      this.#validateAgainstCatalog(normalized);
    }

    this.queue.push(normalized);
  }

  subscribe(eventType, handler, scope) {
    if (typeof eventType !== 'string' || eventType.length === 0) {
      throw new Error('eventType must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error('handler must be a function');
    }

    const token = `sub_${this.nextToken++}`;
    const list = this.subscribers.get(eventType) || [];
    list.push({ token, handler, scope: scope || null });
    this.subscribers.set(eventType, list);
    return token;
  }

  unsubscribe(token) {
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      const filtered = subscribers.filter((subscriber) => subscriber.token !== token);
      if (filtered.length !== subscribers.length) {
        if (filtered.length === 0) {
          this.subscribers.delete(eventType);
        } else {
          this.subscribers.set(eventType, filtered);
        }
        return true;
      }
    }

    return false;
  }

  dispatchQueued() {
    const dispatchQueue = this.queue;
    this.queue = [];

    const snapshot = new Map();
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      snapshot.set(eventType, subscribers.slice());
    }

    let delivered = 0;
    for (const event of dispatchQueue) {
      const handlers = snapshot.get(event.type) || [];
      for (const subscriber of handlers) {
        subscriber.handler(event);
        delivered += 1;
      }
    }

    return delivered;
  }

  #normalizeEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error('event must be an object');
    }
    if (typeof event.type !== 'string' || event.type.length === 0) {
      throw new Error('event.type must be a non-empty string');
    }

    return {
      type: event.type,
      payload: event.payload || {},
      ts: event.ts || 0,
      source: event.source || 'unknown',
      phase: event.phase || this.allowedPhase || null,
      meta: event.meta || {},
    };
  }

  #validateAgainstCatalog(event) {
    const entry = getEventCatalogEntry(event.type);
    if (!entry) {
      throw new Error(`Event catalog missing entry for type: ${event.type}`);
    }

    const payloadError = entry.validatePayload(event.payload);
    if (payloadError) {
      throw new Error(`Invalid payload for event ${event.type}: ${payloadError}`);
    }

    if (event.phase && !entry.phaseConstraints.includes(event.phase)) {
      throw new Error(
        `Event ${event.type} cannot be published during phase ${event.phase}; allowed: ${entry.phaseConstraints.join(', ')}`
      );
    }
  }
}

module.exports = {
  EventBus,
};
