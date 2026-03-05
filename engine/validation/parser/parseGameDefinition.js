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

function normalizeModifier(modifier) {
  if (!isObject(modifier)) {
    return modifier;
  }

  return {
    ...modifier,
    stacking: typeof modifier.stacking === 'string' ? modifier.stacking : 'stack',
    conditions: Array.isArray(modifier.conditions) ? modifier.conditions : [],
    enabled: modifier.enabled !== false,
  };
}

function normalizeSoftcap(softcap) {
  if (!isObject(softcap)) {
    return softcap;
  }

  return {
    ...softcap,
    targetRef: typeof softcap.targetRef === 'string' ? softcap.targetRef : softcap.scope,
    targetKey: typeof softcap.targetKey === 'string' ? softcap.targetKey : softcap.key,
    threshold: Number.isFinite(softcap.threshold) ? softcap.threshold : softcap.softcapAt,
    power: Number.isFinite(softcap.power) ? softcap.power : 0.5,
    multiplier: Number.isFinite(softcap.multiplier) ? softcap.multiplier : 1,
    priority: Number.isFinite(softcap.priority) ? softcap.priority : 0,
    enabled: softcap.enabled !== false,
  };
}

function normalizeDefinitionForRuntime(definition) {
  const layers = Array.isArray(definition.layers) ? definition.layers : [];
  definition.modifiers = Array.isArray(definition.modifiers) ? definition.modifiers.map(normalizeModifier) : [];

  definition.layers = layers.map((layer) => {
    if (!isObject(layer)) {
      return layer;
    }

    const routineSystem = normalizeRoutineSlotPools(layer);
    const routineDefinitionsById = normalizeLayerRoutineDefinitions(layer);
    const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];

    return {
      ...layer,
      modifiers: Array.isArray(layer.modifiers) ? layer.modifiers.map(normalizeModifier) : [],
      softcaps: Array.isArray(layer.softcaps) ? layer.softcaps.map(normalizeSoftcap) : [],
      sublayers: sublayers.map((sublayer) => {
        if (!isObject(sublayer)) {
          return sublayer;
        }

        const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
        return {
          ...sublayer,
          sections: sections.map((section) => {
            if (!isObject(section)) {
              return section;
            }

            const elements = Array.isArray(section.elements) ? section.elements : [];
            return {
              ...section,
              elements: elements.map((element) => {
                if (!isObject(element)) {
                  return element;
                }

                if (element.type !== 'buyable' && element.type !== 'upgrade') {
                  return element;
                }

                return {
                  ...element,
                  modifiers: Array.isArray(element.modifiers) ? element.modifiers.map(normalizeModifier) : [],
                };
              }),
            };
          }),
        };
      }),
      routineSystem,
      runtime: {
        ...(isObject(layer.runtime) ? layer.runtime : {}),
        routineDefinitionsById,
      },
    };
  });

  return definition;
}

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
