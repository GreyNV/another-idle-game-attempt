/**
 * @typedef {object} LayerTickContext
 * @property {import('./EventBusContract').EventBusContract} eventBus
 * @property {import('./StateStoreContract').StateStoreContract} state
 * @property {import('./IntentRouterContract').IntentRouterContract} intentRouter
 * @property {import('./UnlockEvaluatorContract').UnlockEvaluatorContract} unlockEvaluator
 * @property {import('./ModifierResolverContract').ModifierResolverContract} modifierResolver
 */

/**
 * @typedef {object} BaseLayerContract
 * @property {string} id
 * @property {string} type
 * @property {(context: LayerTickContext) => void} init
 * @property {(context: LayerTickContext) => void} update
 * @property {(event: import('./EventBusContract').RuntimeEvent, context: LayerTickContext) => void} onEvent
 * @property {(context: LayerTickContext) => Record<string, unknown>} getViewModel
 * @property {(context: LayerTickContext) => void} destroy
 */

const REQUIRED_LAYER_METHODS = Object.freeze(['init', 'update', 'onEvent', 'getViewModel', 'destroy']);
const BASE_LAYER_CONTRACT = Object.freeze({
  name: 'BaseLayerContract',
  requiredMethods: REQUIRED_LAYER_METHODS,
});

/**
 * @param {unknown} layer
 * @param {{ type?: string, layerId?: string }} metadata
 */
function assertValidBaseLayerInstance(layer, metadata = {}) {
  const typeLabel = metadata.type || 'unknown';
  const layerIdLabel = metadata.layerId || 'unknown';

  if (!layer || typeof layer !== 'object') {
    throw new Error(`Layer plugin "${typeLabel}" must construct an object instance for layer "${layerIdLabel}".`);
  }

  if (layer.id !== layerIdLabel) {
    throw new Error(`Layer plugin "${typeLabel}" must expose id "${layerIdLabel}" on its instance.`);
  }

  if (layer.type !== typeLabel) {
    throw new Error(`Layer plugin "${typeLabel}" must expose type "${typeLabel}" on its instance.`);
  }

  for (const methodName of REQUIRED_LAYER_METHODS) {
    if (typeof layer[methodName] !== 'function') {
      throw new Error(`Layer "${layerIdLabel}" (${typeLabel}) is missing BaseLayer method: ${methodName}().`);
    }
  }
}

module.exports = {
  BASE_LAYER_CONTRACT,
  REQUIRED_LAYER_METHODS,
  assertValidBaseLayerInstance,
};
