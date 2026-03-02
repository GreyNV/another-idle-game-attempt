/**
 * @typedef {object} RuntimeEvent
 * @property {string} type
 * @property {Record<string, unknown>} [payload]
 * @property {number} [ts]
 * @property {string} [source]
 * @property {string|null} [phase]
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {object} EventBusDispatchReport
 * @property {number} cyclesProcessed
 * @property {number} eventsProcessed
 * @property {number} deliveredHandlers
 * @property {number} deferredEvents
 * @property {boolean} deferredDueToCycleLimit
 */

/**
 * @typedef {object} EventBusContract
 * @property {(event: RuntimeEvent) => void} publish
 * @property {(eventType: string, handler: (event: RuntimeEvent) => void, scope?: unknown) => string} subscribe
 * @property {(token: string) => boolean} unsubscribe
 * @property {() => number} dispatchQueued
 * @property {() => EventBusDispatchReport} getLastDispatchReport
 */

const EVENT_BUS_CONTRACT = Object.freeze({
  name: 'EventBusContract',
  requiredMethods: ['publish', 'subscribe', 'unsubscribe', 'dispatchQueued', 'getLastDispatchReport'],
});

module.exports = {
  EVENT_BUS_CONTRACT,
};
