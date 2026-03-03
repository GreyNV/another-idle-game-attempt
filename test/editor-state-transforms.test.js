const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadEditorStateModule() {
  const filePath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'editor', 'state.js');
  return import(pathToFileURL(filePath).href);
}

async function run() {
  const {
    createEntity,
    createInitialEditorState,
    renameEntityId,
    reorderEntity,
    updateEntityField,
  } = await loadEditorStateModule();

  let state = createInitialEditorState();
  state = createEntity(state, 'resources', 'energy');
  state = createEntity(state, 'routines', 'mine');
  state = updateEntityField(state, 'routines', 'mine', 'producesResourceId', 'energy');
  state = createEntity(state, 'buyables', 'drill');
  state = updateEntityField(state, 'buyables', 'drill', 'costResourceId', 'energy');
  state = updateEntityField(state, 'buyables', 'drill', 'effectTargetResourceId', 'energy');
  state = createEntity(state, 'upgrades', 'boost');
  state = updateEntityField(state, 'upgrades', 'boost', 'costResourceId', 'energy');
  state = updateEntityField(state, 'upgrades', 'boost', 'targetResourceId', 'energy');
  state = updateEntityField(state, 'buyables', 'drill', 'grantsRoutineId', 'mine');

  state = renameEntityId(state, 'resources', 'energy', 'mana');
  assert.ok(state.model.progress.resources.byId.mana, 'renamed resource exists');
  assert.strictEqual(state.model.progress.routines.byId.mine.producesResourceId, 'mana');
  assert.strictEqual(state.model.progress.buyables.byId.drill.costResourceId, 'mana');
  assert.strictEqual(state.model.progress.buyables.byId.drill.effectTargetResourceId, 'mana');
  assert.strictEqual(state.model.progress.upgrades.byId.boost.costResourceId, 'mana');
  assert.strictEqual(state.model.progress.upgrades.byId.boost.targetResourceId, 'mana');

  state = renameEntityId(state, 'routines', 'mine', 'harvest');
  assert.strictEqual(state.model.progress.buyables.byId.drill.grantsRoutineId, 'harvest');

  const beforeById = state.model.progress.resources.byId;
  const beforeOrder = [...state.model.progress.resources.order];
  state = reorderEntity(state, 'resources', 'mana', 'up');
  assert.deepStrictEqual(Object.keys(state.model.progress.resources.byId).sort(), Object.keys(beforeById).sort());
  assert.deepStrictEqual(
    [...state.model.progress.resources.order].sort(),
    [...beforeOrder].sort(),
    'reorder keeps same ids in order list'
  );

  console.log('editor-state-transforms tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
