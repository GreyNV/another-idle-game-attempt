import { formatCompareSummary } from '../model.js';

export function CompareRunsPanel({ baseline, current, diffSummary, onCaptureBaseline, onCompare, isComparing }) {
  return (
    <section className="panel">
      <h3>Compare Runs</h3>
      <p>Baseline: {baseline ? `${baseline.runId} (${baseline.report?.hash?.value?.slice(0, 12) || 'n/a'})` : 'not set'}</p>
      <p>Current: {current ? `${current.runId} (${current.report?.hash?.value?.slice(0, 12) || 'n/a'})` : 'not run yet'}</p>
      <div className="actions">
        <button onClick={onCaptureBaseline} disabled={!current} type="button">Set current as baseline</button>
        <button onClick={onCompare} disabled={!baseline || !current || isComparing} type="button">{isComparing ? 'Comparing...' : 'Compare snapshots'}</button>
      </div>
      <p className="compare-summary">{formatCompareSummary(diffSummary)}</p>
    </section>
  );
}
