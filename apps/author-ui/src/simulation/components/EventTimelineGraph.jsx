export function EventTimelineGraph({ simulation }) {
  const events = Array.isArray(simulation && simulation.recording && simulation.recording.events)
    ? simulation.recording.events
    : [];

  return (
    <section className="panel">
      <h3>Purchase + Routine Events</h3>
      {events.length === 0 ? (
        <p className="muted">No purchase/routine events recorded.</p>
      ) : (
        <table className="simple-table">
          <thead>
            <tr>
              <th>tSec</th>
              <th>Tick</th>
              <th>Kind</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.kind}-${event.tick}-${index}`}>
                <td>{Number(event.tSec || 0).toFixed(2)}</td>
                <td>{event.tick}</td>
                <td>{event.kind}</td>
                <td>
                  {event.kind === 'purchase'
                    ? event.intentType || 'purchase'
                    : `${event.layerId || '-'} / ${event.routineId || '-'}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
