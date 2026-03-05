import { ENTITY_METADATA, SECTION_ORDER } from './metadata.js';

const DEMO_MODEL = {
  schemaVersion: 'progress-authoring/1',
  meta: { id: 'demo.game', name: 'Demo Game' },
  progress: {
    layers: {
      byId: {
        idle: { id: 'idle', title: 'Idle Layer', type: 'progressLayer' },
      },
      order: ['idle'],
    },
    resources: {
      byId: {
        gold: { id: 'gold', name: 'Gold', start: 0 },
      },
      order: ['gold'],
    },
    routines: { byId: {}, order: [] },
    buyables: { byId: {}, order: [] },
    upgrades: { byId: {}, order: [] },
  },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createInitialEditorState() {
  return {
    model: clone(DEMO_MODEL),
    selection: { nodeType: 'root', section: null, id: null },
    activeTab: 'properties',
  };
}

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-');
}

export function makeUniqueId(state, section, seed) {
  const safeSeed = sanitizeId(seed) || `${section.slice(0, -1)}-1`;
  const existing = state.model.progress[section].byId;
  if (!existing[safeSeed]) {
    return safeSeed;
  }

  let index = 2;
  let candidate = `${safeSeed}-${index}`;
  while (existing[candidate]) {
    index += 1;
    candidate = `${safeSeed}-${index}`;
  }

  return candidate;
}

function buildDefaults(section, id) {
  const defaults = ENTITY_METADATA[section].defaults;
  return { id, ...clone(defaults) };
}

function patchSection(state, section, updater) {
  const current = state.model.progress[section];
  const next = updater(current);
  return {
    ...state,
    model: {
      ...state.model,
      progress: {
        ...state.model.progress,
        [section]: next,
      },
    },
  };
}

export function updateSelection(state, selection) {
  return { ...state, selection };
}

export function setActiveTab(state, tab) {
  return { ...state, activeTab: tab };
}

export function createEntity(state, section, preferredId) {
  const id = makeUniqueId(state, section, preferredId || `${section.slice(0, -1)}-new`);
  const entity = buildDefaults(section, id);
  return updateSelection(
    patchSection(state, section, (current) => ({
      byId: { ...current.byId, [id]: entity },
      order: [...current.order, id],
    })),
    { nodeType: 'entity', section, id }
  );
}

export function duplicateEntity(state, section, id) {
  const source = state.model.progress[section].byId[id];
  if (!source) {
    return state;
  }
  const duplicateId = makeUniqueId(state, section, `${id}-copy`);
  const duplicate = { ...clone(source), id: duplicateId, name: `${source.name || id} Copy` };
  return updateSelection(
    patchSection(state, section, (current) => ({
      byId: { ...current.byId, [duplicateId]: duplicate },
      order: [...current.order, duplicateId],
    })),
    { nodeType: 'entity', section, id: duplicateId }
  );
}

function renameReference(value, oldId, nextId) {
  return value === oldId ? nextId : value;
}

export function renameEntityId(state, section, id, nextIdRaw) {
  const nextId = sanitizeId(nextIdRaw);
  if (!nextId || nextId === id || state.model.progress[section].byId[nextId]) {
    return state;
  }

  const source = state.model.progress[section].byId[id];
  if (!source) {
    return state;
  }

  let nextState = patchSection(state, section, (current) => {
    const byId = { ...current.byId };
    delete byId[id];
    byId[nextId] = { ...source, id: nextId };
    return { byId, order: current.order.map((entryId) => (entryId === id ? nextId : entryId)) };
  });

  const renameRefs = (targetSection, fields) => {
    nextState = patchSection(nextState, targetSection, (current) => {
      const byId = Object.fromEntries(
        current.order.map((entryId) => {
          const entry = current.byId[entryId];
          let changed = false;
          const patched = { ...entry };
          for (const field of fields) {
            const nextValue = renameReference(entry[field], id, nextId);
            if (nextValue !== entry[field]) {
              patched[field] = nextValue;
              changed = true;
            }
          }
          return [entryId, changed ? patched : entry];
        })
      );
      return { ...current, byId };
    });
  };

  if (section === 'resources') {
    renameRefs('routines', ['producesResourceId', 'consumesResourceId']);
    renameRefs('buyables', ['costResourceId', 'effectTargetResourceId']);
    renameRefs('upgrades', ['costResourceId', 'targetResourceId']);
  }

  if (section === 'routines') {
    renameRefs('buyables', ['grantsRoutineId']);
  }

  if (section === 'buyables') {
    renameRefs('upgrades', ['targetBuyableId']);
  }

  return updateSelection(nextState, { nodeType: 'entity', section, id: nextId });
}

export function deleteEntity(state, section, id) {
  const current = state.model.progress[section];
  if (!current.byId[id]) {
    return state;
  }
  const byId = { ...current.byId };
  delete byId[id];
  const nextState = patchSection(state, section, () => ({
    byId,
    order: current.order.filter((entryId) => entryId !== id),
  }));

  if (state.selection.section === section && state.selection.id === id) {
    return updateSelection(nextState, { nodeType: 'section', section, id: null });
  }

  return nextState;
}

export function reorderEntity(state, section, id, direction) {
  const current = state.model.progress[section];
  const index = current.order.indexOf(id);
  if (index < 0) {
    return state;
  }
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= current.order.length) {
    return state;
  }
  const nextOrder = [...current.order];
  [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
  return patchSection(state, section, (snapshot) => ({ ...snapshot, order: nextOrder }));
}

export function updateEntityField(state, section, id, field, value) {
  const current = state.model.progress[section].byId[id];
  if (!current) {
    return state;
  }
  return patchSection(state, section, (snapshot) => ({
    ...snapshot,
    byId: {
      ...snapshot.byId,
      [id]: {
        ...current,
        [field]: value,
      },
    },
  }));
}

export function modelToJsonText(model) {
  return JSON.stringify(model, null, 2);
}

export function applyAdvancedJson(state, text) {
  const parsed = JSON.parse(text);
  for (const section of SECTION_ORDER) {
    if (!parsed.progress?.[section]?.byId || !Array.isArray(parsed.progress?.[section]?.order)) {
      throw new Error(`Missing normalized section: ${section}`);
    }
  }
  return { ...state, model: parsed };
}
