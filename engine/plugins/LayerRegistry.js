const { assertValidBaseLayerInstance } = require('../core/contracts/BaseLayer');

class LayerRegistry {
  constructor() {
    this.factoriesByType = new Map();
  }

  register(type, factory) {
    if (typeof type !== 'string' || type.trim().length === 0) {
      throw new Error('LayerRegistry.register(type, factory): type must be a non-empty string.');
    }

    if (typeof factory !== 'function') {
      throw new Error(`LayerRegistry.register("${type}"): factory must be a function.`);
    }

    if (this.factoriesByType.has(type)) {
      throw new Error(`LayerRegistry.register("${type}"): duplicate registration is not allowed.`);
    }

    this.factoriesByType.set(type, factory);
  }

  createLayer(runtimeDefinition, context) {
    if (!runtimeDefinition || typeof runtimeDefinition !== 'object') {
      throw new Error('LayerRegistry.createLayer(runtimeDefinition, context): runtimeDefinition must be an object.');
    }

    const layerType = runtimeDefinition.type;
    const layerId = runtimeDefinition.id;

    if (typeof layerType !== 'string' || layerType.length === 0) {
      throw new Error(`Layer definition for "${layerId || 'unknown'}" is missing a valid type.`);
    }

    const factory = this.factoriesByType.get(layerType);
    if (!factory) {
      throw new Error(`No layer plugin registered for type "${layerType}".`);
    }

    const layerInstance = factory({ definition: runtimeDefinition, context });
    assertValidBaseLayerInstance(layerInstance, { type: layerType, layerId });
    return layerInstance;
  }
}

module.exports = {
  LayerRegistry,
};
