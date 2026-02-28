const { formatNodeRef } = require('../systems/unlocks/nodeRef');

class UIComposer {
  compose(definition, options = {}) {
    const isUnlocked = this.#resolveUnlockPredicate(options);
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    const uiLayers = [];
    for (const layer of layers) {
      const layerRef = formatNodeRef({ layer: layer.id });
      if (!isUnlocked(layerRef)) {
        continue;
      }

      const uiSublayers = this.#composeSublayers(layer, isUnlocked);
      uiLayers.push({
        id: layer.id,
        type: layer.type,
        nodeRef: layerRef,
        sublayers: uiSublayers,
      });
    }

    return {
      layers: uiLayers,
    };
  }

  #resolveUnlockPredicate(options) {
    if (typeof options.isUnlocked === 'function') {
      return options.isUnlocked;
    }

    const unlockState = options.unlockState;
    if (!unlockState) {
      return () => true;
    }

    if (Array.isArray(unlockState.unlockedRefs)) {
      return (nodeRef) => unlockState.unlockedRefs.includes(nodeRef);
    }

    if (unlockState.unlocked && typeof unlockState.unlocked === 'object') {
      return (nodeRef) => Boolean(unlockState.unlocked[nodeRef]);
    }

    return () => true;
  }

  #composeSublayers(layer, isUnlocked) {
    const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
    const uiSublayers = [];

    for (const sublayer of sublayers) {
      const sublayerRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id });
      if (!isUnlocked(sublayerRef)) {
        continue;
      }

      uiSublayers.push({
        id: sublayer.id,
        type: sublayer.type,
        nodeRef: sublayerRef,
        sections: this.#composeSections(layer, sublayer, isUnlocked),
      });
    }

    return uiSublayers;
  }

  #composeSections(layer, sublayer, isUnlocked) {
    const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
    const uiSections = [];

    for (const section of sections) {
      const sectionRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id, section: section.id });
      if (!isUnlocked(sectionRef)) {
        continue;
      }

      uiSections.push({
        id: section.id,
        nodeRef: sectionRef,
        elements: this.#composeElements(layer, sublayer, section, isUnlocked),
      });
    }

    return uiSections;
  }

  #composeElements(layer, sublayer, section, isUnlocked) {
    const elements = Array.isArray(section.elements) ? section.elements : [];
    const uiElements = [];

    for (const element of elements) {
      const elementRef = formatNodeRef({
        layer: layer.id,
        sublayer: sublayer.id,
        section: section.id,
        element: element.id,
      });
      if (!isUnlocked(elementRef)) {
        continue;
      }

      uiElements.push({
        id: element.id,
        type: element.type,
        nodeRef: elementRef,
      });
    }

    return uiElements;
  }
}

module.exports = {
  UIComposer,
};
