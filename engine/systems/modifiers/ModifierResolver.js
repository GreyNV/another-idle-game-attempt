const { normalizeNodeRef } = require('../unlocks/nodeRef');
const { applySoftcap } = require('./applySoftcap');

class ModifierResolver {
  constructor(options = {}) {
    this.definition = options.definition || { layers: [] };
    this.softcapsByTargetAndKey = this.#indexSoftcaps(this.definition);
  }

  resolve(targetRef, key, baseValue) {
    if (!Number.isFinite(baseValue)) {
      throw new Error('baseValue must be a finite number');
    }

    const normalized = this.#normalizeTargetRef(targetRef);
    const softcaps = this.#lookupSoftcaps(normalized, key);

    let result = baseValue;
    for (const softcap of softcaps) {
      result = applySoftcap(result, softcap);
    }

    return result;
  }

  resolveSoftcapParam(targetRef, key, baseValue) {
    return this.resolve(targetRef, key, baseValue);
  }

  #lookupSoftcaps(targetRef, key) {
    const byKey = this.softcapsByTargetAndKey.get(targetRef);
    if (!byKey) {
      return [];
    }
    return byKey.get(key) || [];
  }

  #normalizeTargetRef(targetRef) {
    const normalized = normalizeNodeRef(targetRef);
    if (!normalized.ok) {
      throw new Error(`Invalid node ref "${targetRef}": ${normalized.message}`);
    }
    return normalized.value;
  }

  #indexSoftcaps(definition) {
    const index = new Map();
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    for (const layer of layers) {
      const layerSoftcaps = Array.isArray(layer.softcaps) ? layer.softcaps : [];
      for (const softcap of layerSoftcaps) {
        if (!softcap || typeof softcap !== 'object') {
          continue;
        }

        const normalized = normalizeNodeRef(softcap.scope);
        if (!normalized.ok || typeof softcap.key !== 'string') {
          continue;
        }

        const byKey = index.get(normalized.value) || new Map();
        const entries = byKey.get(softcap.key) || [];
        entries.push(softcap);
        byKey.set(softcap.key, entries);
        index.set(normalized.value, byKey);
      }
    }

    return index;
  }
}

module.exports = {
  ModifierResolver,
};
