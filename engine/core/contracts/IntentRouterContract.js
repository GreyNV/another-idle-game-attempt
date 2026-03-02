/**
 * @typedef {object} RuntimeIntent
 * @property {string} type
 * @property {Record<string, unknown>} [payload]
 * @property {string} [source]
 */

/**
 * @typedef {object} IntentRouteResult
 * @property {boolean} ok
 * @property {string} code
 * @property {string} [reason]
 * @property {string} [routingTarget]
 * @property {unknown} [result]
 */

/**
 * @typedef {object} IntentRouterContract
 * @property {(intentType: string, handler: (intent: RuntimeIntent, entry: unknown) => unknown) => void} register
 * @property {(intent: RuntimeIntent) => IntentRouteResult} route
 */

const INTENT_ROUTER_CONTRACT = Object.freeze({
  name: 'IntentRouterContract',
  requiredMethods: ['register', 'route'],
});

module.exports = {
  INTENT_ROUTER_CONTRACT,
};
