const { parseNodeRef, formatNodeRef } = require('../../systems/unlocks/nodeRef');
const { validateGameDefinitionSchema } = require('../../validation/schema/validateGameDefinitionSchema');
const { validateReferences } = require('../../validation/references/validateReferences');

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

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
    const sublayerSet = new Set();
    index.sublayers.set(layer.id, sublayerSet);

    const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
    sublayers.forEach((sublayer) => {
      if (!isObject(sublayer) || typeof sublayer.id !== 'string') {
        return;
      }

      sublayerSet.add(sublayer.id);
      const sectionSet = new Set();
      index.sections.set(`${layer.id}/${sublayer.id}`, sectionSet);

      const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
      sections.forEach((section) => {
        if (!isObject(section) || typeof section.id !== 'string') {
          return;
        }

        sectionSet.add(section.id);
        const elementSet = new Set();
        index.elements.set(`${layer.id}/${sublayer.id}/${section.id}`, elementSet);

        const elements = Array.isArray(section.elements) ? section.elements : [];
        elements.forEach((element) => {
          if (isObject(element) && typeof element.id === 'string') {
            elementSet.add(element.id);
          }
        });
      });
    });
  });

  return index;
}

function resolveNodeRef(nodeRef, index) {
  const parsedResult = parseNodeRef(nodeRef);
  if (!parsedResult.ok) {
    return { ok: false, code: 'COMPILE_TARGET_PARSE', message: parsedResult.message };
  }

  const parsed = parsedResult.value;
  if (!index.layers.has(parsed.layer)) {
    return { ok: false, code: 'COMPILE_TARGET_UNRESOLVED', message: `Unknown layer "${parsed.layer}".` };
  }

  if (!parsed.sublayer) {
    return { ok: true, value: formatNodeRef(parsed) };
  }

  const sublayers = index.sublayers.get(parsed.layer);
  if (!sublayers || !sublayers.has(parsed.sublayer)) {
    return {
      ok: false,
      code: 'COMPILE_TARGET_UNRESOLVED',
      message: `Unknown sublayer "${parsed.sublayer}" under layer "${parsed.layer}".`,
    };
  }

  if (!parsed.section) {
    return { ok: true, value: formatNodeRef(parsed) };
  }

  const sections = index.sections.get(`${parsed.layer}/${parsed.sublayer}`);
  if (!sections || !sections.has(parsed.section)) {
    return {
      ok: false,
      code: 'COMPILE_TARGET_UNRESOLVED',
      message: `Unknown section "${parsed.section}" under ${parsed.layer}/${parsed.sublayer}.`,
    };
  }

  if (!parsed.element) {
    return { ok: true, value: formatNodeRef(parsed) };
  }

  const elements = index.elements.get(`${parsed.layer}/${parsed.sublayer}/${parsed.section}`);
  if (!elements || !elements.has(parsed.element)) {
    return {
      ok: false,
      code: 'COMPILE_TARGET_UNRESOLVED',
      message: `Unknown element "${parsed.element}" under ${parsed.layer}/${parsed.sublayer}/${parsed.section}.`,
    };
  }

  return { ok: true, value: formatNodeRef(parsed) };
}

function compileGameDefinition(definition) {
  const errors = [...validateGameDefinitionSchema(definition), ...validateReferences(definition)].map((issue) => ({
    code: issue.code || 'COMPILE_VALIDATION',
    message: issue.message || 'Validation issue.',
    path: issue.path || '/',
  }));

  if (!isObject(definition) || !Array.isArray(definition.layers)) {
    return { compiledGame: null, errors };
  }

  const compiledGame = {
    meta: cloneJson(definition.meta || {}),
    systems: cloneJson(definition.systems || {}),
    progress: {
      resources: { byId: {} },
      routines: { byId: {} },
      buyables: { byId: {} },
      upgrades: { byId: {} },
    },
    lookup: {
      targetToAffected: {},
    },
  };

  const resources = isObject(definition.state) && isObject(definition.state.resources) ? definition.state.resources : {};
  Object.entries(resources).forEach(([resourceId, value]) => {
    compiledGame.progress.resources.byId[resourceId] = {
      id: resourceId,
      start: Number.isFinite(value) ? value : 0,
    };
  });

  const typeBuckets = {
    routine: compiledGame.progress.routines.byId,
    buyable: compiledGame.progress.buyables.byId,
    upgrade: compiledGame.progress.upgrades.byId,
  };
  const firstSeenByType = {
    routine: new Map(),
    buyable: new Map(),
    upgrade: new Map(),
  };

  const nodeIndex = buildNodeIndex(definition.layers);

  definition.layers.forEach((layer, layerIdx) => {
    const sublayers = Array.isArray(layer && layer.sublayers) ? layer.sublayers : [];
    sublayers.forEach((sublayer, sublayerIdx) => {
      const sections = Array.isArray(sublayer && sublayer.sections) ? sublayer.sections : [];
      sections.forEach((section, sectionIdx) => {
        const elements = Array.isArray(section && section.elements) ? section.elements : [];
        elements.forEach((element, elementIdx) => {
          if (!isObject(element) || typeof element.id !== 'string') {
            return;
          }

          const elementPath = `/layers/${layerIdx}/sublayers/${sublayerIdx}/sections/${sectionIdx}/elements/${elementIdx}`;
          const type = element.type;
          if (!typeBuckets[type]) {
            return;
          }

          const seenPath = firstSeenByType[type].get(element.id);
          if (seenPath) {
            errors.push({
              code: 'COMPILE_DUPLICATE_PROGRESS_ENTITY_ID',
              message: `Duplicate ${type} id "${element.id}". First seen at ${seenPath}.`,
              path: `${elementPath}/id`,
            });
          } else {
            firstSeenByType[type].set(element.id, `${elementPath}/id`);
          }

          typeBuckets[type][element.id] = {
            ...cloneJson(element),
            path: elementPath,
            nodeRef: formatNodeRef({
              layer: layer.id,
              sublayer: sublayer.id,
              section: section.id,
              element: element.id,
            }),
          };

          if (isObject(element.effect) && typeof element.effect.targetRef === 'string') {
            const targetPath = `${elementPath}/effect/targetRef`;
            const targetResolution = resolveNodeRef(element.effect.targetRef, nodeIndex);
            if (!targetResolution.ok) {
              errors.push({
                code: targetResolution.code,
                message: `Invalid effect target "${element.effect.targetRef}": ${targetResolution.message}`,
                path: targetPath,
              });
            } else {
              if (!compiledGame.lookup.targetToAffected[targetResolution.value]) {
                compiledGame.lookup.targetToAffected[targetResolution.value] = [];
              }
              compiledGame.lookup.targetToAffected[targetResolution.value].push({
                sourceType: type,
                sourceId: element.id,
                sourcePath: elementPath,
              });
            }
          }

          if (type === 'routine') {
            const resourcePathChecks = [
              { key: 'produces', source: element.produces },
              { key: 'consumes', source: element.consumes },
              { key: 'requires', source: element.requires },
            ];

            resourcePathChecks.forEach(({ key, source }) => {
              if (!Array.isArray(source)) {
                return;
              }

              source.forEach((entry, entryIdx) => {
                if (!isObject(entry) || typeof entry.path !== 'string') {
                  return;
                }

                if (!entry.path.startsWith('resources.')) {
                  return;
                }

                const resourceId = entry.path.slice('resources.'.length);
                if (!compiledGame.progress.resources.byId[resourceId]) {
                  errors.push({
                    code: 'COMPILE_RESOURCE_UNRESOLVED',
                    message: `Routine "${element.id}" references unknown resource "${resourceId}".`,
                    path: `${elementPath}/${key}/${entryIdx}/path`,
                  });
                }
              });
            });
          }
        });
      });
    });
  });

  return {
    compiledGame,
    errors,
  };
}

module.exports = {
  compileGameDefinition,
};
