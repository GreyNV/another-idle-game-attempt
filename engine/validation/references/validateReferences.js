/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const { parseNodeRef } = require('../../systems/unlocks/nodeRef');
const { parseUnlockCondition } = require('../../systems/unlocks/unlockCondition');

const KNOWN_MODIFIER_OPS = new Set(['add', 'mul', 'pow', 'set', 'min', 'max']);
const KNOWN_MODIFIER_KEY_PREFIXES = ['gain.', 'mul.', 'cost.', 'duration.', 'effect.'];

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


function isKnownModifierKey(key) {
  return KNOWN_MODIFIER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function validateModifierEntry(modifier, path, index, issues) {
  if (!isObject(modifier)) {
    return;
  }

  if (typeof modifier.op === 'string' && !KNOWN_MODIFIER_OPS.has(modifier.op)) {
    issues.push({
      code: 'REF_MODIFIER_OP_UNKNOWN',
      path: `${path}/op`,
      message: `Modifier op "${modifier.op}" is not supported.`,
      hint: 'Use one of add, mul, pow, set, min, max.',
    });
  }

  if (typeof modifier.key === 'string' && !isKnownModifierKey(modifier.key)) {
    issues.push({
      code: 'REF_MODIFIER_KEY_UNKNOWN',
      path: `${path}/key`,
      message: `Modifier key "${modifier.key}" is not recognized by runtime policy.`,
      hint: 'Use key prefixes gain., mul., cost., duration., or effect..',
    });
  }

  if (typeof modifier.targetRef === 'string') {
    validateNodeRefExists(modifier.targetRef, `${path}/targetRef`, index, issues);
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

  if (Array.isArray(definition.modifiers)) {
    definition.modifiers.forEach((modifier, modifierIdx) => {
      validateModifierEntry(modifier, `/modifiers/${modifierIdx}`, index, issues);
    });
  }

  const validateRoutinePathArray = (routineId, entries, arrayPath) => {
    if (!Array.isArray(entries)) {
      return;
    }

    entries.forEach((entry, entryIdx) => {
      if (!isObject(entry) || typeof entry.path !== 'string' || entry.path.trim() === '') {
        return;
      }

      if (!hasStatePath(rootState, entry.path)) {
        issues.push({
          code: 'REF_ROUTINE_PATH_MISSING',
          path: `${arrayPath}/${entryIdx}/path`,
          message: `Routine "${routineId}" references missing state path "${entry.path}".`,
          hint: 'Add the state path or update routine path to an existing canonical state path.',
        });
      }
    });
  };

  const validateSetFlagEffectPath = (routineId, setFlagPath, jsonPath) => {
    if (!setFlagPath.startsWith('flags.')) {
      issues.push({
        code: 'REF_SET_FLAG_PATH_POLICY',
        path: jsonPath,
        message: `Routine "${routineId}" setFlag.path "${setFlagPath}" must be under state.flags.`,
        hint: 'Use a state path prefixed with flags., e.g. flags.someUnlockFlag.',
      });
      return;
    }

    if (!hasStatePath(rootState, setFlagPath)) {
      issues.push({
        code: 'REF_SET_FLAG_PATH_MISSING',
        path: jsonPath,
        message: `Routine "${routineId}" setFlag.path "${setFlagPath}" does not exist in state.flags.`,
        hint: 'Create this flag under state.flags or update setFlag.path to an existing flag.',
      });
    }
  };

  layers.forEach((layer, layerIdx) => {
    if (!isObject(layer)) {
      return;
    }

    const layerId = typeof layer.id === 'string' && layer.id.trim() !== '' ? layer.id : `<index:${layerIdx}>`;
    const slotPools =
      isObject(layer.routineSystem) && isObject(layer.routineSystem.slotPools) ? layer.routineSystem.slotPools : null;
    const knownSlotPoolIds = new Set(slotPools ? Object.keys(slotPools) : []);

    if (slotPools) {
      for (const [poolId, poolConfig] of Object.entries(slotPools)) {
        if (!isObject(poolConfig)) {
          continue;
        }

        ['totalPath', 'usedPath', 'activeRoutineIdPath'].forEach((field) => {
          const value = poolConfig[field];
          if (typeof value !== 'string' || value.trim() === '') {
            return;
          }

          if (!hasStatePath(rootState, value)) {
            issues.push({
              code: 'REF_ROUTINE_SLOT_POOL_PATH_MISSING',
              path: `/layers/${layerIdx}/routineSystem/slotPools/${poolId}/${field}`,
              message: `Layer "${layerId}" slot pool "${poolId}" references missing state path "${value}".`,
              hint: 'Add the state path or update this slot pool path to an existing canonical state path.',
            });
          }
        });
      }
    }

    if (Array.isArray(layer.modifiers)) {
      layer.modifiers.forEach((modifier, modifierIdx) => {
        validateModifierEntry(modifier, `/layers/${layerIdx}/modifiers/${modifierIdx}`, index, issues);
      });
    }

    if (Array.isArray(layer.softcaps)) {
      layer.softcaps.forEach((softcap, softcapIdx) => {
        if (!isObject(softcap)) {
          return;
        }

        const targetRef = typeof softcap.targetRef === 'string' ? softcap.targetRef : softcap.scope;
        const targetPath = typeof softcap.targetRef === 'string'
          ? `/layers/${layerIdx}/softcaps/${softcapIdx}/targetRef`
          : `/layers/${layerIdx}/softcaps/${softcapIdx}/scope`;
        if (typeof targetRef === 'string') {
          validateNodeRefExists(targetRef, targetPath, index, issues);
        }

        const targetKey = typeof softcap.targetKey === 'string' ? softcap.targetKey : softcap.key;
        if (typeof targetKey !== 'string' || !isKnownModifierKey(targetKey)) {
          issues.push({
            code: 'REF_SOFTCAP_TARGET_KEY_INVALID',
            path: `/layers/${layerIdx}/softcaps/${softcapIdx}/targetKey`,
            message: `Softcap targetKey "${targetKey}" is not recognized by runtime policy.`,
            hint: 'Use key prefixes gain., mul., cost., duration., or effect..',
          });
        }
      });
    }

    const validateUnlockPath = (unlock, path) => {
      const parsedUnlock = parseUnlockCondition(unlock);
      if (!parsedUnlock.ok) {
        return;
      }

      const walkAst = (ast, astPath) => {
        if (ast.type === 'resourceGte' || ast.type === 'compare' || ast.type === 'flag') {
          if (!hasStatePath(rootState, ast.path)) {
            issues.push({
              code: 'REF_UNLOCK_PATH_MISSING',
              path: `${astPath}/path`,
              message: `Unlock path "${ast.path}" does not exist in state.`,
              hint: 'Add the state path or update unlock path to an existing canonical state path.',
            });
          }
          return;
        }

        if (ast.type === 'all' || ast.type === 'any') {
          ast.children.forEach((child, idx) => walkAst(child, `${astPath}/${idx}`));
          return;
        }

        if (ast.type === 'not') {
          walkAst(ast.child, astPath);
        }
      };

      walkAst(parsedUnlock.value, path);
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

          if ((element.type === 'buyable' || element.type === 'upgrade') && Array.isArray(element.modifiers)) {
            element.modifiers.forEach((modifier, modifierIdx) => {
              validateModifierEntry(
                modifier,
                `/layers/${layerIdx}/sublayers/${subIdx}/sections/${sectionIdx}/elements/${elementIdx}/modifiers/${modifierIdx}`,
                index,
                issues
              );
            });
          }

          if (element.type === 'routine') {
            const routineId = typeof element.id === 'string' && element.id.trim() !== '' ? element.id : `<index:${elementIdx}>`;
            const routinePath = `/layers/${layerIdx}/sublayers/${subIdx}/sections/${sectionIdx}/elements/${elementIdx}`;

            if (isObject(element.slot) && typeof element.slot.poolId === 'string' && element.slot.poolId.trim() !== '') {
              if (!knownSlotPoolIds.has(element.slot.poolId)) {
                issues.push({
                  code: 'REF_ROUTINE_SLOT_POOL_UNKNOWN',
                  path: `${routinePath}/slot/poolId`,
                  message: `Routine "${routineId}" in layer "${layerId}" references unknown slot pool "${element.slot.poolId}".`,
                  hint: 'Add this pool id under layer.routineSystem.slotPools or update routine.slot.poolId to an existing pool.',
                });
              }
            }

            validateRoutinePathArray(routineId, element.produces, `${routinePath}/produces`);
            validateRoutinePathArray(routineId, element.consumes, `${routinePath}/consumes`);
            validateRoutinePathArray(routineId, element.requires, `${routinePath}/requires`);

            if (isObject(element.effects) && isObject(element.effects.setFlag) && typeof element.effects.setFlag.path === 'string') {
              validateSetFlagEffectPath(routineId, element.effects.setFlag.path, `${routinePath}/effects/setFlag/path`);
            }
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
