import { extractSoftcapMarkers } from '../model.js';

export function SoftcapEngagementMarkers({ simulation }) {
  const markers = extractSoftcapMarkers(simulation);

  return (
    <section className="panel">
      <h3>Softcap Engagement Markers</h3>
      {markers.length === 0 ? (
        <p className="muted">No softcap engagement markers found in post-S3 fields.</p>
      ) : (
        <table className="simple-table">
          <thead>
            <tr>
              <th>tSec</th>
              <th>Tick</th>
              <th>Marker</th>
            </tr>
          </thead>
          <tbody>
            {markers.map((marker, index) => (
              <tr key={`${marker.label}-${marker.tick}-${index}`}>
                <td>{Number(marker.tSec).toFixed(2)}</td>
                <td>{marker.tick}</td>
                <td>{marker.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
