function deepClone(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = deepClone(entry);
  }
  return result;
}

function getPath(root, path) {
  const parts = path.split('.');
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function setPath(root, path, value) {
  const parts = path.split('.');
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = deepClone(value);
}

class LayerResetService {
  constructor(options = {}) {
    this.definition = options.definition || { layers: [], state: {} };
    this.stateStore = options.stateStore;
    this.eventBus = options.eventBus;
  }

  preview(layerId) {
    const layer = this.#findLayer(layerId);
    const keepPaths = this.#getKeepPaths(layer);

    return {
      layerId,
      keepPaths,
      hasKeepRules: keepPaths.length > 0,
    };
  }

  execute(input) {
    const layerId = typeof input === 'string' ? input : input.layerId;
    const reason = input && typeof input === 'object' ? input.reason : undefined;

    const layer = this.#findLayer(layerId);
    const keepPaths = this.#getKeepPaths(layer);

    const currentSnapshot = this.stateStore.snapshot();
    const currentCanonical = currentSnapshot.canonical;
    const baseCanonical = deepClone(this.definition.state || {});

    for (const keepPath of keepPaths) {
      const preservedValue = getPath(currentCanonical, keepPath);
      if (preservedValue !== undefined) {
        setPath(baseCanonical, keepPath, preservedValue);
      }
    }

    this.stateStore.canonicalState = baseCanonical;

    if (this.eventBus) {
      this.eventBus.publish({
        type: 'LAYER_RESET_EXECUTED',
        payload: {
          layerId,
          preservedKeys: keepPaths,
          reason: reason || 'reset-executed',
        },
      });
    }

    return {
      layerId,
      keepPaths,
      snapshot: this.stateStore.snapshot(),
    };
  }

  #findLayer(layerId) {
    const layers = Array.isArray(this.definition.layers) ? this.definition.layers : [];
    const layer = layers.find((entry) => entry.id === layerId);
    if (!layer) {
      throw new Error(`LayerResetService: unknown layer "${layerId}".`);
    }
    return layer;
  }

  #getKeepPaths(layer) {
    if (!layer.reset || !Array.isArray(layer.reset.keep)) {
      return [];
    }

    return layer.reset.keep.filter((entry) => typeof entry === 'string' && entry.length > 0);
  }
}

module.exports = {
  LayerResetService,
};
