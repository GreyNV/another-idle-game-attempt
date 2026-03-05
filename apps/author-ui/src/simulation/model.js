function clampPositiveInteger(value, fallback) {
  const next = Number.parseInt(value, 10);
  return Number.isInteger(next) && next > 0 ? next : fallback;
}

function clampNonNegativeInteger(value, fallback) {
  const next = Number.parseInt(value, 10);
  return Number.isInteger(next) && next >= 0 ? next : fallback;
}

function clampPositiveNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function normalizeIntentRow(row, index) {
  if (!row || typeof row !== 'object') {
    return {
      id: `intent-${index}`,
      tick: 0,
      type: '',
      payloadJson: '{}',
    };
  }

  return {
    id: typeof row.id === 'string' && row.id.length > 0 ? row.id : `intent-${index}`,
    tick: clampNonNegativeInteger(row.tick, 0),
    type: typeof row.type === 'string' ? row.type : '',
    payloadJson: typeof row.payloadJson === 'string' ? row.payloadJson : '{}',
  };
}

export function extractIntentRows(intentsByTick = []) {
  const rows = [];

  for (let tick = 0; tick < intentsByTick.length; tick += 1) {
    const intents = Array.isArray(intentsByTick[tick]) ? intentsByTick[tick] : [];
    for (let index = 0; index < intents.length; index += 1) {
      const intent = intents[index] || {};
      rows.push({
        id: `intent-${tick}-${index}`,
        tick,
        type: typeof intent.type === 'string' ? intent.type : '',
        payloadJson: JSON.stringify(intent.payload || {}, null, 2),
      });
    }
  }

  return rows;
}

export function controlsFromPreset(presets, presetKey) {
  const resolvedPresetKey = presets[presetKey] ? presetKey : 'early';
  const preset = presets[resolvedPresetKey] || {};
  const scenario = preset.scenario || {};

  return {
    presetKey: resolvedPresetKey,
    ticks: clampPositiveInteger(scenario.ticks, 600),
    horizonSec: clampPositiveNumber(scenario.horizonSec, 60),
    dt: clampPositiveNumber(scenario.dt, 100),
    snapshotIntervalSec: clampPositiveNumber(scenario.snapshotIntervalSec, 1),
    intentRows: extractIntentRows(scenario.intentsByTick || []),
  };
}

export function buildIntentsByTick(intentRows, ticks) {
  const totalTicks = clampPositiveInteger(ticks, 1);
  const intentsByTick = Array.from({ length: totalTicks }, () => []);

  const rows = Array.isArray(intentRows) ? intentRows.map(normalizeIntentRow) : [];
  for (const row of rows) {
    if (!row.type || row.tick < 0 || row.tick >= totalTicks) {
      continue;
    }

    let payload = {};
    try {
      const parsed = JSON.parse(row.payloadJson || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed;
      }
    } catch (_error) {
      payload = {};
    }

    intentsByTick[row.tick].push({ type: row.type, payload });
  }

  return intentsByTick;
}

export function buildSimulationPayload(definitionJson, controls) {
  const ticks = clampPositiveInteger(controls.ticks, 1);
  return {
    definitionJson,
    scenario: {
      ticks,
      horizonSec: clampPositiveNumber(controls.horizonSec, (ticks * clampPositiveNumber(controls.dt, 100)) / 1000),
      dt: clampPositiveNumber(controls.dt, 100),
      snapshotIntervalSec: clampPositiveNumber(controls.snapshotIntervalSec, 1),
      intentsByTick: buildIntentsByTick(controls.intentRows, ticks),
    },
    options: {},
  };
}

export function summarizeDiff(diffResult) {
  const changes = Array.isArray(diffResult && diffResult.changes) ? diffResult.changes : [];
  const counts = {
    add: 0,
    remove: 0,
    replace: 0,
  };

  for (const change of changes) {
    if (change && counts[change.op] !== undefined) {
      counts[change.op] += 1;
    }
  }

  return {
    equal: Boolean(diffResult && diffResult.equal),
    truncated: Boolean(diffResult && diffResult.truncated),
    total: changes.length,
    added: counts.add,
    removed: counts.remove,
    replaced: counts.replace,
  };
}

export function formatCompareSummary(summary) {
  if (!summary) {
    return 'No comparison yet.';
  }

  if (summary.equal) {
    return 'No snapshot differences.';
  }

  const truncatedSuffix = summary.truncated ? ' (truncated)' : '';
  return `Differences: ${summary.total}${truncatedSuffix}. add=${summary.added}, remove=${summary.removed}, replace=${summary.replaced}`;
}

export function extractSoftcapMarkers(simulation) {
  const timeline = Array.isArray(simulation && simulation.timeline) ? simulation.timeline : [];
  const recordingSnapshots = Array.isArray(simulation && simulation.recording && simulation.recording.snapshots)
    ? simulation.recording.snapshots
    : [];
  const tickToTime = new Map(recordingSnapshots.map((entry) => [entry.tick, entry.tSec]));

  const markers = [];
  let wasActive = false;

  for (const frame of timeline) {
    const snapshot = frame && frame.snapshot;
    const active =
      Boolean(snapshot && snapshot.derived && snapshot.derived.softcaps && snapshot.derived.softcaps.engaged) ||
      Boolean(snapshot && snapshot.canonical && snapshot.canonical.softcaps && snapshot.canonical.softcaps.engaged);

    if (active && !wasActive) {
      markers.push({
        tick: frame.tick,
        tSec: tickToTime.get(frame.tick) || 0,
        label: 'softcap.engaged',
      });
    }

    wasActive = active;
  }

  return markers;
}
