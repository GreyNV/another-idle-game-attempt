const { GameEngine } = require('../../core/GameEngine');

function toJsonSafe(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function normalizeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function normalizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeDtPolicy(value) {
  return value === 'fast' ? 'fast' : 'accurate';
}

function buildRoutineIndex(definition) {
  const routines = [];
  const layers = Array.isArray(definition.layers) ? definition.layers : [];
  for (const layer of layers) {
    const sublayers = Array.isArray(layer && layer.sublayers) ? layer.sublayers : [];
    for (const sublayer of sublayers) {
      const sections = Array.isArray(sublayer && sublayer.sections) ? sublayer.sections : [];
      for (const section of sections) {
        const elements = Array.isArray(section && section.elements) ? section.elements : [];
        for (const element of elements) {
          if (!element || element.type !== 'routine' || typeof element.id !== 'string') {
            continue;
          }
          routines.push({ layerId: layer.id, routineId: element.id });
        }
      }
    }
  }

  return routines;
}

function readResourceValue(snapshot, resourceKey) {
  const resources = snapshot && snapshot.canonical && snapshot.canonical.resources;
  const value = resources && resources[resourceKey];
  return Number.isFinite(value) ? value : 0;
}

class SimulationRunner {
  run({ definition, compiledDefinition, scenario = {}, defaults = {} }) {
    const dt = normalizePositiveNumber(scenario.dt, 1000 / 60);
    const ticks = normalizeInteger(scenario.ticks, 1);
    const seed = normalizeInteger(scenario.seed, defaults.defaultSeed || 0);
    const dtPolicy = normalizeDtPolicy(scenario.dtPolicy);
    const horizonSec =
      Number.isFinite(scenario.horizonSec) && scenario.horizonSec >= 0 ? scenario.horizonSec : (ticks * dt) / 1000;
    const eventTailLimit = normalizeInteger(scenario.eventTailLimit, defaults.eventTailLimit || 25);
    const intentsByTick = Array.isArray(scenario.intentsByTick) ? scenario.intentsByTick : [];
    const completionIntervalSec = normalizePositiveNumber(scenario.routineCompletionIntervalSec, 1);
    const snapshotIntervalSec = normalizePositiveNumber(scenario.snapshotIntervalSec, 1);
    const canonicalResources = Array.isArray(scenario.canonicalResources)
      ? scenario.canonicalResources.filter((resource) => typeof resource === 'string' && resource.length > 0)
      : [];

    const totalTicks = Math.max(ticks, Math.ceil((horizonSec * 1000) / dt));
    let nowMs = seed;
    const engine = new GameEngine({
      ...(scenario.engineOptions || {}),
      tickRate: scenario.tickRate || 1000 / dt,
      now: () => nowMs,
    });
    engine.initialize(definition);

    if (typeof scenario.configureEngine === 'function') {
      scenario.configureEngine(engine);
    }

    const timeline = [];
    const warnings = [];
    const unlockTransitions = [];
    const eventsPublishedTail = [];
    const eventsPublishedByType = {};

    const originalPublish = engine.eventBus.publish.bind(engine.eventBus);
    engine.eventBus.publish = (event) => {
      const type = event && event.type;
      if (typeof type === 'string' && type.length > 0) {
        eventsPublishedByType[type] = (eventsPublishedByType[type] || 0) + 1;
        eventsPublishedTail.push({ tick: Math.max(0, timeline.length - 1), type, payload: toJsonSafe(event.payload || {}) });
        if (eventsPublishedTail.length > eventTailLimit) {
          eventsPublishedTail.shift();
        }
      }

      return originalPublish(event);
    };

    const definitionResourceKeys = Object.keys((definition && definition.state && definition.state.resources) || {});
    const reportResourceKeys =
      canonicalResources.length > 0
        ? canonicalResources
        : definitionResourceKeys.slice().sort((left, right) => left.localeCompare(right));

    const snapshots = [];
    const recording = { snapshots: [], events: [] };

    const routineAccumulators = new Map();
    const routines = buildRoutineIndex(definition);
    let elapsedSec = 0;
    let nextSnapshotAtSec = 0;
    let previousRecordedSnapshot = null;

    const pushRecordingSnapshot = (snapshot, tick) => {
      const resources = {};
      for (const resourceKey of reportResourceKeys) {
        resources[resourceKey] = readResourceValue(snapshot, resourceKey);
      }

      const netRates = {};
      if (previousRecordedSnapshot) {
        const dtSec = Math.max(1e-9, elapsedSec - previousRecordedSnapshot.tSec);
        for (const resourceKey of reportResourceKeys) {
          netRates[resourceKey] = (resources[resourceKey] - previousRecordedSnapshot.resources[resourceKey]) / dtSec;
        }
      } else {
        for (const resourceKey of reportResourceKeys) {
          netRates[resourceKey] = 0;
        }
      }

      const recordingSnapshot = { tick, tSec: elapsedSec, resources, netRates };
      recording.snapshots.push(recordingSnapshot);
      previousRecordedSnapshot = recordingSnapshot;
    };

    const initialSnapshot = toJsonSafe(engine.stateStore.snapshot());
    snapshots.push(initialSnapshot);
    pushRecordingSnapshot(initialSnapshot, -1);
    nextSnapshotAtSec += snapshotIntervalSec;

    for (let tickIndex = 0; tickIndex < totalTicks; tickIndex += 1) {
      const intents = Array.isArray(intentsByTick[tickIndex]) ? intentsByTick[tickIndex] : [];
      for (const intent of intents) {
        engine.enqueueIntent(intent);
      }

      const summary = toJsonSafe(engine.tick());
      nowMs += dt;
      elapsedSec += dt / 1000;
      const snapshot = toJsonSafe(engine.stateStore.snapshot());
      snapshots.push(snapshot);

      for (const transitionRef of (summary.unlocks && summary.unlocks.transitions) || []) {
        unlockTransitions.push({ targetRef: transitionRef, tick: tickIndex });
      }

      for (const routed of summary.intentsRouted || []) {
        if (routed && routed.code === 'INTENT_TARGET_LOCKED') {
          warnings.push({ code: 'REJECTED_LOCKED_INTENT', tick: tickIndex, message: routed.reason });
        }
      }

      if (summary.dispatch && summary.dispatch.deferredDueToCycleLimit) {
        warnings.push({
          code: 'EVENT_DISPATCH_DEFERRED',
          tick: tickIndex,
          message: `Deferred ${summary.dispatch.deferredEvents} event(s) due to dispatch cycle limit.`,
        });
      }

      for (let idx = 0; idx < intents.length; idx += 1) {
        const sourceIntent = intents[idx];
        const routed = summary.intentsRouted[idx];
        if (!sourceIntent || !routed || routed.ok !== true) {
          continue;
        }
        if (/BUY|PURCHASE|UPGRADE/.test(sourceIntent.type || '')) {
          recording.events.push({
            kind: 'purchase',
            tick: tickIndex,
            tSec: elapsedSec,
            intentType: sourceIntent.type,
            payload: toJsonSafe(sourceIntent.payload || {}),
          });
        }
      }

      for (const routine of routines) {
        const routinePath = `layers.${routine.layerId}.routines.${routine.routineId}.active`;
        const isActive = engine.stateStore.get(routinePath) === true;
        const key = `${routine.layerId}/${routine.routineId}`;
        const previous = routineAccumulators.get(key) || 0;

        if (!isActive) {
          routineAccumulators.set(key, 0);
          continue;
        }

        let accumulated = previous + dt / 1000;
        while (accumulated >= completionIntervalSec) {
          recording.events.push({
            kind: 'routine_completion',
            tick: tickIndex,
            tSec: elapsedSec - accumulated + completionIntervalSec,
            layerId: routine.layerId,
            routineId: routine.routineId,
          });
          accumulated -= completionIntervalSec;
        }

        routineAccumulators.set(key, accumulated);
      }

      if (elapsedSec + 1e-9 >= nextSnapshotAtSec || tickIndex === totalTicks - 1) {
        pushRecordingSnapshot(snapshot, tickIndex);
        while (nextSnapshotAtSec <= elapsedSec + 1e-9) {
          nextSnapshotAtSec += snapshotIntervalSec;
        }
      }

      timeline.push({ tick: tickIndex, summary, snapshot });

      if (elapsedSec + 1e-9 >= horizonSec && tickIndex + 1 >= ticks) {
        break;
      }
    }

    const finalSnapshot = engine.stateStore ? toJsonSafe(engine.stateStore.snapshot()) : null;
    engine.destroy();

    return {
      report: {
        tickCount: timeline.length,
        dt,
        dtPolicy,
        horizonSec,
        seed,
        intentsRouted: timeline.flatMap((entry) => entry.summary.intentsRouted || []).reduce((counts, routed) => {
          const code = routed && routed.code;
          if (code) {
            counts[code] = (counts[code] || 0) + 1;
          }
          return counts;
        }, {}),
        eventsDispatched: {
          countsByType: eventsPublishedByType,
          tail: eventsPublishedTail,
        },
        unlockTransitions,
        resourceKpis: reportResourceKeys.reduce((kpis, key) => {
          const values = snapshots.map((snapshot) => readResourceValue(snapshot, key));
          kpis[key] = {
            start: values[0],
            end: values[values.length - 1],
            min: Math.min(...values),
            max: Math.max(...values),
          };
          return kpis;
        }, {}),
        warnings,
      },
      timeline,
      finalSnapshot,
      recording,
      hashInput: {
        compiledDefinition,
        scenario: {
          ticks,
          horizonSec,
          dt,
          dtPolicy,
          seed,
          intentsByTick,
          eventTailLimit,
          canonicalResources: reportResourceKeys,
          snapshotIntervalSec,
          routineCompletionIntervalSec: completionIntervalSec,
        },
        recording,
      },
    };
  }
}

module.exports = {
  SimulationRunner,
};
