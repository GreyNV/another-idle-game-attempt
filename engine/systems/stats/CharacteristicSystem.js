class CharacteristicSystem {
  constructor(options = {}) {
    this.definition = options.definition || { layers: [] };
    this.stateStore = options.stateStore;
    this.derivedPath = options.derivedPath || 'characteristics';
    this.index = this.#buildIndex(this.definition);
    this.snapshot = { byLayer: {} };

    if (!this.stateStore) {
      throw new Error('CharacteristicSystem requires stateStore.');
    }
  }

  update() {
    const byLayer = {};

    for (const layerEntry of this.index) {
      const layerSnapshot = {};

      for (const stat of layerEntry.characteristics) {
        const xp = this.stateStore.get(stat.xpPath);
        const level = this.stateStore.get(stat.levelPath);

        let nextXp = Number.isFinite(xp) ? xp : 0;
        let nextLevel = Number.isInteger(level) && level >= 0 ? level : 0;
        const levelBefore = nextLevel;
        const xpBefore = nextXp;

        let requiredXp = this.#xpRequiredForNextLevel(stat.curve, nextLevel);
        while (nextXp >= requiredXp && requiredXp > 0) {
          nextXp -= requiredXp;
          nextLevel += 1;
          requiredXp = this.#xpRequiredForNextLevel(stat.curve, nextLevel);
        }

        if (nextLevel !== levelBefore || nextXp !== xpBefore) {
          this.stateStore.set(stat.levelPath, nextLevel);
          this.stateStore.set(stat.xpPath, nextXp);
        }

        layerSnapshot[stat.id] = {
          id: stat.id,
          level: nextLevel,
          xp: nextXp,
          xpToNextLevel: requiredXp,
          levelsGained: nextLevel - levelBefore,
        };
      }

      byLayer[layerEntry.layerId] = layerSnapshot;
    }

    this.snapshot = { byLayer };
    this.stateStore.setDerived(this.derivedPath, this.snapshot);
    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot;
  }

  #xpRequiredForNextLevel(curve, level) {
    const baseXp = Number.isFinite(curve.baseXp) ? curve.baseXp : 10;
    const growth = Number.isFinite(curve.growth) ? curve.growth : 1;
    const exponent = Number.isFinite(curve.exponent) ? curve.exponent : 1;
    const required = Math.floor(baseXp + growth * Math.pow(level, exponent));
    return required > 0 ? required : 1;
  }

  #buildIndex(definition) {
    const layers = Array.isArray(definition.layers) ? definition.layers : [];
    const index = [];

    for (const layer of layers) {
      if (!layer || typeof layer.id !== 'string') {
        continue;
      }

      const definitions = Array.isArray(layer.characteristics) ? layer.characteristics : [];
      const characteristics = definitions
        .filter((entry) => entry && typeof entry.id === 'string')
        .map((entry) => ({
          id: entry.id,
          xpPath: entry.xpPath || `layers.${layer.id}.characteristics.${entry.id}.xp`,
          levelPath: entry.levelPath || `layers.${layer.id}.characteristics.${entry.id}.level`,
          curve: entry.curve || {},
        }));

      if (characteristics.length > 0) {
        index.push({ layerId: layer.id, characteristics });
      }
    }

    return index;
  }
}

module.exports = {
  CharacteristicSystem,
};
