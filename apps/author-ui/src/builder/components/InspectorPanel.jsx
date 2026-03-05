import { BUILDER_METADATA } from '../metadata.js';

export function InspectorPanel({ node, diagnostics, onChange }) {
  if (!node) {
    return (
      <section className="panel">
        <h3>Inspector</h3>
        <p>Select a block to edit fields.</p>
      </section>
    );
  }

  const metadata = BUILDER_METADATA[node.kind];

  return (
    <section className="panel">
      <h3>Inspector: {node.kind}</h3>
      {metadata.fields.map((field) => {
        const value = field.key === 'id' ? node.id : node.data[field.key] ?? '';
        const fieldPathSuffix = `/${field.key}`;
        const fieldErrors = diagnostics.filter((entry) => entry.path.endsWith(fieldPathSuffix));

        return (
          <label key={field.key} className="field-row">
            <span>{field.label}</span>
            <input
              value={value}
              onChange={(event) => onChange(node.uiId, field.key, event.target.value)}
            />
            {fieldErrors.length > 0 ? <small className="error">{fieldErrors[0].message}</small> : null}
          </label>
        );
      })}
    </section>
  );
}
