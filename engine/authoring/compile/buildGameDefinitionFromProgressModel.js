function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function buildResourceState(model) {
  const section = model && model.progress && model.progress.resources;
  const order = Array.isArray(section && section.order) ? section.order : [];
  const byId = isPlainObject(section && section.byId) ? section.byId : {};

  return order.reduce((acc, id) => {
    if (typeof id !== 'string' || !isPlainObject(byId[id])) {
      return acc;
    }
    acc[id] = asNumber(byId[id].start, 0);
    return acc;
  }, {});
}

function buildRoutineElements(model, layerId, sublayerId, sectionId) {
  const section = model && model.progress && model.progress.routines;
  const order = Array.isArray(section && section.order) ? section.order : [];
  const byId = isPlainObject(section && section.byId) ? section.byId : {};

  return order.flatMap((id) => {
    const routine = byId[id];
    if (typeof id !== 'string' || !isPlainObject(routine) || !routine.producesResourceId) {
      return [];
    }

    const durationSec = asNumber(routine.durationSec, 1);
    const safeDurationSec = durationSec > 0 ? durationSec : 1;
    const producesAmount = asNumber(routine.producesAmount, 0);
    const consumesAmount = asNumber(routine.consumesAmount, 0);

    const produces = [{ path: `resources.${routine.producesResourceId}`, perSecond: producesAmount / safeDurationSec }];
    if (routine.secondaryProducesResourceId) {
      produces.push({
        path: `resources.${routine.secondaryProducesResourceId}`,
        perSecond: asNumber(routine.secondaryProducesAmount, 0) / safeDurationSec,
      });
    }

    return [{
      id,
      type: 'routine',
      unlock: { always: true },
      mode: 'manual',
      slot: { poolId: 'workerSlots', cost: 1 },
      produces,
      consumes:
        routine.consumesResourceId && consumesAmount > 0
          ? [{ path: `resources.${routine.consumesResourceId}`, perSecond: consumesAmount / safeDurationSec }]
          : [],
    }];
  });
}

function buildBuyableElements(model) {
  const section = model && model.progress && model.progress.buyables;
  const order = Array.isArray(section && section.order) ? section.order : [];
  const byId = isPlainObject(section && section.byId) ? section.byId : {};

  return order.flatMap((id) => {
    const buyable = byId[id];
    if (typeof id !== 'string' || !isPlainObject(buyable)) {
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
      durationMultiplier: asNumber(buyable.durationMultiplier, 1),
    }];
  });
}

function buildUpgradeElements(model, layerId, sublayerId, sectionId) {
  const section = model && model.progress && model.progress.upgrades;
  const order = Array.isArray(section && section.order) ? section.order : [];
  const byId = isPlainObject(section && section.byId) ? section.byId : {};

  return order.flatMap((id) => {
    const upgrade = byId[id];
    if (typeof id !== 'string' || !isPlainObject(upgrade)) {
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
      targetBuyableId: upgrade.targetBuyableId || null,
      targetResourceId: upgrade.targetResourceId || null,
      effect: { targetRef },
    }];
  });
}

function buildGameDefinitionFromProgressModel(model) {
  const layerId = 'idle';
  const sublayerId = 'progression';
  const sectionId = 'main';

  return {
    meta: {
      schemaVersion: '1.2.0',
      gameId: model && model.meta && model.meta.id ? model.meta.id : 'progress-vertical-slice',
      name: model && model.meta && model.meta.name ? model.meta.name : 'Progress Vertical Slice',
    },
    systems: {
      tickMs: 100,
    },
    state: {
      resources: buildResourceState(model),
      layers: {
        [layerId]: {
          routinePools: {
            workerSlots: {
              total: 1,
              used: 0,
              activeRoutineId: null,
            },
          },
        },
      },
    },
    layers: [
      {
        id: layerId,
        type: 'progressLayer',
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
                  ...buildRoutineElements(model, layerId, sublayerId, sectionId),
                  ...buildBuyableElements(model),
                  ...buildUpgradeElements(model, layerId, sublayerId, sectionId),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

module.exports = {
  buildGameDefinitionFromProgressModel,
};
