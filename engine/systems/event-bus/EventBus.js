const { getEventCatalogEntry } = require('../catalogs/eventCatalog');

class EventBus {
  constructor(options = {}) {
    this.strictValidation = Boolean(options.strictValidation);
    this.allowedPhase = options.allowedPhase || null;
    this.maxEventsPerTick = this.#normalizeMaxEventsPerTick(options.maxEventsPerTick);
    this.maxDispatchCyclesPerTick = this.#normalizeMaxDispatchCyclesPerTick(options.maxDispatchCyclesPerTick);
    this.queue = [];
    this.subscribers = new Map();
    this.nextToken = 1;
    this.lastDispatchReport = {
      cyclesProcessed: 0,
      eventsProcessed: 0,
      deliveredHandlers: 0,
      deferredEvents: 0,
      deferredDueToCycleLimit: false,
    };
  }

  publish(event) {
    const normalized = this.#normalizeEvent(event);

    if (this.strictValidation) {
      this.#validateAgainstCatalog(normalized);
    }

    // Queue-only publish invariant:
    // publish() never invokes subscribers directly and never mutates dispatch order.
    // Every event is appended and delivered by a later dispatchQueued() cycle.
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
    let delivered = 0;

    let processedEvents = 0;
    let cyclesProcessed = 0;

    while (this.queue.length > 0 && cyclesProcessed < this.maxDispatchCyclesPerTick) {
      cyclesProcessed += 1;

      // FIFO invariant:
      // - dispatchQueue preserves original publish order
      // - publishes during handler execution are queued for the next cycle
      const dispatchQueue = this.queue;
      this.queue = [];

      const snapshot = new Map();
      for (const [eventType, subscribers] of this.subscribers.entries()) {
        snapshot.set(eventType, subscribers.slice());
      }

      for (const event of dispatchQueue) {
        processedEvents += 1;
        if (processedEvents > this.maxEventsPerTick) {
          throw new Error(
            `EventBus dispatch exceeded maxEventsPerTick (${this.maxEventsPerTick}). Check for recursive publish loops.`
          );
        }

        const handlers = snapshot.get(event.type) || [];
        for (const subscriber of handlers) {
          subscriber.handler(event);
          delivered += 1;
        }
      }
    }

    const deferredEvents = this.queue.length;
    const deferredDueToCycleLimit = deferredEvents > 0;
    this.lastDispatchReport = {
      cyclesProcessed,
      eventsProcessed: processedEvents,
      deliveredHandlers: delivered,
      deferredEvents,
      deferredDueToCycleLimit,
    };

    return delivered;
  }

  getLastDispatchReport() {
    return { ...this.lastDispatchReport };
  }

  #normalizeMaxEventsPerTick(value) {
    if (value === undefined || value === null) {
      return 10000;
    }

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('maxEventsPerTick must be a positive integer when provided.');
    }

    return value;
  }

  #normalizeMaxDispatchCyclesPerTick(value) {
    if (value === undefined || value === null) {
      return 1000;
    }

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('maxDispatchCyclesPerTick must be a positive integer when provided.');
    }

    return value;
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
