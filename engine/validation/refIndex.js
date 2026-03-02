const { parseNodeRef } = require('../systems/unlocks/nodeRef');

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {{ layer: string, sublayer?: string, section?: string, element?: string }} parsed
 */
function toSlashNodeRef(parsed) {
  const parts = [parsed.layer];
  if (parsed.sublayer) parts.push(parsed.sublayer);
  if (parsed.section) parts.push(parsed.section);
  if (parsed.element) parts.push(parsed.element);
  return parts.join('/');
}

/**
 * @param {unknown[]} layers
 */
function buildNodeIndex(layers) {
  const index = {
    layers: new Set(),
    sublayers: new Map(),
    sections: new Map(),
    elements: new Map(),
    existingNodeRefs: [],
  };

  layers.forEach((layer) => {
    if (!isObject(layer) || typeof layer.id !== 'string') {
      return;
    }

    index.layers.add(layer.id);
    index.existingNodeRefs.push(layer.id);

    const sublayerSet = new Set();
    index.sublayers.set(layer.id, sublayerSet);

    if (!Array.isArray(layer.sublayers)) {
      return;
    }

    layer.sublayers.forEach((sublayer) => {
      if (!isObject(sublayer) || typeof sublayer.id !== 'string') {
        return;
      }

      sublayerSet.add(sublayer.id);
      index.existingNodeRefs.push(`${layer.id}/${sublayer.id}`);

      const sectionKey = `${layer.id}/${sublayer.id}`;
      const sectionSet = new Set();
      index.sections.set(sectionKey, sectionSet);

      if (!Array.isArray(sublayer.sections)) {
        return;
      }

      sublayer.sections.forEach((section) => {
        if (!isObject(section) || typeof section.id !== 'string') {
          return;
        }

        sectionSet.add(section.id);
        index.existingNodeRefs.push(`${layer.id}/${sublayer.id}/${section.id}`);

        const elementKey = `${layer.id}/${sublayer.id}/${section.id}`;
        const elementSet = new Set();
        index.elements.set(elementKey, elementSet);

        if (!Array.isArray(section.elements)) {
          return;
        }

        section.elements.forEach((element) => {
          if (!isObject(element) || typeof element.id !== 'string') {
            return;
          }

          elementSet.add(element.id);
          index.existingNodeRefs.push(`${layer.id}/${sublayer.id}/${section.id}/${element.id}`);
        });
      });
    });
  });

  return index;
}

/**
 * @param {string} ref
 * @param {{ layers: Set<string>, sublayers: Map<string, Set<string>>, sections: Map<string, Set<string>>, elements: Map<string, Set<string>> }} index
 */
function resolveRefIssueCode(ref, index) {
  const parsedResult = parseNodeRef(ref);
  if (!parsedResult.ok) {
    return { code: 'REF_FORMAT', parsed: null };
  }

  const parsed = parsedResult.value;
  if (!index.layers.has(parsed.layer)) {
    return { code: 'REF_LAYER_MISSING', parsed };
  }

  if (!parsed.sublayer) {
    return { code: null, parsed };
  }

  const sublayers = index.sublayers.get(parsed.layer);
  if (!sublayers || !sublayers.has(parsed.sublayer)) {
    return { code: 'REF_SUBLAYER_MISSING', parsed };
  }

  if (!parsed.section) {
    return { code: null, parsed };
  }

  const sections = index.sections.get(`${parsed.layer}/${parsed.sublayer}`);
  if (!sections || !sections.has(parsed.section)) {
    return { code: 'REF_SECTION_MISSING', parsed };
  }

  if (!parsed.element) {
    return { code: null, parsed };
  }

  const elements = index.elements.get(`${parsed.layer}/${parsed.sublayer}/${parsed.section}`);
  if (!elements || !elements.has(parsed.element)) {
    return { code: 'REF_ELEMENT_MISSING', parsed };
  }

  return { code: null, parsed };
}

/**
 * @param {Record<string, unknown>} unlock
 * @param {string} basePath
 * @param {(path: string, ref: string, source: string) => void} onTargetRef
 */
function collectUnlockTargetRefs(unlock, basePath, onTargetRef) {
  const visit = (value, path) => {
    if (!isObject(value)) {
      if (Array.isArray(value)) {
        value.forEach((entry, idx) => visit(entry, `${path}/${idx}`));
      }
      return;
    }

    Object.entries(value).forEach(([key, nested]) => {
      const nextPath = `${path}/${key}`;
      if (key === 'targetRef' && typeof nested === 'string') {
        onTargetRef(nextPath, nested, 'unlock.targetRef');
        return;
      }
      visit(nested, nextPath);
    });
  };

  visit(unlock, basePath);
}

/**
 * @param {unknown} definition
 */
function buildRefIndex(definition) {
  if (!isObject(definition) || !Array.isArray(definition.layers)) {
    return {
      existingNodeRefs: [],
      referencedTargets: [],
      unresolvedRefs: [],
    };
  }

  const index = buildNodeIndex(definition.layers);
  const referencedTargets = [];
  const unresolvedRefs = [];

  const registerRef = (path, ref, source) => {
    if (typeof ref !== 'string' || ref.trim() === '') {
      return;
    }

    const resolution = resolveRefIssueCode(ref, index);
    referencedTargets.push({
      path,
      ref,
      source,
      nodeRef: resolution.parsed ? toSlashNodeRef(resolution.parsed) : null,
    });

    if (resolution.code) {
      unresolvedRefs.push({
        path,
        ref,
        source,
        code: resolution.code,
      });
    }
  };

  definition.layers.forEach((layer, layerIdx) => {
    if (!isObject(layer)) {
      return;
    }

    if (Array.isArray(layer.softcaps)) {
      layer.softcaps.forEach((softcap, softcapIdx) => {
        if (isObject(softcap) && typeof softcap.scope === 'string') {
          registerRef(`/layers/${layerIdx}/softcaps/${softcapIdx}/scope`, softcap.scope, 'softcap.scope');
        }
      });
    }

    if (isObject(layer.unlock)) {
      collectUnlockTargetRefs(layer.unlock, `/layers/${layerIdx}/unlock`, registerRef);
    }

    if (!Array.isArray(layer.sublayers)) {
      return;
    }

    layer.sublayers.forEach((sublayer, sublayerIdx) => {
      if (!isObject(sublayer)) {
        return;
      }

      if (isObject(sublayer.unlock)) {
        collectUnlockTargetRefs(sublayer.unlock, `/layers/${layerIdx}/sublayers/${sublayerIdx}/unlock`, registerRef);
      }

      if (!Array.isArray(sublayer.sections)) {
        return;
      }

      sublayer.sections.forEach((section, sectionIdx) => {
        if (!isObject(section)) {
          return;
        }

        if (isObject(section.unlock)) {
          collectUnlockTargetRefs(
            section.unlock,
            `/layers/${layerIdx}/sublayers/${sublayerIdx}/sections/${sectionIdx}/unlock`,
            registerRef
          );
        }

        if (!Array.isArray(section.elements)) {
          return;
        }

        section.elements.forEach((element, elementIdx) => {
          if (!isObject(element)) {
            return;
          }

          if (isObject(element.unlock)) {
            collectUnlockTargetRefs(
              element.unlock,
              `/layers/${layerIdx}/sublayers/${sublayerIdx}/sections/${sectionIdx}/elements/${elementIdx}/unlock`,
              registerRef
            );
          }

          if (isObject(element.effect) && typeof element.effect.targetRef === 'string') {
            registerRef(
              `/layers/${layerIdx}/sublayers/${sublayerIdx}/sections/${sectionIdx}/elements/${elementIdx}/effect/targetRef`,
              element.effect.targetRef,
              'effect.targetRef'
            );
          }
        });
      });
    });
  });

  const sortByPathThenRef = (left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }
    if (left.ref !== right.ref) {
      return left.ref.localeCompare(right.ref);
    }
    return left.source.localeCompare(right.source);
  };

  return {
    existingNodeRefs: index.existingNodeRefs,
    referencedTargets: referencedTargets.sort(sortByPathThenRef),
    unresolvedRefs: unresolvedRefs.sort((left, right) => {
      const base = sortByPathThenRef(left, right);
      if (base !== 0) {
        return base;
      }
      return left.code.localeCompare(right.code);
    }),
  };
}

module.exports = {
  buildRefIndex,
};
