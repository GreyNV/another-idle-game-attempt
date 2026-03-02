const { formatNodeRef } = require('../systems/unlocks/nodeRef');

class UIComposer {
  compose(definition, options = {}) {
    const isUnlocked = typeof options.isUnlocked === 'function' ? options.isUnlocked : () => true;
    const getUnlockStatus =
      typeof options.getUnlockStatus === 'function'
        ? options.getUnlockStatus
        : (nodeRef) => ({ unlocked: isUnlocked(nodeRef), progress: isUnlocked(nodeRef) ? 1 : 0, showPlaceholder: false });
    const layers = Array.isArray(definition.layers) ? definition.layers : [];

    const uiLayers = [];
    for (const layer of layers) {
      const layerRef = formatNodeRef({ layer: layer.id });
      const layerStatus = getUnlockStatus(layerRef);
      if (!layerStatus.unlocked && !layerStatus.showPlaceholder) {
        continue;
      }

      const uiSublayers = layerStatus.unlocked ? this.#composeSublayers(layer, isUnlocked, getUnlockStatus) : [];
      uiLayers.push({
        id: layer.id,
        title: layer.title || layer.id,
        type: layer.type,
        nodeRef: layerRef,
        placeholder: !layerStatus.unlocked,
        unlockProgress: layerStatus.progress,
        sublayers: uiSublayers,
      });
    }

    return {
      layers: uiLayers,
    };
  }

  #composeSublayers(layer, isUnlocked, getUnlockStatus) {
    const sublayers = Array.isArray(layer.sublayers) ? layer.sublayers : [];
    const uiSublayers = [];

    for (const sublayer of sublayers) {
      const sublayerRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id });
      const sublayerStatus = getUnlockStatus(sublayerRef);
      if (!sublayerStatus.unlocked && !sublayerStatus.showPlaceholder) {
        continue;
      }

      uiSublayers.push({
        id: sublayer.id,
        title: sublayer.title || sublayer.id,
        type: sublayer.type,
        nodeRef: sublayerRef,
        placeholder: !sublayerStatus.unlocked,
        unlockProgress: sublayerStatus.progress,
        sections: sublayerStatus.unlocked ? this.#composeSections(layer, sublayer, isUnlocked, getUnlockStatus) : [],
      });
    }

    return uiSublayers;
  }

  #composeSections(layer, sublayer, isUnlocked, getUnlockStatus) {
    const sections = Array.isArray(sublayer.sections) ? sublayer.sections : [];
    const uiSections = [];

    for (const section of sections) {
      const sectionRef = formatNodeRef({ layer: layer.id, sublayer: sublayer.id, section: section.id });
      const sectionStatus = getUnlockStatus(sectionRef);
      if (!sectionStatus.unlocked && !sectionStatus.showPlaceholder) {
        continue;
      }

      uiSections.push({
        id: section.id,
        title: section.title || section.id,
        nodeRef: sectionRef,
        placeholder: !sectionStatus.unlocked,
        unlockProgress: sectionStatus.progress,
        elements: sectionStatus.unlocked ? this.#composeElements(layer, sublayer, section, isUnlocked, getUnlockStatus) : [],
      });
    }

    return uiSections;
  }

  #composeElements(layer, sublayer, section, isUnlocked, getUnlockStatus) {
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
      if (!elementStatus.unlocked && !elementStatus.showPlaceholder) {
        continue;
      }

      uiElements.push({
        id: element.id,
        title: element.title || element.id,
        type: element.type,
        nodeRef: elementRef,
        placeholder: !elementStatus.unlocked,
        unlockProgress: elementStatus.progress,
      });
    }

    return uiElements;
  }
}

module.exports = {
  UIComposer,
};
