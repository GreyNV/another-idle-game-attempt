import { createPointerMaps } from './diagnosticMapping.js';

function makeUiId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeNode(kind, entity, childrenKey) {
  const data = { ...entity };
  delete data[childrenKey];

  return {
    kind,
    uiId: makeUiId(),
    id: entity.id || '',
    data,
    children: [],
  };
}

function attachPointer(pointerMaps, pointer, uiId) {
  pointerMaps.pointerToUiId[pointer] = uiId;
  pointerMaps.uiIdToPointerRoot[uiId] = pointer;
}

export function fromGameDefinition(definition) {
  const source = clone(definition || {});
  const pointerMaps = createPointerMaps();
  const graph = {
    meta: source.meta || {},
    systems: source.systems || {},
    state: source.state || {},
    rootExtras: Object.fromEntries(Object.entries(source).filter(([key]) => !['meta', 'systems', 'state', 'layers'].includes(key))),
    layers: [],
  };

  const layers = Array.isArray(source.layers) ? source.layers : [];

  layers.forEach((layer, layerIndex) => {
    const layerNode = makeNode('Layer', layer, 'sublayers');
    attachPointer(pointerMaps, `/layers/${layerIndex}`, layerNode.uiId);

    (layer.sublayers || []).forEach((sublayer, sublayerIndex) => {
      const subLayerNode = makeNode('SubLayer', sublayer, 'sections');
      attachPointer(pointerMaps, `/layers/${layerIndex}/sublayers/${sublayerIndex}`, subLayerNode.uiId);

      (sublayer.sections || []).forEach((section, sectionIndex) => {
        const sectionNode = makeNode('Section', section, 'elements');
        attachPointer(pointerMaps, `/layers/${layerIndex}/sublayers/${sublayerIndex}/sections/${sectionIndex}`, sectionNode.uiId);

        (section.elements || []).forEach((element, elementIndex) => {
          const elementNode = makeNode('Element', element, 'elements');
          attachPointer(
            pointerMaps,
            `/layers/${layerIndex}/sublayers/${sublayerIndex}/sections/${sectionIndex}/elements/${elementIndex}`,
            elementNode.uiId
          );
          sectionNode.children.push(elementNode);
        });

        subLayerNode.children.push(sectionNode);
      });

      layerNode.children.push(subLayerNode);
    });

    graph.layers.push(layerNode);
  });

  return { graph, pointerMaps };
}

function toLayer(node, pointerMaps, layerIndex) {
  const pointer = `/layers/${layerIndex}`;
  attachPointer(pointerMaps, pointer, node.uiId);

  const result = {
    ...clone(node.data),
    id: node.id,
    sublayers: node.children.map((sublayer, sublayerIndex) =>
      toSubLayer(sublayer, pointerMaps, `${pointer}/sublayers/${sublayerIndex}`)
    ),
  };

  return result;
}

function toSubLayer(node, pointerMaps, pointer) {
  attachPointer(pointerMaps, pointer, node.uiId);
  return {
    ...clone(node.data),
    id: node.id,
    sections: node.children.map((section, sectionIndex) =>
      toSection(section, pointerMaps, `${pointer}/sections/${sectionIndex}`)
    ),
  };
}

function toSection(node, pointerMaps, pointer) {
  attachPointer(pointerMaps, pointer, node.uiId);
  return {
    ...clone(node.data),
    id: node.id,
    elements: node.children.map((element, elementIndex) =>
      toElement(element, pointerMaps, `${pointer}/elements/${elementIndex}`)
    ),
  };
}

function toElement(node, pointerMaps, pointer) {
  attachPointer(pointerMaps, pointer, node.uiId);
  return {
    ...clone(node.data),
    id: node.id,
  };
}

export function toGameDefinition(builderGraph) {
  const pointerMaps = createPointerMaps();
  const definition = {
    ...(builderGraph.rootExtras || {}),
    meta: clone(builderGraph.meta || {}),
    systems: clone(builderGraph.systems || {}),
    state: clone(builderGraph.state || {}),
    layers: (builderGraph.layers || []).map((layer, layerIndex) => toLayer(layer, pointerMaps, layerIndex)),
  };

  return { definition, pointerMaps };
}
