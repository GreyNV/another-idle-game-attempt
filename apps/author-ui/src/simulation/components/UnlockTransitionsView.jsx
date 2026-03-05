export function UnlockTransitionsView({ transitions }) {
  const rows = Array.isArray(transitions) ? transitions : [];

  return (
    <section className="panel">
      <h3>Unlock Transitions</h3>
      {rows.length === 0 ? (
        <p>No unlock transitions were emitted during this run.</p>
      ) : (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Tick</th>
              <th>Target Ref</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => (
              <tr key={`${entry.targetRef || 'target'}-${entry.tick || 0}-${index}`}>
                <td>{entry.tick}</td>
                <td>{entry.targetRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
