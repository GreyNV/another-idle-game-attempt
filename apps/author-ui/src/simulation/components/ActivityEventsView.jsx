function countByKind(events) {
  return events.reduce((acc, event) => {
    const key = event && event.kind ? event.kind : 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function ActivityEventsView({ events }) {
  const rows = Array.isArray(events) ? events : [];
  const counts = countByKind(rows);

  return (
    <section className="panel">
      <h3>Purchase + Routine Events</h3>
      <div className="chip-row">
        {Object.entries(counts).map(([kind, count]) => (
          <span key={kind} className="chip">{kind}: {count}</span>
        ))}
        {rows.length === 0 ? <span className="chip">No events</span> : null}
      </div>
      {rows.length === 0 ? null : (
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
            {rows.map((event, index) => (
              <tr key={`${event.kind || 'event'}-${event.tick || 0}-${index}`}>
                <td>{Number.isFinite(event.tSec) ? event.tSec.toFixed(2) : '-'}</td>
                <td>{event.tick}</td>
                <td>{event.kind}</td>
                <td>{event.intentType || event.routineId || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
