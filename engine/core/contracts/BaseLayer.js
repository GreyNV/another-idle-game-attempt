const REQUIRED_LAYER_METHODS = Object.freeze(['init', 'update', 'onEvent', 'getViewModel', 'destroy']);

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
  REQUIRED_LAYER_METHODS,
  assertValidBaseLayerInstance,
};
