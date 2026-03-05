import { fromGameDefinition, toGameDefinition } from '../serialization/builderSerialization.js';

const CHILD_RULES = Object.freeze({
  Layer: ['SubLayer'],
  SubLayer: ['Section'],
  Section: ['Element'],
  Element: [],
});

const DEFAULT_NODE_DATA = Object.freeze({
  Layer: { type: 'progressLayer' },
  SubLayer: { type: 'progress' },
  Section: {},
  Element: { type: 'resource' },
});

function makeUiId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createNode(kind) {
  return {
    kind,
    uiId: makeUiId(),
    id: `${kind.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
    data: { ...DEFAULT_NODE_DATA[kind] },
    children: [],
  };
}

export function createBuilderStateFromDefinition(definition) {
  const { graph, pointerMaps } = fromGameDefinition(definition);
  return {
    graph,
    pointerMaps,
    selectedUiId: graph.layers[0]?.uiId || null,
    diagnostics: [],
  };
}

export function serializeBuilderState(state) {
  const { definition, pointerMaps } = toGameDefinition(state.graph);
  return { definition, pointerMaps };
}

function mutateGraph(nodes, uiId, updater) {
  return nodes.map((node) => {
    if (node.uiId === uiId) {
      return updater(node);
    }
    return { ...node, children: mutateGraph(node.children, uiId, updater) };
  });
}

function removeNode(nodes, uiId) {
  let removed = null;
  const nextNodes = [];

  for (const node of nodes) {
    if (node.uiId === uiId) {
      removed = node;
      continue;
    }
    const nested = removeNode(node.children, uiId);
    if (nested.removed) {
      removed = nested.removed;
      nextNodes.push({ ...node, children: nested.nextNodes });
    } else {
      nextNodes.push(node);
    }
  }

  return { nextNodes, removed };
}

export function addChildBlock(state, parentUiId, kind) {
  const nextState = { ...state, graph: { ...state.graph } };

  if (!parentUiId && kind === 'Layer') {
    const layer = createNode('Layer');
    nextState.graph.layers = [...nextState.graph.layers, layer];
    nextState.selectedUiId = layer.uiId;
    return nextState;
  }

  nextState.graph.layers = mutateGraph(nextState.graph.layers, parentUiId, (node) => {
    const allowed = CHILD_RULES[node.kind] || [];
    if (!allowed.includes(kind)) {
      return node;
    }
    const child = createNode(kind);
    nextState.selectedUiId = child.uiId;
    return { ...node, children: [...node.children, child] };
  });

  return nextState;
}

function findNode(nodes, uiId) {
  for (const node of nodes) {
    if (node.uiId === uiId) {
      return node;
    }
    const child = findNode(node.children, uiId);
    if (child) {
      return child;
    }
  }
  return null;
}

export function getNodeByUiId(state, uiId) {
  return findNode(state.graph.layers, uiId);
}

export function updateNodeField(state, uiId, key, value) {
  const graph = { ...state.graph };
  graph.layers = mutateGraph(graph.layers, uiId, (node) => {
    if (key === 'id') {
      return { ...node, id: value };
    }
    return { ...node, data: { ...node.data, [key]: value } };
  });

  return { ...state, graph };
}

function canNest(parentKind, childKind) {
  return (CHILD_RULES[parentKind] || []).includes(childKind);
}

export function moveBlock(state, draggedUiId, targetUiId) {
  if (!draggedUiId || !targetUiId || draggedUiId === targetUiId) {
    return state;
  }

  const dragged = getNodeByUiId(state, draggedUiId);
  const target = getNodeByUiId(state, targetUiId);

  if (!dragged || !target) {
    return state;
  }

  const sameKind = dragged.kind === target.kind;
  const next = { ...state, graph: { ...state.graph } };
  const extracted = removeNode(next.graph.layers, draggedUiId);
  if (!extracted.removed) {
    return state;
  }
  next.graph.layers = extracted.nextNodes;

  if (sameKind) {
    next.graph.layers = mutateGraph(next.graph.layers, targetUiId, (node) => node);
    const placeSibling = (nodes) => {
      const out = [];
      for (const node of nodes) {
        if (node.uiId === targetUiId) {
          out.push(extracted.removed);
        }
        out.push({ ...node, children: placeSibling(node.children) });
      }
      return out;
    };
    next.graph.layers = placeSibling(next.graph.layers);
    return next;
  }

  if (!canNest(target.kind, dragged.kind)) {
    return state;
  }

  next.graph.layers = mutateGraph(next.graph.layers, targetUiId, (node) => ({
    ...node,
    children: [...node.children, extracted.removed],
  }));

  return next;
}

export function setSelectedUiId(state, selectedUiId) {
  return { ...state, selectedUiId };
}

export const BUILDER_CHILD_RULES = CHILD_RULES;
