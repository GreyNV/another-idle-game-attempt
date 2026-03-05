import { useMemo, useState } from 'react';
import {
  applyAdvancedJson,
  createEntity,
  createInitialEditorState,
  deleteEntity,
  duplicateEntity,
  modelToJsonText,
  renameEntityId,
  reorderEntity,
  setActiveTab,
  updateEntityField,
  updateSelection,
} from './editor/state.js';
import { ENTITY_METADATA, PALETTE_GROUPS, SECTION_LABELS } from './editor/metadata.js';
import { buildGameDefinitionFromEditorModel } from './editor/previewDefinition.js';
import { PreviewPage } from './preview/PreviewPage.jsx';

function renderTree(_editorState, onSelect) {
  return (
    <div className="tree-panel panel">
      <h2>Builder Palette</h2>
      <button onClick={() => onSelect({ nodeType: 'root', section: null, id: null })}>Root</button>
      {PALETTE_GROUPS.map((group) => (
        <div key={group.id}>
          <h3>{group.label}</h3>
          <ul>
            {group.kinds.map((section) => (
              <li key={section}>
                <button onClick={() => onSelect({ nodeType: 'section', section, id: null })}>{SECTION_LABELS[section]}</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function getSelectedEntity(state) {
  if (state.selection.nodeType !== 'entity') {
    return null;
  }
  const { section, id } = state.selection;
  return state.model.progress[section]?.byId[id] || null;
}

function castValue(type, value) {
  if (type === 'number') {
    const num = Number(value);
    return Number.isNaN(num) ? 0 : num;
  }
  return value;
}

function PropertiesPanel({ editorState, dispatch }) {
  const { selection } = editorState;
  const selectedEntity = getSelectedEntity(editorState);

  if (selection.nodeType === 'root') {
    return <p>Select a section or entity from the tree to begin authoring.</p>;
  }

  if (selection.nodeType === 'section') {
    return (
      <div>
        <h3>{SECTION_LABELS[selection.section]}</h3>
        <p>Manage {SECTION_LABELS[selection.section].toLowerCase()} entries from this section.</p>
        <button onClick={() => dispatch((state) => createEntity(state, selection.section))}>Create {ENTITY_METADATA[selection.section].label}</button>
      </div>
    );
  }

  if (!selectedEntity) {
    return <p>Selection is stale. Choose another node.</p>;
  }

  const metadata = ENTITY_METADATA[selection.section];
  const sectionState = editorState.model.progress[selection.section];

  return (
    <div>
      <h3>{metadata.label}: {selectedEntity.id}</h3>
      <div className="actions">
        <button onClick={() => dispatch((state) => createEntity(state, selection.section))}>Create</button>
        <button onClick={() => dispatch((state) => duplicateEntity(state, selection.section, selection.id))}>Duplicate</button>
        <button onClick={() => dispatch((state) => deleteEntity(state, selection.section, selection.id))}>Delete</button>
        <button onClick={() => dispatch((state) => reorderEntity(state, selection.section, selection.id, 'up'))}>Move Up</button>
        <button onClick={() => dispatch((state) => reorderEntity(state, selection.section, selection.id, 'down'))}>Move Down</button>
      </div>
      {metadata.fields.map((field) => {
        const isId = field.type === 'id';
        const optionsSection = field.type.startsWith('ref:') ? field.type.split(':')[1] : null;
        const enumOptions = field.type.startsWith('enum:') ? field.type.split(':')[1].split('|').filter(Boolean) : null;
        const value = selectedEntity[field.key] ?? '';
        return (
          <label key={field.key} className="field-row">
            <span>{field.label}{field.required ? ' *' : ''}</span>
            {optionsSection ? (
              <select
                value={value}
                onChange={(event) =>
                  dispatch((state) => updateEntityField(state, selection.section, selection.id, field.key, event.target.value))
                }
              >
                <option value="">(none)</option>
                {editorState.model.progress[optionsSection].order.map((optionId) => (
                  <option key={optionId} value={optionId}>{optionId}</option>
                ))}
              </select>
            ) : enumOptions ? (
              <select
                value={value}
                onChange={(event) =>
                  dispatch((state) => updateEntityField(state, selection.section, selection.id, field.key, event.target.value))
                }
              >
                {enumOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                value={value}
                onChange={(event) => {
                  if (isId) {
                    dispatch((state) => renameEntityId(state, selection.section, selection.id, event.target.value));
                    return;
                  }
                  dispatch((state) =>
                    updateEntityField(
                      state,
                      selection.section,
                      selection.id,
                      field.key,
                      castValue(field.type, event.target.value)
                    )
                  );
                }}
              />
            )}
          </label>
        );
      })}
      <p>Section order index: {sectionState.order.indexOf(selection.id) + 1} / {sectionState.order.length}</p>
    </div>
  );
}

export function App() {
  const [editorState, setEditorState] = useState(createInitialEditorState);
  const [advancedDraft, setAdvancedDraft] = useState('');
  const [advancedError, setAdvancedError] = useState('');

  const dispatch = (updater) => setEditorState((prev) => updater(prev));

  const selectedSectionEntries = useMemo(() => {
    if (editorState.selection.nodeType !== 'section') {
      return [];
    }
    const section = editorState.selection.section;
    return editorState.model.progress[section].order;
  }, [editorState]);

  const advancedText = modelToJsonText(editorState.model);
  const previewDefinition = useMemo(() => buildGameDefinitionFromEditorModel(editorState.model), [editorState.model]);

  return (
    <main className="workspace">
      {renderTree(editorState, (selection) => dispatch((state) => updateSelection(state, selection)))}

      <section className="panel content-panel">
        <header className="panel-header">
          <h2>Authoring Workspace</h2>
          <div className="tabs">
            <button className={editorState.activeTab === 'properties' ? 'active' : ''} onClick={() => dispatch((s) => setActiveTab(s, 'properties'))}>Tree + Forms</button>
            <button className={editorState.activeTab === 'advanced' ? 'active' : ''} onClick={() => {
              setAdvancedDraft(advancedText);
              dispatch((s) => setActiveTab(s, 'advanced'));
            }}>Advanced JSON</button>
            <button className={editorState.activeTab === 'preview' ? 'active' : ''} onClick={() => dispatch((s) => setActiveTab(s, 'preview'))}>Preview</button>
          </div>
        </header>

        {editorState.activeTab === 'properties' ? (
          <div>
            {editorState.selection.nodeType === 'section' ? (
              <ul>
                {selectedSectionEntries.map((id) => (
                  <li key={id}>
                    <button onClick={() => dispatch((state) => updateSelection(state, { nodeType: 'entity', section: editorState.selection.section, id }))}>{id}</button>
                  </li>
                ))}
              </ul>
            ) : null}
            <PropertiesPanel editorState={editorState} dispatch={dispatch} />
          </div>
        ) : editorState.activeTab === 'advanced' ? (
          <div>
            <textarea rows={22} value={advancedDraft} onChange={(event) => setAdvancedDraft(event.target.value)} spellCheck={false} />
            <div className="actions">
              <button onClick={() => {
                try {
                  setEditorState((state) => applyAdvancedJson(state, advancedDraft));
                  setAdvancedError('');
                } catch (error) {
                  setAdvancedError(error instanceof Error ? error.message : String(error));
                }
              }}>Apply JSON</button>
            </div>
            {advancedError ? <p className="error">{advancedError}</p> : null}
          </div>
        ) : (
          <PreviewPage definition={previewDefinition} />
        )}
      </section>
    </main>
  );
}
