const { ValidationError } = require('../errors/ValidationError');
const { validateGameDefinitionSchema } = require('../schema/validateGameDefinitionSchema');
const { validateReferences } = require('../references/validateReferences');

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRoutineSlotPools(layer) {
  const routineSystem = isObject(layer.routineSystem) ? layer.routineSystem : {};
  const slotPoolsSource = isObject(routineSystem.slotPools) ? routineSystem.slotPools : {};
  const slotPoolsById = {};

  for (const [poolId, poolConfig] of Object.entries(slotPoolsSource)) {
    if (!isObject(poolConfig)) {
      continue;
    }

    slotPoolsById[poolId] = {
      id: poolId,
      totalPath: poolConfig.totalPath,
      usedPath: poolConfig.usedPath,
      activeRoutineIdPath: poolConfig.activeRoutineIdPath,
      singleActivePerPool: poolConfig.singleActivePerPool !== false,
    };
  }

  return {
    ...routineSystem,
    slotPools: slotPoolsSource,
    slotPoolsById,
  };
}

function normalizeLayerRoutineDefinitions(layer) {
  const routinesById = {};
  const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];

  for (const sublayer of sublayers) {
    const sections = Array.isArray(sublayer && sublayer.sections) ? sublayer.sections : [];
    for (const section of sections) {
      const elements = Array.isArray(section && section.elements) ? section.elements : [];
      for (const element of elements) {
        if (!isObject(element) || element.type !== 'routine' || typeof element.id !== 'string') {
          continue;
        }

        routinesById[element.id] = {
          ...element,
          slot: {
            ...element.slot,
            cost: Number.isInteger(element.slot && element.slot.cost) ? element.slot.cost : 1,
          },
        };
      }
    }
  }

  return routinesById;
}

function normalizeDefinitionForRuntime(definition) {
  const layers = Array.isArray(definition.layers) ? definition.layers : [];

  definition.layers = layers.map((layer) => {
    if (!isObject(layer)) {
      return layer;
    }

    const routineSystem = normalizeRoutineSlotPools(layer);
    const routineDefinitionsById = normalizeLayerRoutineDefinitions(layer);

    return {
      ...layer,
      routineSystem,
      runtime: {
        ...(isObject(layer.runtime) ? layer.runtime : {}),
        routineDefinitionsById,
      },
    };
  });

  return definition;
}

/**
 * Parse and validate a game definition JSON payload.
 * Startup policy: fail-fast on any schema/reference error.
 *
 * @param {string|Record<string, unknown>} rawDefinition
 * @returns {Record<string, unknown>}
 */
function parseGameDefinition(rawDefinition) {
  const parsed = typeof rawDefinition === 'string' ? JSON.parse(rawDefinition) : rawDefinition;

  const schemaIssues = validateGameDefinitionSchema(parsed);
  const refIssues = validateReferences(parsed);
  const issues = [...schemaIssues, ...refIssues];

  if (issues.length > 0) {
    throw new ValidationError(issues);
  }

  return normalizeDefinitionForRuntime(parsed);
}

module.exports = {
  parseGameDefinition,
};
