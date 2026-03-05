export function UnlockTransitionsGraph({ simulation }) {
  const transitions = Array.isArray(simulation && simulation.report && simulation.report.unlockTransitions)
    ? simulation.report.unlockTransitions
    : [];

  return (
    <section className="panel">
      <h3>Unlock Transitions</h3>
      {transitions.length === 0 ? (
        <p className="muted">No unlock transitions in this run.</p>
      ) : (
        <table className="simple-table">
          <thead>
            <tr>
              <th>Tick</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {transitions.map((entry, index) => (
              <tr key={`${entry.targetRef}-${index}`}>
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
