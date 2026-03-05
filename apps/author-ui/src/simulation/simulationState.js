function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: {} };
  }
}

function toFiniteNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toPositiveNumber(value, fallback) {
  const next = toFiniteNumber(value, fallback);
  return next > 0 ? next : fallback;
}

function toNonNegativeInteger(value, fallback) {
  const next = Math.floor(toFiniteNumber(value, fallback));
  return next >= 0 ? next : fallback;
}

export function createIntentRow(seed = {}) {
  return {
    tick: toNonNegativeInteger(seed.tick, 0),
    type: typeof seed.type === 'string' ? seed.type : '',
    payloadText: JSON.stringify(seed.payload && typeof seed.payload === 'object' ? seed.payload : {}, null, 2),
  };
}

export function createScenarioDraftFromPreset(preset) {
  const scenario = (preset && preset.scenario) || {};
  const intents = Array.isArray(scenario.intents) ? scenario.intents : [];

  return {
    presetId: preset && typeof preset.id === 'string' ? preset.id : '',
    ticks: toNonNegativeInteger(scenario.ticks, 120),
    horizonSec: toPositiveNumber(scenario.horizonSec, 12),
    dt: toPositiveNumber(scenario.dt, 100),
    snapshotIntervalSec: toPositiveNumber(scenario.snapshotIntervalSec, 1),
    intents: intents.map((entry) => createIntentRow(entry)),
  };
}

export function normalizeScenarioDraft(draft) {
  return {
    ...draft,
    ticks: toNonNegativeInteger(draft.ticks, 120),
    horizonSec: toPositiveNumber(draft.horizonSec, 12),
    dt: toPositiveNumber(draft.dt, 100),
    snapshotIntervalSec: toPositiveNumber(draft.snapshotIntervalSec, 1),
    intents: Array.isArray(draft.intents) ? draft.intents.map((entry) => createIntentRow(entry)) : [],
  };
}

export function buildIntentsByTick(intentRows, ticks) {
  const totalTicks = Math.max(0, toNonNegativeInteger(ticks, 0));
  const intentsByTick = Array.from({ length: totalTicks }, () => []);

  for (const row of Array.isArray(intentRows) ? intentRows : []) {
    const tick = toNonNegativeInteger(row.tick, -1);
    if (tick < 0 || tick >= totalTicks) {
      continue;
    }

    const type = typeof row.type === 'string' ? row.type.trim() : '';
    if (!type) {
      continue;
    }

    const parsedPayload = safeJsonParse(typeof row.payloadText === 'string' ? row.payloadText : '{}');
    intentsByTick[tick].push({
      type,
      payload: parsedPayload.ok && parsedPayload.value && typeof parsedPayload.value === 'object' ? parsedPayload.value : {},
    });
  }

  return intentsByTick;
}

export function buildSimulationPayload(definitionJson, draft) {
  const normalized = normalizeScenarioDraft(draft);
  return {
    definitionJson,
    scenario: {
      ticks: normalized.ticks,
      horizonSec: normalized.horizonSec,
      dt: normalized.dt,
      snapshotIntervalSec: normalized.snapshotIntervalSec,
      intentsByTick: buildIntentsByTick(normalized.intents, normalized.ticks),
    },
  };
}

export function buildDiffPayload(baselineSnapshot, candidateSnapshot, maxChanges = 200) {
  return {
    snapshotA: baselineSnapshot,
    snapshotB: candidateSnapshot,
    options: { maxChanges: toNonNegativeInteger(maxChanges, 200) || 200 },
  };
}
