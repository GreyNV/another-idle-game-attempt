import { useMemo, useState } from 'react';
import { BlockPalette } from './components/BlockPalette.jsx';
import { HierarchyTree } from './components/HierarchyTree.jsx';
import { InspectorPanel } from './components/InspectorPanel.jsx';
import {
  addChildBlock,
  createBuilderStateFromDefinition,
  getNodeByUiId,
  moveBlock,
  serializeBuilderState,
  setSelectedUiId,
  updateNodeField,
} from './state/builderState.js';
import { resolveUiIdFromDiagnosticPath } from './serialization/diagnosticMapping.js';

const INITIAL_DEFINITION = {
  meta: { schemaVersion: '1.2.0', gameId: 'author-ui-builder' },
  systems: { tickMs: 100 },
  state: {},
  layers: [],
};

export function BuilderPage() {
  const [builderState, setBuilderState] = useState(() => createBuilderStateFromDefinition(INITIAL_DEFINITION));
  const [validateError, setValidateError] = useState('');

  const selectedNode = getNodeByUiId(builderState, builderState.selectedUiId);

  const diagnosticsByUiId = useMemo(() => {
    const map = {};
    for (const diagnostic of builderState.diagnostics) {
      const uiId = resolveUiIdFromDiagnosticPath(diagnostic.path, builderState.pointerMaps.pointerToUiId);
      if (!uiId) {
        continue;
      }
      if (!map[uiId]) {
        map[uiId] = [];
      }
      map[uiId].push(diagnostic);
    }
    return map;
  }, [builderState.diagnostics, builderState.pointerMaps.pointerToUiId]);

  const runValidate = async () => {
    const { definition, pointerMaps } = serializeBuilderState(builderState);
    setBuilderState((current) => ({ ...current, pointerMaps }));

    try {
      const response = await fetch('http://localhost:8787/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitionJson: definition }),
      });
      const payload = await response.json();
      setBuilderState((current) => ({ ...current, diagnostics: payload.diagnostics || [] }));
      setValidateError('');
    } catch (error) {
      setValidateError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="workspace">
      <div>
        <BlockPalette
          selectedNode={selectedNode}
          onAddRootLayer={() => setBuilderState((state) => addChildBlock(state, null, 'Layer'))}
          onAddChild={(kind) => setBuilderState((state) => addChildBlock(state, state.selectedUiId, kind))}
        />
        <HierarchyTree
          layers={builderState.graph.layers}
          selectedUiId={builderState.selectedUiId}
          diagnosticsByUiId={diagnosticsByUiId}
          onSelect={(uiId) => setBuilderState((state) => setSelectedUiId(state, uiId))}
          onMove={(draggedUiId, targetUiId) => setBuilderState((state) => moveBlock(state, draggedUiId, targetUiId))}
        />
      </div>
      <section className="content-panel">
        <div className="actions">
          <button onClick={runValidate}>Validate (/api/validate)</button>
        </div>
        {validateError ? <p className="error">{validateError}</p> : null}
        <InspectorPanel
          node={selectedNode}
          diagnostics={selectedNode ? diagnosticsByUiId[selectedNode.uiId] || [] : []}
          onChange={(uiId, key, value) => setBuilderState((state) => updateNodeField(state, uiId, key, value))}
        />
      </section>
    </main>
  );
}
