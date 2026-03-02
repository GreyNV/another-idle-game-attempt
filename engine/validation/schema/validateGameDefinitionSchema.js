const { compareSchemaVersions, validateSchemaVersion } = require('./schemaVersionPolicy');
const { parseUnlockCondition } = require('../../systems/unlocks/unlockCondition');

const LAYER_TYPES = new Set(['progressLayer']);
const SUBLAYER_TYPES = new Set(['progress', 'buyable', 'upgrade']);
const ELEMENT_TYPES = new Set(['progressBar', 'buyable', 'upgrade', 'routine']);
const SOFTCAP_MODES = new Set(['power']);
const ROUTINE_KEYS = new Set(['id', 'type', 'slot', 'mode', 'produces', 'consumes', 'requires', 'scaling', 'effects', 'unlock']);
const ROUTINE_SCALING_KEYS = new Set(['yieldMultiplierKeys', 'speedMultiplierKeys']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @param {string} path
 * @param {string} code
 * @param {string} message
 * @param {string} hint
 */
function issue(issues, path, code, message, hint) {
  issues.push({ path, code, message, hint });
}

function validateUnlockShape(unlock, path, issues) {
  if (isObject(unlock) && typeof unlock.pathExists === 'string') {
    issue(
      issues,
      `${path}/pathExists`,
      'UNLOCK_PATH_EXISTS_DEPRECATED',
      'unlock.pathExists is no longer supported in schema v1.',
      'Use { "flag": { "path": "..." } } for boolean paths, or compare/resourceGte for numeric checks.'
    );
    return;
  }

  const parsed = parseUnlockCondition(unlock);
  if (!parsed.ok) {
    issue(
      issues,
      path,
      parsed.code,
      parsed.message,
      'Use one unlock operator per object. Supported operators: always, resourceGte, compare, flag, all, any, not.'
    );
  }
}

function validateIdsUnique(list, path, issues) {
  const seen = new Set();
  list.forEach((item, idx) => {
    const idPath = `${path}/${idx}/id`;
    if (!isObject(item) || typeof item.id !== 'string' || item.id.trim() === '') {
      issue(issues, idPath, 'ID_REQUIRED', 'id must be a non-empty string.', 'Assign a unique id for this node scope.');
      return;
    }

    if (seen.has(item.id)) {
      issue(issues, idPath, 'ID_DUPLICATE', `Duplicate id "${item.id}" in scope ${path}.`, 'Rename this id so each sibling id is unique.');
      return;
    }

    seen.add(item.id);
  });
}

function validateRoutineElement(element, elementPath, elementIdx, issues) {
  const routineId = typeof element.id === 'string' && element.id.trim() !== '' ? element.id : `<index:${elementIdx}>`;

  Object.keys(element).forEach((key) => {
    if (!ROUTINE_KEYS.has(key)) {
      issue(
        issues,
        `${elementPath}/${key}`,
        'ROUTINE_UNKNOWN_FIELD',
        `Routine "${routineId}" contains unknown field "${key}".`,
        `Remove ${key} or add schema support for it.`
      );
    }
  });

  if (!isObject(element.slot)) {
    issue(issues, `${elementPath}/slot`, 'ROUTINE_SLOT_REQUIRED', `Routine "${routineId}" requires slot object.`, 'Set slot.poolId and optional slot.cost.');
  } else {
    if (typeof element.slot.poolId !== 'string' || element.slot.poolId.trim() === '') {
      issue(
        issues,
        `${elementPath}/slot/poolId`,
        'ROUTINE_SLOT_POOL_ID_REQUIRED',
        `Routine "${routineId}" requires slot.poolId to be a non-empty string.`,
        'Set slot.poolId to a valid slot pool identifier.'
      );
    }

    if (element.slot.cost !== undefined) {
      if (!Number.isInteger(element.slot.cost) || element.slot.cost < 1) {
        issue(
          issues,
          `${elementPath}/slot/cost`,
          'ROUTINE_SLOT_COST_INVALID',
          `Routine "${routineId}" requires slot.cost to be an integer >= 1.`,
          'Use a positive integer slot cost (1 or greater).'
        );
      }
    }
  }

  if (typeof element.mode !== 'string' || element.mode.trim() === '') {
    issue(issues, `${elementPath}/mode`, 'ROUTINE_MODE_REQUIRED', `Routine "${routineId}" requires mode to be a non-empty string.`, 'Set mode to a supported routine mode.');
  }

  const validateRoutineRateList = (entries, listPath) => {
    if (entries === undefined) {
      return;
    }

    if (!Array.isArray(entries)) {
      issue(
        issues,
        listPath,
        'ROUTINE_ARRAY_TYPE',
        `Routine "${routineId}" field must be an array.`,
        'Use an array of path descriptors.'
      );
      return;
    }

    entries.forEach((entry, idx) => {
      const entryPath = `${listPath}/${idx}`;
      if (!isObject(entry)) {
        issue(issues, entryPath, 'ROUTINE_ENTRY_TYPE', `Routine "${routineId}" entries must be objects.`, 'Use { path, perSecond } shape.');
        return;
      }

      if (typeof entry.path !== 'string' || entry.path.trim() === '') {
        issue(
          issues,
          `${entryPath}/path`,
          'ROUTINE_PATH_REQUIRED',
          `Routine "${routineId}" entries require a non-empty string path.`,
          'Set path to a canonical dotted state path.'
        );
      }

      if (entry.perSecond !== undefined && (typeof entry.perSecond !== 'number' || Number.isNaN(entry.perSecond) || entry.perSecond < 0)) {
        issue(
          issues,
          `${entryPath}/perSecond`,
          'ROUTINE_PER_SECOND_INVALID',
          `Routine "${routineId}" requires perSecond >= 0.`,
          'Set perSecond to 0 or a positive number.'
        );
      }
    });
  };

  validateRoutineRateList(element.produces, `${elementPath}/produces`);
  validateRoutineRateList(element.consumes, `${elementPath}/consumes`);
  validateRoutineRateList(element.requires, `${elementPath}/requires`);

  if (element.scaling !== undefined) {
    if (!isObject(element.scaling)) {
      issue(issues, `${elementPath}/scaling`, 'ROUTINE_SCALING_TYPE', `Routine "${routineId}" scaling must be an object.`, 'Provide scaling key arrays or omit scaling.');
    } else {
      Object.keys(element.scaling).forEach((key) => {
        if (!ROUTINE_SCALING_KEYS.has(key)) {
          issue(
            issues,
            `${elementPath}/scaling/${key}`,
            'ROUTINE_SCALING_UNKNOWN_FIELD',
            `Routine "${routineId}" scaling contains unknown field "${key}".`,
            'Use only scaling.yieldMultiplierKeys and scaling.speedMultiplierKeys.'
          );
        }
      });

      ['yieldMultiplierKeys', 'speedMultiplierKeys'].forEach((key) => {
        const value = element.scaling[key];
        if (value !== undefined && !Array.isArray(value)) {
          issue(
            issues,
            `${elementPath}/scaling/${key}`,
            'ROUTINE_SCALING_ARRAY_TYPE',
            `Routine "${routineId}" scaling.${key} must be an array.`,
            `Provide scaling.${key} as an array of state keys.`
          );
        }
      });
    }
  }
}

/**
 * @param {unknown} definition
 * @returns {import('./types').ValidationIssue[]}
 */
function validateGameDefinitionSchema(definition) {
  const issues = [];
  let schemaVersion = null;

  if (!isObject(definition)) {
    issue(issues, '/', 'ROOT_TYPE', 'Game definition root must be an object.', 'Wrap definition in a root JSON object.');
    return issues;
  }

  const { meta, systems, state, layers } = definition;

  if (!isObject(meta)) {
    issue(issues, '/meta', 'META_REQUIRED', 'meta is required and must be an object.', 'Add a meta object with schemaVersion and gameId.');
  } else {
    schemaVersion = meta.schemaVersion;
    issues.push(...validateSchemaVersion(meta.schemaVersion));

    if (typeof meta.gameId !== 'string' || meta.gameId.trim() === '') {
      issue(issues, '/meta/gameId', 'META_GAME_ID_REQUIRED', 'meta.gameId must be a non-empty string.', 'Provide a stable game identifier.');
    }
  }

  if (Array.isArray(systems)) {
    issue(
      issues,
      '/systems',
      'SYSTEMS_SHAPE_MIGRATED',
      'systems must be an object in schema v1 (array shape is deprecated).',
      'Migrate to an object map, e.g. { "tickMs": 100 } instead of [{ "id": "time-system", "type": "timeSystem" }].'
    );
  } else if (!isObject(systems)) {
    issue(issues, '/systems', 'SYSTEMS_REQUIRED', 'systems must be an object.', 'Declare systems as an object of engine-level system configuration.');
  }

  if (!isObject(state)) {
    issue(issues, '/state', 'STATE_REQUIRED', 'state must be an object.', 'Provide canonical state root object.');
  }

  if (!Array.isArray(layers)) {
    issue(issues, '/layers', 'LAYERS_REQUIRED', 'layers must be an array.', 'Provide at least one layer definition.');
    return issues;
  }

  validateIdsUnique(layers, '/layers', issues);

  layers.forEach((layer, layerIdx) => {
    const layerPath = `/layers/${layerIdx}`;

    if (!isObject(layer)) {
      issue(issues, layerPath, 'LAYER_TYPE', 'Layer entry must be an object.', 'Replace this entry with a layer object.');
      return;
    }

    if (typeof layer.type !== 'string' || !LAYER_TYPES.has(layer.type)) {
      issue(issues, `${layerPath}/type`, 'LAYER_TYPE_ENUM', `Layer type must be one of: ${Array.from(LAYER_TYPES).join(', ')}.`, 'Use a registered layer plugin type.');
    }

    if (!Array.isArray(layer.sublayers)) {
      issue(issues, `${layerPath}/sublayers`, 'SUBLAYERS_REQUIRED', 'layer.sublayers must be an array.', 'Declare sublayers for this layer.');
      return;
    }

    validateIdsUnique(layer.sublayers, `${layerPath}/sublayers`, issues);

    if (layer.unlock !== undefined) {
      validateUnlockShape(layer.unlock, `${layerPath}/unlock`, issues);
    }

    if (layer.routineSystem !== undefined) {
      if (!isObject(layer.routineSystem)) {
        issue(
          issues,
          `${layerPath}/routineSystem`,
          'ROUTINE_SYSTEM_TYPE',
          'layer.routineSystem must be an object.',
          'Provide routineSystem.slotPools as an object keyed by pool id.'
        );
      } else if (!isObject(layer.routineSystem.slotPools)) {
        issue(
          issues,
          `${layerPath}/routineSystem/slotPools`,
          'ROUTINE_SLOT_POOLS_REQUIRED',
          'layer.routineSystem.slotPools must be an object keyed by pool id.',
          'Define each slot pool with totalPath, usedPath, activeRoutineIdPath, and optional singleActivePerPool.'
        );
      } else {
        for (const [poolId, poolConfig] of Object.entries(layer.routineSystem.slotPools)) {
          const poolPath = `${layerPath}/routineSystem/slotPools/${poolId}`;
          if (poolId.trim() === '') {
            issue(issues, poolPath, 'ROUTINE_SLOT_POOL_ID_REQUIRED', 'slotPools keys must be non-empty strings.', 'Rename this pool id to a non-empty key.');
            continue;
          }

          if (!isObject(poolConfig)) {
            issue(
              issues,
              poolPath,
              'ROUTINE_SLOT_POOL_CONFIG_TYPE',
              `slotPools.${poolId} must be an object.`,
              'Provide totalPath, usedPath, activeRoutineIdPath, and optional singleActivePerPool.'
            );
            continue;
          }

          ['totalPath', 'usedPath', 'activeRoutineIdPath'].forEach((field) => {
            if (typeof poolConfig[field] !== 'string' || poolConfig[field].trim() === '') {
              issue(
                issues,
                `${poolPath}/${field}`,
                'ROUTINE_SLOT_POOL_PATH_REQUIRED',
                `slotPools.${poolId}.${field} must be a non-empty string.`,
                `Set ${field} to a canonical dotted state path.`
              );
            }
          });

          if (poolConfig.singleActivePerPool !== undefined && typeof poolConfig.singleActivePerPool !== 'boolean') {
            issue(
              issues,
              `${poolPath}/singleActivePerPool`,
              'ROUTINE_SLOT_POOL_SINGLE_ACTIVE_TYPE',
              `slotPools.${poolId}.singleActivePerPool must be a boolean when provided.`,
              'Set singleActivePerPool to true or false.'
            );
          }
        }
      }
    }

    if (layer.reset !== undefined) {
      if (!isObject(layer.reset)) {
        issue(issues, `${layerPath}/reset`, 'RESET_TYPE', 'reset must be an object.', 'Use reset.preview/reset.execute descriptors.');
      } else if (!Array.isArray(layer.reset.keep)) {
        issue(issues, `${layerPath}/reset/keep`, 'RESET_KEEP_REQUIRED', 'reset.keep must be an array of state paths.', 'Provide reset.keep array, even if empty.');
      }
    }

    if (layer.softcaps !== undefined) {
      if (!Array.isArray(layer.softcaps)) {
        issue(issues, `${layerPath}/softcaps`, 'SOFTCAPS_TYPE', 'softcaps must be an array.', 'Provide softcaps as an array.');
      } else {
        validateIdsUnique(layer.softcaps, `${layerPath}/softcaps`, issues);
        layer.softcaps.forEach((softcap, softIdx) => {
          const softPath = `${layerPath}/softcaps/${softIdx}`;
          if (!isObject(softcap)) {
            issue(issues, softPath, 'SOFTCAP_TYPE', 'Softcap entry must be an object.', 'Replace with { id, scope, key, softcapAt, mode }.');
            return;
          }

          if (typeof softcap.mode !== 'string' || !SOFTCAP_MODES.has(softcap.mode)) {
            issue(issues, `${softPath}/mode`, 'SOFTCAP_MODE_ENUM', `softcap mode must be one of: ${Array.from(SOFTCAP_MODES).join(', ')}.`, 'Choose a supported softcap mode.');
          }
        });
      }
    }

    layer.sublayers.forEach((sublayer, subIdx) => {
      const sublayerPath = `${layerPath}/sublayers/${subIdx}`;
      if (!isObject(sublayer)) {
        issue(issues, sublayerPath, 'SUBLAYER_TYPE', 'Sublayer entry must be an object.', 'Replace with a sublayer object.');
        return;
      }

      if (typeof sublayer.type !== 'string' || !SUBLAYER_TYPES.has(sublayer.type)) {
        issue(issues, `${sublayerPath}/type`, 'SUBLAYER_TYPE_ENUM', `Sublayer type must be one of: ${Array.from(SUBLAYER_TYPES).join(', ')}.`, 'Use a supported sublayer type.');
      }

      if (sublayer.unlock !== undefined) {
        validateUnlockShape(sublayer.unlock, `${sublayerPath}/unlock`, issues);
      }

      if (!Array.isArray(sublayer.sections)) {
        issue(issues, `${sublayerPath}/sections`, 'SECTIONS_REQUIRED', 'sublayer.sections must be an array.', 'Declare sections array for sublayer.');
        return;
      }

      validateIdsUnique(sublayer.sections, `${sublayerPath}/sections`, issues);
      sublayer.sections.forEach((section, sectionIdx) => {
        const sectionPath = `${sublayerPath}/sections/${sectionIdx}`;
        if (!isObject(section)) {
          issue(issues, sectionPath, 'SECTION_TYPE', 'Section entry must be an object.', 'Replace with section object.');
          return;
        }

        if (section.unlock !== undefined) {
          validateUnlockShape(section.unlock, `${sectionPath}/unlock`, issues);
        }

        if (!Array.isArray(section.elements)) {
          issue(issues, `${sectionPath}/elements`, 'ELEMENTS_REQUIRED', 'section.elements must be an array.', 'Declare elements array for section.');
          return;
        }

        validateIdsUnique(section.elements, `${sectionPath}/elements`, issues);
        section.elements.forEach((element, elementIdx) => {
          const elementPath = `${sectionPath}/elements/${elementIdx}`;
          if (!isObject(element)) {
            issue(issues, elementPath, 'ELEMENT_TYPE', 'Element entry must be an object.', 'Replace with element object.');
            return;
          }

          if (typeof element.type !== 'string' || !ELEMENT_TYPES.has(element.type)) {
            issue(issues, `${elementPath}/type`, 'ELEMENT_TYPE_ENUM', `Element type must be one of: ${Array.from(ELEMENT_TYPES).join(', ')}.`, 'Use a supported element type.');
          }

          if (element.type === 'routine') {
            validateRoutineElement(element, elementPath, elementIdx, issues);

            const versionComparison = compareSchemaVersions(schemaVersion, '1.2.0');
            if (versionComparison !== null && versionComparison < 0) {
              const elementId = typeof element.id === 'string' && element.id.trim() !== '' ? element.id : `<index:${elementIdx}>`;
              issue(
                issues,
                `${elementPath}/type`,
                'ELEMENT_ROUTINE_REQUIRES_SCHEMA_1_2_0',
                `Element "${elementId}" uses type "routine", which requires schemaVersion >= 1.2.0 (found "${schemaVersion}").`,
                `Update meta.schemaVersion to "1.2.0" or newer, or change element "${elementId}" to a type supported by schema ${schemaVersion}.`
              );
            }
          }

          if (element.unlock !== undefined) {
            validateUnlockShape(element.unlock, `${elementPath}/unlock`, issues);
          }

          if (element.effect !== undefined && (!isObject(element.effect) || typeof element.effect.targetRef !== 'string')) {
            issue(issues, `${elementPath}/effect/targetRef`, 'TARGET_REF_REQUIRED', 'element.effect.targetRef must be a string when effect is provided.', 'Set effect.targetRef to a node ref like layer:x/sublayer:y/section:z/element:w.');
          }
        });
      });
    });
  });

  return issues;
}

module.exports = {
  validateGameDefinitionSchema,
};
