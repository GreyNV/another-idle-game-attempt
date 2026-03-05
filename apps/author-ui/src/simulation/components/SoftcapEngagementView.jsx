function normalizeMarker(entry, fallback = {}) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    tick: Number.isFinite(entry.tick) ? entry.tick : fallback.tick,
    tSec: Number.isFinite(entry.tSec) ? entry.tSec : fallback.tSec,
    targetRef: typeof entry.targetRef === 'string' ? entry.targetRef : (fallback.targetRef || 'n/a'),
    key: typeof entry.key === 'string' ? entry.key : (fallback.key || 'n/a'),
    detail: typeof entry.detail === 'string' ? entry.detail : (typeof entry.mode === 'string' ? entry.mode : ''),
  };
}

export function collectSoftcapMarkers(simulation) {
  const markers = [];
  const report = simulation && simulation.report;
  const recording = simulation && simulation.recording;

  const reportMarkers =
    (report && Array.isArray(report.softcapEngagementMarkers) && report.softcapEngagementMarkers) ||
    (report && report.softcapEngagement && Array.isArray(report.softcapEngagement.markers) && report.softcapEngagement.markers) ||
    [];

  for (const marker of reportMarkers) {
    const normalized = normalizeMarker(marker);
    if (normalized) {
      markers.push(normalized);
    }
  }

  const snapshots = Array.isArray(recording && recording.snapshots) ? recording.snapshots : [];
  for (const snapshot of snapshots) {
    const fallback = { tick: snapshot.tick, tSec: snapshot.tSec };
    const snapshotMarkers =
      (Array.isArray(snapshot.softcapMarkers) && snapshot.softcapMarkers) ||
      (snapshot.softcapEngagement && Array.isArray(snapshot.softcapEngagement.markers) && snapshot.softcapEngagement.markers) ||
      [];

    for (const marker of snapshotMarkers) {
      const normalized = normalizeMarker(marker, fallback);
      if (normalized) {
        markers.push(normalized);
      }
    }

    if (snapshot.softcapEngaged === true) {
      markers.push({
        tick: snapshot.tick,
        tSec: snapshot.tSec,
        targetRef: 'snapshot',
        key: 'softcapEngaged',
        detail: 'true',
      });
    }
  }

  return markers;
}

export function SoftcapEngagementView({ simulation }) {
  const rows = collectSoftcapMarkers(simulation);

  return (
    <section className="panel">
      <h3>Softcap Engagement Markers</h3>
      {rows.length === 0 ? (
        <p>No softcap engagement markers found in returned report/recording fields.</p>
      ) : (
        <table className="simple-table">
          <thead>
            <tr>
              <th>tSec</th>
              <th>Tick</th>
              <th>Target</th>
              <th>Key</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, index) => (
              <tr key={`${entry.targetRef}-${entry.key}-${entry.tick || 0}-${index}`}>
                <td>{Number.isFinite(entry.tSec) ? entry.tSec.toFixed(2) : '-'}</td>
                <td>{Number.isFinite(entry.tick) ? entry.tick : '-'}</td>
                <td>{entry.targetRef}</td>
                <td>{entry.key}</td>
                <td>{entry.detail || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
