import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const stateModule = await import(pathToFileURL(path.join(repoRoot, 'apps/author-ui/src/editor/state.js')).href);
const { buildGameDefinitionFromProgressModel } = await import(pathToFileURL(path.join(repoRoot, 'engine/authoring/compile/buildGameDefinitionFromProgressModel.js')).href);

const { createInitialEditorState, createEntity, updateEntityField } = stateModule;

function applyEditorFlows() {
  let state = createInitialEditorState();

  state = updateEntityField(state, 'resources', 'gold', 'name', 'Gold');
  state = updateEntityField(state, 'resources', 'gold', 'start', 5);

  state = createEntity(state, 'resources', 'xp');
  state = updateEntityField(state, 'resources', 'xp', 'name', 'XP');
  state = updateEntityField(state, 'resources', 'xp', 'start', 0);

  state = createEntity(state, 'routines', 'beg');
  state = updateEntityField(state, 'routines', 'beg', 'name', 'Beg');
  state = updateEntityField(state, 'routines', 'beg', 'producesResourceId', 'gold');
  state = updateEntityField(state, 'routines', 'beg', 'producesAmount', 1);
  state = updateEntityField(state, 'routines', 'beg', 'consumesResourceId', '');
  state = updateEntityField(state, 'routines', 'beg', 'consumesAmount', 0);
  state = updateEntityField(state, 'routines', 'beg', 'durationSec', 2);
  state = updateEntityField(state, 'routines', 'beg', 'secondaryProducesResourceId', 'xp');
  state = updateEntityField(state, 'routines', 'beg', 'secondaryProducesAmount', 1);

  state = createEntity(state, 'buyables', 'better-cup');
  state = updateEntityField(state, 'buyables', 'better-cup', 'name', 'Better Cup');
  state = updateEntityField(state, 'buyables', 'better-cup', 'costResourceId', 'gold');
  state = updateEntityField(state, 'buyables', 'better-cup', 'costAmount', 10);
  state = updateEntityField(state, 'buyables', 'better-cup', 'effectTargetResourceId', 'gold');
  state = updateEntityField(state, 'buyables', 'better-cup', 'effectAmount', 1);
  state = updateEntityField(state, 'buyables', 'better-cup', 'grantsRoutineId', 'beg');

  state = createEntity(state, 'buyables', 'swift-hands');
  state = updateEntityField(state, 'buyables', 'swift-hands', 'name', 'Swift Hands');
  state = updateEntityField(state, 'buyables', 'swift-hands', 'costResourceId', 'xp');
  state = updateEntityField(state, 'buyables', 'swift-hands', 'costAmount', 5);
  state = updateEntityField(state, 'buyables', 'swift-hands', 'durationMultiplier', 0.8);

  state = createEntity(state, 'upgrades', 'motivation');
  state = updateEntityField(state, 'upgrades', 'motivation', 'name', 'Motivation');
  state = updateEntityField(state, 'upgrades', 'motivation', 'costResourceId', 'xp');
  state = updateEntityField(state, 'upgrades', 'motivation', 'costAmount', 15);
  state = updateEntityField(state, 'upgrades', 'motivation', 'targetBuyableId', 'better-cup');
  state = updateEntityField(state, 'upgrades', 'motivation', 'multiplier', 2);

  return state.model;
}

const model = applyEditorFlows();
const gameDefinition = buildGameDefinitionFromProgressModel(model);

const output = {
  ...model,
  generated: {
    source: 'apps/author-ui/src/editor/state.js flows',
    script: 'scripts/generate-progress-vertical-slice.mjs',
    generatedAt: new Date().toISOString(),
  },
  runtimePreview: {
    gameDefinition,
  },
};

const outPath = path.join(repoRoot, 'content/examples/progress-vertical-slice.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
