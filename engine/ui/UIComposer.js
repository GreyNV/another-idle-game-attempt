const { formatNodeRef } = require('../systems/unlocks/nodeRef');

class UIComposer {
  compose(definition, options = {}) {
    const getUnlockStatus = this.#resolveUnlockStatusGetter(options);
    const getStateValue = this.#resolveStateGetter(options);
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    const uiLayers = [];
    for (const layer of layers) {
      const layerRef = formatNodeRef({ layer: layer.id });
      const layerStatus = getUnlockStatus(layerRef);
      if (!this.#shouldIncludeNode(layerStatus)) {
        continue;
      }

      const uiSublayers = layerStatus.unlocked ? this.#composeSublayers(layer, getUnlockStatus, getStateValue) : [];
      uiLayers.push({
        id: layer.id,
        type: layer.type,
        nodeRef: layerRef,
        placeholder: !layerStatus.unlocked,
        unlockProgress: layerStatus.unlockProgress,
        title: layer.title || layer.id,
        sublayers: uiSublayers,
      });
    }

    return {
      layers: uiLayers,
    };
  }

  #resolveStateGetter(options) {
    if (typeof options.getStateValue === 'function') {
      return (path) => options.getStateValue(path);
    }

    const stateSnapshot = options.stateSnapshot;
    if (stateSnapshot && typeof stateSnapshot === 'object') {
      return (path) => {
        const segments = String(path).split('.');
        let cursor = stateSnapshot;
        for (const segment of segments) {
          if (!cursor || typeof cursor !== 'object') {
            return undefined;
          }
          cursor = cursor[segment];
        }
        return cursor;
      };
    }

    return () => undefined;
  }

  #resolveUnlockStatusGetter(options) {
    if (typeof options.getUnlockStatus === 'function') {
      return (nodeRef) => this.#normalizeUnlockStatus(options.getUnlockStatus(nodeRef));
    }

    const unlockState = options.unlockState;
    const fallbackGetter = this.#resolveLegacyUnlockStatusGetter(options, unlockState);

    if (unlockState && unlockState.statusByRef && typeof unlockState.statusByRef === 'object') {
      return (nodeRef) => {
        const status = unlockState.statusByRef[nodeRef];
        if (status && typeof status === 'object') {
          return this.#normalizeUnlockStatus(status);
        }

        return fallbackGetter(nodeRef);
      };
    }

    return fallbackGetter;
  }

  #resolveLegacyUnlockStatusGetter(options, unlockState) {
    if (typeof options.isUnlocked === 'function') {
      return (nodeRef) => this.#normalizeUnlockStatus({ unlocked: options.isUnlocked(nodeRef) });
    }

    if (!unlockState) {
      return () => this.#normalizeUnlockStatus({ unlocked: true });
    }

    if (Array.isArray(unlockState.unlockedRefs)) {
      return (nodeRef) => this.#normalizeUnlockStatus({ unlocked: unlockState.unlockedRefs.includes(nodeRef) });
    }

    if (unlockState.unlocked && typeof unlockState.unlocked === 'object') {
      return (nodeRef) => this.#normalizeUnlockStatus({ unlocked: Boolean(unlockState.unlocked[nodeRef]) });
    }

    return () => this.#normalizeUnlockStatus({ unlocked: true });
  }

  #normalizeUnlockStatus(status) {
    const unlocked = Boolean(status && status.unlocked);
    const unlockProgress = Number.isFinite(status && status.progress)
      ? status.progress
      : Number.isFinite(status && status.unlockProgress)
        ? status.unlockProgress
        : unlocked
          ? 1
          : 0;
    const showPlaceholder = Boolean(status && status.showPlaceholder);

    return {
      unlocked,
      unlockProgress,
      showPlaceholder,
    };
  }

  #shouldIncludeNode(status) {
    return status.unlocked || status.showPlaceholder;
  }

  #composeSublayers(layer, getUnlockStatus, getStateValue) {
    const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
    const uiSublayers = [];

    for (const sublayer of sublayers) {
      const sublayerRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id });
      const sublayerStatus = getUnlockStatus(sublayerRef);
      if (!this.#shouldIncludeNode(sublayerStatus)) {
        continue;
      }

      uiSublayers.push({
        id: sublayer.id,
        type: sublayer.type,
        nodeRef: sublayerRef,
        placeholder: !sublayerStatus.unlocked,
        unlockProgress: sublayerStatus.unlockProgress,
        title: sublayer.title || sublayer.id,
        sections: sublayerStatus.unlocked ? this.#composeSections(layer, sublayer, getUnlockStatus, getStateValue) : [],
      });
    }

    return uiSublayers;
  }

  #composeSections(layer, sublayer, getUnlockStatus, getStateValue) {
    const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
    const uiSections = [];

    for (const section of sections) {
      const sectionRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id, section: section.id });
      const sectionStatus = getUnlockStatus(sectionRef);
      if (!this.#shouldIncludeNode(sectionStatus)) {
        continue;
      }

      uiSections.push({
        id: section.id,
        nodeRef: sectionRef,
        placeholder: !sectionStatus.unlocked,
        unlockProgress: sectionStatus.unlockProgress,
        title: section.title || section.id,
        elements: sectionStatus.unlocked ? this.#composeElements(layer, sublayer, section, getUnlockStatus, getStateValue) : [],
      });
    }

    return uiSections;
  }

  #composeElements(layer, sublayer, section, getUnlockStatus, getStateValue) {
    const elements = Array.isArray(section.elements) ? section.elements : [];
    const uiElements = [];

    for (const element of elements) {
      const elementRef = formatNodeRef({
        layer: layer.id,
        sublayer: sublayer.id,
        section: section.id,
        element: element.id,
      });
      const elementStatus = getUnlockStatus(elementRef);
      if (!this.#shouldIncludeNode(elementStatus)) {
        continue;
      }

      const baseElementViewModel = {
        id: element.id,
        type: element.type,
        nodeRef: elementRef,
        placeholder: !elementStatus.unlocked,
        unlockProgress: elementStatus.unlockProgress,
        title: element.title || element.id,
      };

      uiElements.push(this.#composeRendererFacingElementViewModel(layer, element, baseElementViewModel, getStateValue));
    }

    return uiElements;
  }

  #composeRendererFacingElementViewModel(layer, element, baseElementViewModel, getStateValue) {
    if (element.type !== 'routine') {
      return baseElementViewModel;
    }

    const layerId = layer.id;
    const routineId = element.id;
    const poolId = element.slot && element.slot.poolId;
    const poolConfig =
      layer.routineSystem && layer.routineSystem.slotPoolsById && poolId
        ? layer.routineSystem.slotPoolsById[poolId]
        : null;

    const active = getStateValue(`layers.${layerId}.routines.${routineId}.active`) === true;
    const used = poolConfig ? getStateValue(poolConfig.usedPath) : undefined;
    const total = poolConfig ? getStateValue(poolConfig.totalPath) : undefined;

    return {
      ...baseElementViewModel,
      active,
      status: active ? 'active' : 'inactive',
      pool: {
        poolId,
        used: Number.isFinite(used) ? used : null,
        total: Number.isFinite(total) ? total : null,
      },
      intents: {
        toggle: {
          type: 'ROUTINE_TOGGLE',
          payload: {
            layerId,
            routineId,
            poolId,
          },
        },
      },
    };
  }
}

module.exports = {
  UIComposer,
};
