function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getSection(model, section) {
  return model && model.progress && model.progress[section] && isObject(model.progress[section])
    ? model.progress[section]
    : { byId: {}, order: [] };
}

function buildResourceState(model) {
  const section = getSection(model, 'resources');

  return section.order.reduce((acc, id) => {
    if (typeof id !== 'string' || !isObject(section.byId[id])) {
      return acc;
    }

    acc[id] = asNumber(section.byId[id].start, 0);
    return acc;
  }, {});
}

function buildRoutineElements(model) {
  const section = getSection(model, 'routines');

  return section.order.flatMap((id) => {
    const routine = section.byId[id];
    if (typeof id !== 'string' || !isObject(routine) || !routine.producesResourceId) {
      return [];
    }

    const durationSec = asNumber(routine.durationSec, 1);
    const safeDurationSec = durationSec > 0 ? durationSec : 1;
    const producesAmount = asNumber(routine.producesAmount, 0);
    const consumesAmount = asNumber(routine.consumesAmount, 0);

    return [{
      id,
      type: 'routine',
      unlock: { always: true },
      mode: 'manual',
      slot: { poolId: 'workerSlots', cost: 1 },
      produces: [{ path: `resources.${routine.producesResourceId}`, perSecond: producesAmount / safeDurationSec }],
      consumes:
        routine.consumesResourceId && consumesAmount > 0
          ? [{ path: `resources.${routine.consumesResourceId}`, perSecond: consumesAmount / safeDurationSec }]
          : [],
    }];
  });
}

function buildBuyableElements(model) {
  const section = getSection(model, 'buyables');

  return section.order.flatMap((id) => {
    const buyable = section.byId[id];
    if (typeof id !== 'string' || !isObject(buyable)) {
      return [];
    }

    return [{
      id,
      type: 'buyable',
      title: buyable.name || id,
      unlock: { always: true },
      cost: {
        path: buyable.costResourceId ? `resources.${buyable.costResourceId}` : 'resources.gold',
        amount: asNumber(buyable.costAmount, 0),
      },
      grantsRoutineId: buyable.grantsRoutineId || null,
      effectTargetResourceId: buyable.effectTargetResourceId || null,
      effectAmount: asNumber(buyable.effectAmount, 0),
    }];
  });
}

function buildUpgradeElements(model, layerId, sublayerId, sectionId) {
  const section = getSection(model, 'upgrades');

  return section.order.flatMap((id) => {
    const upgrade = section.byId[id];
    if (typeof id !== 'string' || !isObject(upgrade)) {
      return [];
    }

    const targetRef = upgrade.targetBuyableId
      ? `layer:${layerId}/sublayer:${sublayerId}/section:${sectionId}/element:${upgrade.targetBuyableId}`
      : `layer:${layerId}/sublayer:${sublayerId}/section:${sectionId}/element:${id}`;

    return [{
      id,
      type: 'upgrade',
      title: upgrade.name || id,
      unlock: { always: true },
      cost: {
        path: upgrade.costResourceId ? `resources.${upgrade.costResourceId}` : 'resources.gold',
        amount: asNumber(upgrade.costAmount, 0),
      },
      multiplier: asNumber(upgrade.multiplier, 1),
      effect: { targetRef },
    }];
  });
}

function buildProgressLayer(model, layer) {
  const layerId = layer.id;
  const sublayerId = 'progression';
  const sectionId = 'main';

  return {
    id: layerId,
    type: 'progressLayer',
    title: layer.title || layerId,
    unlock: { always: true },
    routineSystem: {
      slotPools: {
        workerSlots: {
          totalPath: `layers.${layerId}.routinePools.workerSlots.total`,
          usedPath: `layers.${layerId}.routinePools.workerSlots.used`,
          activeRoutineIdPath: `layers.${layerId}.routinePools.workerSlots.activeRoutineId`,
          singleActivePerPool: true,
        },
      },
    },
    sublayers: [
      {
        id: sublayerId,
        type: 'progress',
        unlock: { always: true },
        sections: [
          {
            id: sectionId,
            elements: [
              ...buildRoutineElements(model),
              ...buildBuyableElements(model),
              ...buildUpgradeElements(model, layerId, sublayerId, sectionId),
            ],
          },
        ],
      },
    ],
  };
}

function buildArchetypeLayers(model) {
  const section = getSection(model, 'layers');
  const archetypes = section.order
    .map((id) => section.byId[id])
    .filter((layer) => isObject(layer) && typeof layer.id === 'string' && layer.id);

  if (archetypes.length === 0) {
    archetypes.push({ id: 'idle', type: 'progressLayer', title: 'Idle' });
  }

  return archetypes.map((layer) => {
    if (layer.type === 'inventoryLayer') {
      return {
        id: layer.id,
        type: 'inventoryLayer',
        title: layer.title || layer.id,
        unlock: { always: true },
        sublayers: [],
      };
    }

    if (layer.type === 'statisticsLayer') {
      return {
        id: layer.id,
        type: 'statisticsLayer',
        title: layer.title || layer.id,
        unlock: { always: true },
        sublayers: [],
      };
    }

    return buildProgressLayer(model, layer);
  });
}

function buildLayerState(model, layers) {
  const state = {};

  for (const layer of layers) {
    if (layer.type !== 'progressLayer') {
      continue;
    }

    state[layer.id] = {
      routinePools: {
        workerSlots: {
          total: 1,
          used: 0,
          activeRoutineId: null,
        },
      },
    };
  }

  return state;
}

export function buildGameDefinitionFromEditorModel(model) {
  const gameId = model && model.meta && model.meta.id ? model.meta.id : 'author-preview-game';
  const gameName = model && model.meta && model.meta.name ? model.meta.name : 'Author Preview';
  const layers = buildArchetypeLayers(model);

  return {
    meta: {
      schemaVersion: '1.2.0',
      gameId,
      name: gameName,
    },
    systems: {
      tickMs: 100,
    },
    state: {
      resources: buildResourceState(model),
      layers: buildLayerState(model, layers),
    },
    layers,
  };
}
