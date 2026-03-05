function pickResourceKeys(snapshots) {
  const first = snapshots[0];
  if (!first || !first.resources) {
    return [];
  }
  return Object.keys(first.resources).sort((left, right) => left.localeCompare(right));
}

function toSeries(snapshots, key) {
  return snapshots.map((entry) => ({ x: entry.tSec, y: entry.resources[key] || 0 }));
}

function polylinePoints(series, minX, maxX, minY, maxY, width, height, pad) {
  const xSpan = Math.max(1e-9, maxX - minX);
  const ySpan = Math.max(1e-9, maxY - minY);
  return series
    .map((point) => {
      const px = pad + ((point.x - minX) / xSpan) * (width - pad * 2);
      const py = height - pad - ((point.y - minY) / ySpan) * (height - pad * 2);
      return `${px},${py}`;
    })
    .join(' ');
}

const COLORS = ['#ff7a59', '#5dd4ff', '#ffd166', '#80ed99', '#f6bd60', '#bdb2ff'];

export function ResourcesOverTimeGraph({ simulation, snapshots }) {
  const rows = Array.isArray(snapshots)
    ? snapshots
    : (Array.isArray(simulation && simulation.recording && simulation.recording.snapshots)
      ? simulation.recording.snapshots
      : []);

  if (rows.length === 0) {
    return <p>No recording snapshots available.</p>;
  }

  const resourceKeys = pickResourceKeys(rows);
  if (resourceKeys.length === 0) {
    return <p>Snapshots do not include resource vectors.</p>;
  }

  const width = 720;
  const height = 280;
  const pad = 28;
  const allPoints = resourceKeys.flatMap((key) => toSeries(rows, key));
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));

  return (
    <section className="panel">
      <h3>Resources Over Time</h3>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Resource timeline chart" className="chart">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#5f7085" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#5f7085" />
        {resourceKeys.map((key, index) => {
          const points = polylinePoints(toSeries(rows, key), minX, maxX, minY, maxY, width, height, pad);
          return <polyline key={key} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="2" points={points} />;
        })}
      </svg>
      <div className="chart-legend">
        {resourceKeys.map((key, index) => (
          <span key={key}><i style={{ background: COLORS[index % COLORS.length] }} />{key}</span>
        ))}
      </div>
      <p className="muted">tSec: {minX.toFixed(2)} to {maxX.toFixed(2)} | value: {minY.toFixed(2)} to {maxY.toFixed(2)}</p>
    </section>
  );
}
