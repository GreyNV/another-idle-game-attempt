const { normalizeNodeRef } = require('../unlocks/nodeRef');
const { applySoftcap } = require('./applySoftcap');

/** @typedef {import('../../core/contracts/ModifierResolverContract').ModifierResolverContract} ModifierResolverContract */

const SUPPORTED_MODIFIER_OPS = new Set(['add', 'mul', 'pow', 'set', 'min', 'max']);

function compareModifierOrder(left, right) {
  const leftPriority = Number.isFinite(left.priority) ? left.priority : 0;
  const rightPriority = Number.isFinite(right.priority) ? right.priority : 0;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftId = typeof left.id === 'string' ? left.id : '';
  const rightId = typeof right.id === 'string' ? right.id : '';
  if (leftId !== rightId) {
    return leftId.localeCompare(rightId);
  }

  const leftSource = typeof left.__sourcePath === 'string' ? left.__sourcePath : '';
  const rightSource = typeof right.__sourcePath === 'string' ? right.__sourcePath : '';
  return leftSource.localeCompare(rightSource);
}

/** @implements {ModifierResolverContract} */
class ModifierResolver {
  constructor(options = {}) {
    this.definition = options.definition || { layers: [] };
    this.modifiersByTargetAndKey = this.#indexModifiers(this.definition);
    this.softcapsByTargetAndKey = this.#indexSoftcaps(this.definition);
  }

  resolve(targetRef, key, baseValue) {
    if (!Number.isFinite(baseValue)) {
      throw new Error('baseValue must be a finite number');
    }

    const normalized = this.#normalizeTargetRef(targetRef);
    const modifierList = this.#lookupModifiers(normalized, key);
    const softcaps = this.#lookupSoftcaps(normalized, key);

    let result = this.#applyModifiers(baseValue, modifierList);
    for (const softcap of softcaps) {
      result = applySoftcap(result, softcap);
    }

    return result;
  }

  resolveSoftcapParam(targetRef, key, baseValue) {
    return this.resolve(targetRef, key, baseValue);
  }

  #applyModifiers(baseValue, modifiers) {
    if (!modifiers.length) {
      return baseValue;
    }

    let result = baseValue;
    for (const modifier of modifiers) {
      const value = Number.isFinite(modifier.value) ? modifier.value : 0;
      switch (modifier.op) {
        case 'add':
          result += value;
          break;
        case 'mul':
          result *= value;
          break;
        case 'pow':
          result = Math.pow(result, value);
          break;
        case 'set':
          result = value;
          break;
        case 'min':
          result = Math.min(result, value);
          break;
        case 'max':
          result = Math.max(result, value);
          break;
        default:
          break;
      }
    }

    return result;
  }

  #lookupModifiers(targetRef, key) {
    const byKey = this.modifiersByTargetAndKey.get(targetRef);
    if (!byKey) {
      return [];
    }
    return byKey.get(key) || [];
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

  #pushIndexedEntry(index, targetRef, key, entry) {
    const byKey = index.get(targetRef) || new Map();
    const entries = byKey.get(key) || [];
    entries.push(entry);
    entries.sort(compareModifierOrder);
    byKey.set(key, entries);
    index.set(targetRef, byKey);
  }

  #indexModifiers(definition) {
    const index = new Map();
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    for (const [layerIdx, layer] of layers.entries()) {
      const layerPath = `/layers/${layerIdx}`;
      this.#collectModifierArray(index, layer.modifiers, `${layerPath}/modifiers`);

      const sublayers = Array.isArray(layer && layer.sublayers) ? layer.sublayers : [];
      for (const [sublayerIdx, sublayer] of sublayers.entries()) {
        const sections = Array.isArray(sublayer && sublayer.sections) ? sublayer.sections : [];
        for (const [sectionIdx, section] of sections.entries()) {
          const elements = Array.isArray(section && section.elements) ? section.elements : [];
          for (const [elementIdx, element] of elements.entries()) {
            if (!element || typeof element !== 'object') {
              continue;
            }

            if (element.type !== 'buyable' && element.type !== 'upgrade') {
              continue;
            }

            const elementPath = `${layerPath}/sublayers/${sublayerIdx}/sections/${sectionIdx}/elements/${elementIdx}`;
            this.#collectModifierArray(index, element.modifiers, `${elementPath}/modifiers`);
          }
        }
      }
    }

    this.#collectModifierArray(index, definition.modifiers, '/modifiers');
    return index;
  }

  #collectModifierArray(index, candidate, sourcePath) {
    if (!Array.isArray(candidate)) {
      return;
    }

    for (const modifier of candidate) {
      if (!modifier || typeof modifier !== 'object') {
        continue;
      }

      const normalizedTarget = normalizeNodeRef(modifier.targetRef);
      if (!normalizedTarget.ok || typeof modifier.key !== 'string' || !SUPPORTED_MODIFIER_OPS.has(modifier.op)) {
        continue;
      }

      const enabled = modifier.enabled !== false;
      if (!enabled) {
        continue;
      }

      this.#pushIndexedEntry(index, normalizedTarget.value, modifier.key, {
        ...modifier,
        stacking: typeof modifier.stacking === 'string' ? modifier.stacking : 'stack',
        __sourcePath: sourcePath,
      });
    }
  }

  #indexSoftcaps(definition) {
    const index = new Map();
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    for (const [layerIdx, layer] of layers.entries()) {
      const layerSoftcaps = Array.isArray(layer && layer.softcaps) ? layer.softcaps : [];
      for (const [softcapIdx, softcap] of layerSoftcaps.entries()) {
        if (!softcap || typeof softcap !== 'object') {
          continue;
        }

        const normalized = normalizeNodeRef(softcap.targetRef || softcap.scope);
        const softcapKey = typeof softcap.targetKey === 'string' ? softcap.targetKey : softcap.key;
        if (!normalized.ok || typeof softcapKey !== 'string') {
          continue;
        }

        if (softcap.enabled === false) {
          continue;
        }

        this.#pushIndexedEntry(index, normalized.value, softcapKey, {
          ...softcap,
          threshold: Number.isFinite(softcap.threshold) ? softcap.threshold : softcap.softcapAt,
          power: Number.isFinite(softcap.power) ? softcap.power : 0.5,
          multiplier: Number.isFinite(softcap.multiplier) ? softcap.multiplier : 1,
          __sourcePath: `/layers/${layerIdx}/softcaps/${softcapIdx}`,
        });
      }
    }

    return index;
  }
}

module.exports = {
  ModifierResolver,
  SUPPORTED_MODIFIER_OPS,
};
