function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class MultiplierCompiler {
  constructor(options = {}) {
    this.stateStore = options.stateStore || null;
    this.derivedPath = options.derivedPath || 'multipliers';
    this.snapshot = { layers: {} };
  }

  update() {
    if (!this.stateStore) {
      throw new Error('MultiplierCompiler requires stateStore.');
    }

    const canonicalLayers = this.stateStore.get('layers');
    const layers = isPlainObject(canonicalLayers) ? canonicalLayers : {};
    const compiledLayers = {};

    const layerIds = Object.keys(layers).sort();
    for (const layerId of layerIds) {
      compiledLayers[layerId] = this.#compileLayer(layers[layerId]);
    }

    this.snapshot = { layers: compiledLayers };
    this.stateStore.setDerived(this.derivedPath, this.snapshot);
    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot;
  }

  getValue(layerId, key) {
    if (typeof key !== 'string' || !key.startsWith('mul.')) {
      return 1;
    }

    const byLayer = this.snapshot.layers[layerId];
    if (!isPlainObject(byLayer)) {
      return 1;
    }

    const value = byLayer[key];
    return Number.isFinite(value) ? value : 1;
  }

  #compileLayer(layerState) {
    const source = isPlainObject(layerState) && isPlainObject(layerState.multipliers) ? layerState.multipliers : {};
    const compiled = {};

    const keys = Object.keys(source)
      .filter((key) => key.startsWith('mul.'))
      .sort();

    for (const key of keys) {
      compiled[key] = this.#compileKey(source[key]);
    }

    return compiled;
  }

  #compileKey(groupEntries) {
    const groups = isPlainObject(groupEntries) ? groupEntries : {};
    const groupIds = Object.keys(groups).sort();

    let total = 1;
    for (const groupId of groupIds) {
      const entries = Array.isArray(groups[groupId]) ? groups[groupId] : [groups[groupId]];
      let additiveTotal = 0;

      for (const entry of entries) {
        const value = Number(entry);
        if (Number.isFinite(value)) {
          additiveTotal += value;
        }
      }

      total *= 1 + additiveTotal;
    }

    return Number.isFinite(total) && total >= 0 ? total : 1;
  }
}

module.exports = {
  MultiplierCompiler,
};
