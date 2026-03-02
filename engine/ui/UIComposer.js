const { formatNodeRef } = require('../systems/unlocks/nodeRef');

class UIComposer {
  compose(definition, options = {}) {
    const getUnlockStatus = this.#resolveUnlockStatusGetter(options);
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    const uiLayers = [];
    for (const layer of layers) {
      const layerRef = formatNodeRef({ layer: layer.id });
      const layerStatus = getUnlockStatus(layerRef);
      if (!this.#shouldIncludeNode(layerStatus)) {
        continue;
      }

      const uiSublayers = layerStatus.unlocked ? this.#composeSublayers(layer, getUnlockStatus) : [];
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

  #composeSublayers(layer, getUnlockStatus) {
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
        sections: sublayerStatus.unlocked ? this.#composeSections(layer, sublayer, getUnlockStatus) : [],
      });
    }

    return uiSublayers;
  }

  #composeSections(layer, sublayer, getUnlockStatus) {
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
        elements: sectionStatus.unlocked ? this.#composeElements(layer, sublayer, section, getUnlockStatus) : [],
      });
    }

    return uiSections;
  }

  #composeElements(layer, sublayer, section, getUnlockStatus) {
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

      uiElements.push({
        id: element.id,
        type: element.type,
        nodeRef: elementRef,
        placeholder: !elementStatus.unlocked,
        unlockProgress: elementStatus.unlockProgress,
        title: element.title || element.id,
      });
    }

    return uiElements;
  }
}

module.exports = {
  UIComposer,
};
