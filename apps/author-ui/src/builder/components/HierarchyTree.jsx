function TreeNode({ node, selectedUiId, onSelect, onMove, diagnosticsByUiId }) {
  const issues = diagnosticsByUiId[node.uiId] || [];

  return (
    <li>
      <button
        className={selectedUiId === node.uiId ? 'active' : ''}
        draggable
        onDragStart={(event) => event.dataTransfer.setData('text/plain', node.uiId)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const draggedUiId = event.dataTransfer.getData('text/plain');
          onMove(draggedUiId, node.uiId);
        }}
        onClick={() => onSelect(node.uiId)}
      >
        {node.kind}: {node.id || '(missing-id)'}
        {issues.length ? <span> ⚠️{issues.length}</span> : null}
      </button>
      {node.children.length > 0 ? (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.uiId}
              node={child}
              selectedUiId={selectedUiId}
              onSelect={onSelect}
              onMove={onMove}
              diagnosticsByUiId={diagnosticsByUiId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function HierarchyTree({ layers, selectedUiId, onSelect, onMove, diagnosticsByUiId }) {
  return (
    <section className="panel tree-panel">
      <h3>Hierarchy</h3>
      <p>Drag to reorder peers or drop onto valid parents to nest.</p>
      <ul>
        {layers.map((layer) => (
          <TreeNode
            key={layer.uiId}
            node={layer}
            selectedUiId={selectedUiId}
            onSelect={onSelect}
            onMove={onMove}
            diagnosticsByUiId={diagnosticsByUiId}
          />
        ))}
      </ul>
    </section>
  );
}
