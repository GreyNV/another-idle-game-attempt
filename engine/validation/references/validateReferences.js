/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const { parseNodeRef } = require('../../systems/unlocks/nodeRef');

/**
 * @param {Record<string, unknown>} rootState
 * @param {string} dottedPath
 */
function hasStatePath(rootState, dottedPath) {
  const parts = dottedPath.split('.');
  let current = rootState;
  for (const part of parts) {
    if (!isObject(current) || !(part in current)) {
      return false;
    }
    current = /** @type {Record<string, unknown>} */ (current)[part];
  }

  return true;
}

/**
 * @param {any[]} layers
 */
function buildNodeIndex(layers) {
  const index = {
    layers: new Set(),
    sublayers: new Map(),
    sections: new Map(),
    elements: new Map(),
  };

  layers.forEach((layer) => {
    if (!isObject(layer) || typeof layer.id !== 'string') {
      return;
    }

    index.layers.add(layer.id);
    const subSet = new Set();
    index.sublayers.set(layer.id, subSet);

    if (!Array.isArray(layer.sublayers)) {
      return;
    }

    layer.sublayers.forEach((sublayer) => {
      if (!isObject(sublayer) || typeof sublayer.id !== 'string') {
        return;
      }

      subSet.add(sublayer.id);
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
        const elementKey = `${layer.id}/${sublayer.id}/${section.id}`;
        const elementSet = new Set();
        index.elements.set(elementKey, elementSet);

        if (!Array.isArray(section.elements)) {
          return;
        }

        section.elements.forEach((element) => {
          if (isObject(element) && typeof element.id === 'string') {
            elementSet.add(element.id);
          }
        });
      });
    });
  });

  return index;
}

function validateNodeRefExists(ref, path, index, issues) {
  const parsedResult = parseNodeRef(ref);
  if (!parsedResult.ok) {
    issues.push({
      code: 'REF_FORMAT',
      path,
      message: `Invalid node reference format "${ref}" (${parsedResult.code}).`,
      hint: 'Use layer:<id>[/sublayer:<id>[/section:<id>[/element:<id>]]].',
    });
    return;
  }

  const parsed = parsedResult.value;

  if (!index.layers.has(parsed.layer)) {
    issues.push({
      code: 'REF_LAYER_MISSING',
      path,
      message: `Referenced layer "${parsed.layer}" does not exist.`,
      hint: 'Fix target layer id or add missing layer definition.',
    });
    return;
  }

  if (!parsed.sublayer) {
    return;
  }

  const sublayers = index.sublayers.get(parsed.layer);
  if (!sublayers || !sublayers.has(parsed.sublayer)) {
    issues.push({
      code: 'REF_SUBLAYER_MISSING',
      path,
      message: `Referenced sublayer "${parsed.sublayer}" does not exist under layer "${parsed.layer}".`,
      hint: 'Fix sublayer id in ref or add it under the referenced layer.',
    });
    return;
  }

  if (!parsed.section) {
    return;
  }

  const sections = index.sections.get(`${parsed.layer}/${parsed.sublayer}`);
  if (!sections || !sections.has(parsed.section)) {
    issues.push({
      code: 'REF_SECTION_MISSING',
      path,
      message: `Referenced section "${parsed.section}" does not exist under ${parsed.layer}/${parsed.sublayer}.`,
      hint: 'Fix section id in ref or add section to referenced sublayer.',
    });
    return;
  }

  if (!parsed.element) {
    return;
  }

  const elements = index.elements.get(`${parsed.layer}/${parsed.sublayer}/${parsed.section}`);
  if (!elements || !elements.has(parsed.element)) {
    issues.push({
      code: 'REF_ELEMENT_MISSING',
      path,
      message: `Referenced element "${parsed.element}" does not exist under ${parsed.layer}/${parsed.sublayer}/${parsed.section}.`,
      hint: 'Fix element id in ref or add it to referenced section.',
    });
  }
}

/**
 * @param {unknown} definition
 * @returns {import('../schema/types').ValidationIssue[]}
 */
function validateReferences(definition) {
  const issues = [];
  if (!isObject(definition) || !Array.isArray(definition.layers)) {
    return issues;
  }

  const layers = definition.layers;
  const rootState = isObject(definition.state) ? definition.state : {};
  const index = buildNodeIndex(layers);

  layers.forEach((layer, layerIdx) => {
    if (!isObject(layer)) {
      return;
    }

    if (Array.isArray(layer.softcaps)) {
      layer.softcaps.forEach((softcap, softcapIdx) => {
        if (isObject(softcap) && typeof softcap.scope === 'string') {
          validateNodeRefExists(softcap.scope, `/layers/${layerIdx}/softcaps/${softcapIdx}/scope`, index, issues);
        }
      });
    }

    const validateUnlockPath = (unlock, path) => {
      if (!isObject(unlock)) {
        return;
      }

      if (isObject(unlock.resourceGte) && typeof unlock.resourceGte.path === 'string' && !hasStatePath(rootState, unlock.resourceGte.path)) {
        issues.push({
          code: 'REF_UNLOCK_PATH_MISSING',
          path: `${path}/resourceGte/path`,
          message: `Unlock path "${unlock.resourceGte.path}" does not exist in state.`,
          hint: 'Add the state path or update unlock path to an existing canonical state path.',
        });
      }

      if (typeof unlock.pathExists === 'string' && !hasStatePath(rootState, unlock.pathExists)) {
        issues.push({
          code: 'REF_UNLOCK_PATH_MISSING',
          path: `${path}/pathExists`,
          message: `Unlock path "${unlock.pathExists}" does not exist in state.`,
          hint: 'Add the state path or update unlock condition path.',
        });
      }
    };

    validateUnlockPath(layer.unlock, `/layers/${layerIdx}/unlock`);

    if (!Array.isArray(layer.sublayers)) {
      return;
    }

    layer.sublayers.forEach((sublayer, subIdx) => {
      if (!isObject(sublayer)) {
        return;
      }

      validateUnlockPath(sublayer.unlock, `/layers/${layerIdx}/sublayers/${subIdx}/unlock`);

      if (!Array.isArray(sublayer.sections)) {
        return;
      }

      sublayer.sections.forEach((section, sectionIdx) => {
        if (!isObject(section)) {
          return;
        }

        validateUnlockPath(section.unlock, `/layers/${layerIdx}/sublayers/${subIdx}/sections/${sectionIdx}/unlock`);

        if (!Array.isArray(section.elements)) {
          return;
        }

        section.elements.forEach((element, elementIdx) => {
          if (!isObject(element)) {
            return;
          }

          validateUnlockPath(element.unlock, `/layers/${layerIdx}/sublayers/${subIdx}/sections/${sectionIdx}/elements/${elementIdx}/unlock`);

          if (isObject(element.effect) && typeof element.effect.targetRef === 'string') {
            validateNodeRefExists(
              element.effect.targetRef,
              `/layers/${layerIdx}/sublayers/${subIdx}/sections/${sectionIdx}/elements/${elementIdx}/effect/targetRef`,
              index,
              issues
            );
          }
        });
      });
    });
  });

  return issues;
}

module.exports = {
  validateReferences,
};
