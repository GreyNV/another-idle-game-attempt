function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  const cloned = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = deepClone(entry);
  }
  return cloned;
}

class RoutineSystem {
  constructor(options = {}) {
    this.definition = options.definition || { layers: [] };
    this.stateStore = options.stateStore;
    this.modifierResolver = options.modifierResolver;
    this.multiplierCompiler = options.multiplierCompiler || null;
    this.characteristicSystem = options.characteristicSystem || null;
    this.eventBus = options.eventBus || null;
    this.index = this.#buildRoutineIndex(this.definition);
    this.activeByPool = new Map();

    if (!this.stateStore) {
      throw new Error('RoutineSystem requires stateStore.');
    }
    if (!this.modifierResolver) {
      throw new Error('RoutineSystem requires modifierResolver.');
    }
  }

  handleIntent(intentType, payload = {}) {
    if (!isPlainObject(payload)) {
      throw new Error('RoutineSystem intent payload must be an object.');
    }

    const layerId = payload.layerId;
    const routineId = payload.routineId;
    if (typeof layerId !== 'string' || layerId.length === 0) {
      throw new Error('RoutineSystem intent payload.layerId must be a non-empty string.');
    }
    if (typeof routineId !== 'string' || routineId.length === 0) {
      throw new Error('RoutineSystem intent payload.routineId must be a non-empty string.');
    }

    if (intentType === 'ROUTINE_START') {
      return this.#start(layerId, routineId, payload.reason || 'intent-start');
    }
    if (intentType === 'ROUTINE_STOP') {
      return this.#stop(layerId, routineId, payload.reason || 'intent-stop');
    }
    if (intentType === 'ROUTINE_TOGGLE') {
      const isActive = this.#isRoutineActive(layerId, routineId);
      if (isActive) {
        return this.#stop(layerId, routineId, payload.reason || 'intent-toggle-stop');
      }
      return this.#start(layerId, routineId, payload.reason || 'intent-toggle-start');
    }

    throw new Error(`RoutineSystem does not support intent type "${intentType}".`);
  }

  update(dtSeconds) {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) {
      throw new Error(`RoutineSystem.update requires finite, non-negative dtSeconds. Received: ${dtSeconds}`);
    }

    const activeEntries = this.#getDeterministicActiveEntries();
    const stoppedBeforeDelta = [];

    for (const entry of activeEntries) {
      if (!this.#canRemainActive(entry)) {
        this.#stop(entry.layerId, entry.id, 'auto-stop-prereq-failed');
        stoppedBeforeDelta.push(`${entry.layerId}/${entry.id}`);
      }
    }

    const survivingEntries = this.#getDeterministicActiveEntries();
    const applied = [];

    for (const entry of survivingEntries) {
      const multipliers = this.#resolveRoutineMultiplierSnapshot(entry);
      if (!this.#canAffordConsumes(entry, dtSeconds, multipliers.consumeMultiplier)) {
        this.#stop(entry.layerId, entry.id, 'auto-stop-consume-underflow');
        stoppedBeforeDelta.push(`${entry.layerId}/${entry.id}`);
        continue;
      }

      this.#applyResourceDeltaList(entry.produces || [], dtSeconds, multipliers.produceMultiplier);
      this.#applyResourceDeltaList(entry.consumes || [], dtSeconds, -multipliers.consumeMultiplier);
      applied.push({
        layerId: entry.layerId,
        routineId: entry.id,
        multipliers,
      });
    }

    return {
      stoppedBeforeDelta,
      applied,
      characteristics: this.characteristicSystem ? this.characteristicSystem.getSnapshot() : null,
    };
  }

  #canAffordConsumes(entry, dtSeconds, consumeMultiplier) {
    const consumes = Array.isArray(entry.consumes) ? entry.consumes : [];
    for (const consumeEntry of consumes) {
      if (!consumeEntry || typeof consumeEntry !== 'object') {
        continue;
      }
      const perSecond = consumeEntry.perSecond;
      if (!Number.isFinite(perSecond) || perSecond <= 0) {
        continue;
      }

      const currentValue = this.stateStore.get(consumeEntry.path);
      if (!Number.isFinite(currentValue)) {
        return false;
      }

      const required = perSecond * dtSeconds * consumeMultiplier;
      if (!Number.isFinite(required) || currentValue - required < 0) {
        return false;
      }
    }

    return true;
  }

  #start(layerId, routineId, reason) {
    const entry = this.#requireIndexedRoutine(layerId, routineId);
    const poolState = this.#getPoolStatePath(entry.layerId, entry.slot.poolId);
    const activeInPool = this.activeByPool.get(poolState) || null;

    if (activeInPool && (activeInPool.layerId !== layerId || activeInPool.routineId !== routineId)) {
      this.#stop(activeInPool.layerId, activeInPool.routineId, 'pool-preempted');
    }

    this.activeByPool.set(poolState, { layerId, routineId });
    this.stateStore.patch(this.#getRoutineStatePath(layerId, routineId), {
      active: true,
      lastStartReason: reason,
    });
    this.stateStore.set(poolState, `${layerId}/${routineId}`);

    return { ok: true, code: 'ROUTINE_STARTED', layerId, routineId };
  }

  #stop(layerId, routineId, reason) {
    const entry = this.#requireIndexedRoutine(layerId, routineId);
    const poolState = this.#getPoolStatePath(entry.layerId, entry.slot.poolId);
    const activeInPool = this.activeByPool.get(poolState);

    if (activeInPool && activeInPool.layerId === layerId && activeInPool.routineId === routineId) {
      this.activeByPool.delete(poolState);
      this.stateStore.set(poolState, null);
    }

    this.stateStore.patch(this.#getRoutineStatePath(layerId, routineId), {
      active: false,
      lastStopReason: reason,
    });

    return { ok: true, code: 'ROUTINE_STOPPED', layerId, routineId };
  }

  #isRoutineActive(layerId, routineId) {
    return this.stateStore.get(`${this.#getRoutineStatePath(layerId, routineId)}.active`) === true;
  }

  #canRemainActive(entry) {
    const requires = Array.isArray(entry.requires) ? entry.requires : [];
    const consumes = Array.isArray(entry.consumes) ? entry.consumes : [];

    for (const need of [...requires, ...consumes]) {
      const currentValue = this.stateStore.get(need.path);
      if (!Number.isFinite(currentValue)) {
        return false;
      }
      if (currentValue <= 0) {
        return false;
      }
    }

    return true;
  }

  #resolveRoutineMultiplierSnapshot(entry) {
    const scaling = isPlainObject(entry.scaling) ? entry.scaling : {};
    const speedKeys = Array.isArray(scaling.speedMultiplierKeys) ? scaling.speedMultiplierKeys : [];
    const yieldKeys = Array.isArray(scaling.yieldMultiplierKeys) ? scaling.yieldMultiplierKeys : [];
    const targetRef = `layer:${entry.layerId}`;

    const speedMultiplier = this.#resolveMultiplierFromKeys(targetRef, entry.layerId, speedKeys);
    const yieldMultiplier = this.#resolveMultiplierFromKeys(targetRef, entry.layerId, yieldKeys);

    return {
      speedMultiplier,
      yieldMultiplier,
      produceMultiplier: speedMultiplier * yieldMultiplier,
      consumeMultiplier: speedMultiplier,
    };
  }

  #resolveMultiplierFromKeys(targetRef, layerId, keys) {
    let total = 1;
    for (const key of keys) {
      const resolved = this.#resolveSingleMultiplier(targetRef, layerId, key);
      if (Number.isFinite(resolved) && resolved >= 0) {
        total *= resolved;
      }
    }
    return total;
  }

  #resolveSingleMultiplier(targetRef, layerId, key) {
    if (typeof key === 'string' && key.startsWith('mul.') && this.multiplierCompiler) {
      return this.multiplierCompiler.getValue(layerId, key);
    }

    return this.modifierResolver.resolve(targetRef, key, 1);
  }

  #applyResourceDeltaList(entries, dtSeconds, signAdjustedMultiplier) {
    for (const deltaEntry of entries) {
      if (!deltaEntry || typeof deltaEntry !== 'object') {
        continue;
      }
      const perSecond = deltaEntry.perSecond;
      if (!Number.isFinite(perSecond) || perSecond === 0) {
        continue;
      }

      const currentValue = this.stateStore.get(deltaEntry.path);
      if (!Number.isFinite(currentValue)) {
        continue;
      }

      const delta = perSecond * dtSeconds * signAdjustedMultiplier;
      const nextValue = currentValue + delta;
      this.stateStore.set(deltaEntry.path, nextValue < 0 ? 0 : nextValue);
    }
  }

  #getDeterministicActiveEntries() {
    const layers = Array.isArray(this.definition.layers) ? this.definition.layers : [];
    const active = [];

    for (const layer of layers) {
      const layerId = layer && layer.id;
      if (typeof layerId !== 'string') {
        continue;
      }

      const routinesByLayer = this.index.get(layerId);
      if (!routinesByLayer) {
        continue;
      }

      const routineIds = [...routinesByLayer.keys()].sort();
      for (const routineId of routineIds) {
        const entry = routinesByLayer.get(routineId);
        if (this.#isRoutineActive(layerId, routineId)) {
          active.push(entry);
        }
      }
    }

    return active;
  }

  #buildRoutineIndex(definition) {
    const index = new Map();
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    for (const layer of layers) {
      if (!layer || typeof layer.id !== 'string') {
        continue;
      }

      const byRoutineId = index.get(layer.id) || new Map();
      const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
      for (const sublayer of sublayers) {
        const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
        for (const section of sections) {
          const elements = Array.isArray(section.elements) ? section.elements : [];
          for (const element of elements) {
            if (!element || element.type !== 'routine' || typeof element.id !== 'string') {
              continue;
            }

            byRoutineId.set(element.id, {
              ...deepClone(element),
              layerId: layer.id,
            });
          }
        }
      }

      if (byRoutineId.size > 0) {
        index.set(layer.id, byRoutineId);
      }
    }

    return index;
  }

  #requireIndexedRoutine(layerId, routineId) {
    const byRoutineId = this.index.get(layerId);
    if (!byRoutineId || !byRoutineId.has(routineId)) {
      throw new Error(`Unknown routine: ${layerId}/${routineId}`);
    }

    return byRoutineId.get(routineId);
  }

  #getRoutineStatePath(layerId, routineId) {
    return `layers.${layerId}.routines.${routineId}`;
  }

  #getPoolStatePath(layerId, poolId) {
    return `layers.${layerId}.routinePools.${poolId}.activeRoutine`;
  }
}

module.exports = {
  RoutineSystem,
};
