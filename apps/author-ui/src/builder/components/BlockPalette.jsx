import { BUILDER_CHILD_RULES } from '../state/builderState.js';

export function BlockPalette({ selectedNode, onAddRootLayer, onAddChild }) {
  const allowed = selectedNode ? BUILDER_CHILD_RULES[selectedNode.kind] || [] : ['Layer'];

  return (
    <section className="panel">
      <h3>Block Palette</h3>
      {!selectedNode ? <p>Select a node to add children.</p> : <p>Selected: {selectedNode.kind}</p>}
      <div className="actions">
        {allowed.map((kind) => (
          <button
            key={kind}
            onClick={() => {
              if (kind === 'Layer' && !selectedNode) {
                onAddRootLayer();
                return;
              }
              onAddChild(kind);
            }}
          >
            + {kind}
          </button>
        ))}
      </div>
    </section>
  );
}
