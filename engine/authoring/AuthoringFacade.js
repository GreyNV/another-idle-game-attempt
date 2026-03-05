const { GameEngine } = require('../core/GameEngine');
const { parseGameDefinition } = require('../validation/parser/parseGameDefinition');
const { validateGameDefinitionSchema } = require('../validation/schema/validateGameDefinitionSchema');
const { validateReferences } = require('../validation/references/validateReferences');
const { ValidationError } = require('../validation/errors/ValidationError');
const { compileGameDefinition } = require('./compile/compileGameDefinition');
const { SimulationRunner } = require('./simulation/SimulationRunner');
const {
  AUTHORING_REPORT_DEFAULTS,
  DIAGNOSTIC_CODES,
  hashDeterministicPayload,
} = require('./authoring-types');

function toJsonSafe(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function toDiagnostic(issue) {
  return {
    code: issue.code || DIAGNOSTIC_CODES.VALIDATION_ERROR,
    path: issue.path || '/',
    message: issue.message || 'Validation issue.',
    hint: issue.hint || 'Review the definition payload for malformed or unsupported values.',
  };
}

function parseInputDefinition(definitionJson) {
  if (typeof definitionJson === 'string') {
    try {
      return { ok: true, value: JSON.parse(definitionJson) };
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          {
            code: DIAGNOSTIC_CODES.JSON_PARSE_ERROR,
            path: '/',
            message: `Invalid JSON payload: ${asErrorMessage(error)}`,
            hint: 'Provide a valid JSON string or a plain object game definition.',
          },
        ],
      };
    }
  }

  if (!definitionJson || typeof definitionJson !== 'object' || Array.isArray(definitionJson)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: DIAGNOSTIC_CODES.JSON_PARSE_ERROR,
          path: '/',
          message: 'Definition must be a plain object or JSON string.',
          hint: 'Pass a parsed definition object or JSON.stringify(definition).',
        },
      ],
    };
  }

  return { ok: true, value: definitionJson };
}

function normalizeStepTicks(value) {
  if (value === undefined || value === null) {
    return 1;
  }

  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeStepDt(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeStepIntents(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
}

function pointerToken(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

class AuthoringFacade {
  constructor() {
    this.sessionCounter = 0;
    this.sessions = new Map();
    this.simulationRunner = new SimulationRunner();
  }

  validate(definitionJson) {
    const parsed = parseInputDefinition(definitionJson);
    if (!parsed.ok) {
      return { ok: false, diagnostics: parsed.diagnostics };
    }

    const schemaIssues = validateGameDefinitionSchema(parsed.value);
    const referenceIssues = validateReferences(parsed.value);
    const diagnostics = [...schemaIssues, ...referenceIssues].map(toDiagnostic);

    return {
      ok: diagnostics.length === 0,
      diagnostics,
    };
  }

  compile(definitionJson) {
    const parsed = parseInputDefinition(definitionJson);
    if (!parsed.ok) {
      return {
        ok: false,
        errors: parsed.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          message: diagnostic.message,
          path: diagnostic.path,
        })),
        compiledGame: null,
      };
    }

    const compilation = compileGameDefinition(parsed.value);
    return {
      ok: compilation.errors.length === 0,
      errors: compilation.errors,
      compiledGame: compilation.compiledGame,
    };
  }

  createSession(definitionJson, options = {}) {
    const validation = this.validate(definitionJson);
    if (!validation.ok) {
      return validation;
    }

    const parsed = parseInputDefinition(definitionJson);
    if (!parsed.ok) {
      return parsed;
    }

    const sessionId = `authoring-session-${this.sessionCounter + 1}`;
    const createdAt = Date.now();
    const definition = toJsonSafe(parsed.value);
    const defaultDt = normalizeStepDt(options.defaultDt, 1000 / 60) || 1000 / 60;

    try {
      const runtimeStepClock = { dt: defaultDt };
      const engineOptions = {
        ...(options.engineOptions || {}),
        timeSystem: {
          getDeltaTime: () => runtimeStepClock.dt,
        },
      };

      const engine = new GameEngine(engineOptions);
      engine.initialize(definition);

      this.sessionCounter += 1;
      this.sessions.set(sessionId, {
        id: sessionId,
        createdAt,
        definition,
        engine,
        runtimeStepClock,
        tick: 0,
        lastSummary: null,
      });

      return {
        ok: true,
        diagnostics: [],
        session: {
          id: sessionId,
          createdAt,
          definitionMeta: toJsonSafe((engine.definition && engine.definition.meta) || {}),
          tick: 0,
        },
        snapshot: toJsonSafe(engine.stateStore.snapshot()),
      };
    } catch (error) {
      const diagnostics =
        error instanceof ValidationError
          ? error.issues.map(toDiagnostic)
          : [
              {
                code: DIAGNOSTIC_CODES.ENGINE_INIT_ERROR,
                path: '/',
                message: `Failed to create authoring session: ${asErrorMessage(error)}`,
                hint: 'Validate the definition and engine options, then retry.',
              },
            ];

      return {
        ok: false,
        diagnostics,
      };
    }
  }

  stepSession(sessionId, stepInput = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        diagnostics: [
          {
            code: DIAGNOSTIC_CODES.SESSION_NOT_FOUND,
            path: '/sessionId',
            message: `Session "${sessionId}" was not found.`,
            hint: 'Create a preview session before stepping it.',
          },
        ],
      };
    }

    const ticks = normalizeStepTicks(stepInput.ticks);
    const dt = normalizeStepDt(stepInput.dt, session.runtimeStepClock.dt);
    const intents = normalizeStepIntents(stepInput.intents);

    if (ticks === null || dt === null || intents === null) {
      return {
        ok: false,
        diagnostics: [
          {
            code: DIAGNOSTIC_CODES.SESSION_STEP_INPUT_INVALID,
            path: '/step',
            message: 'stepSession requires ticks>0, dt>=0, and intents as an array when provided.',
            hint: 'Use { ticks: 1, dt: 16.67, intents: [] } shape for preview stepping.',
          },
        ],
      };
    }

    session.runtimeStepClock.dt = dt;

    let latestSummary = null;
    for (let tickIndex = 0; tickIndex < ticks; tickIndex += 1) {
      if (tickIndex === 0) {
        for (const intent of intents) {
          session.engine.enqueueIntent(intent);
        }
      }

      latestSummary = toJsonSafe(session.engine.tick());
      session.tick += 1;
    }

    session.lastSummary = latestSummary;

    return {
      ok: true,
      diagnostics: [],
      session: {
        id: session.id,
        createdAt: session.createdAt,
        tick: session.tick,
      },
      telemetry: {
        dt,
        ticksExecuted: ticks,
        intentsApplied: intents.length,
      },
      summary: latestSummary,
      snapshot: toJsonSafe(session.engine.stateStore.snapshot()),
    };
  }

  snapshotSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        diagnostics: [
          {
            code: DIAGNOSTIC_CODES.SESSION_NOT_FOUND,
            path: '/sessionId',
            message: `Session "${sessionId}" was not found.`,
            hint: 'Create a preview session before requesting snapshots.',
          },
        ],
      };
    }

    return {
      ok: true,
      diagnostics: [],
      session: {
        id: session.id,
        createdAt: session.createdAt,
        tick: session.tick,
      },
      summary: toJsonSafe(session.lastSummary),
      snapshot: toJsonSafe(session.engine.stateStore.snapshot()),
    };
  }

  disposeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        ok: false,
        diagnostics: [
          {
            code: DIAGNOSTIC_CODES.SESSION_NOT_FOUND,
            path: '/sessionId',
            message: `Session "${sessionId}" was not found.`,
            hint: 'Create a preview session before disposing it.',
          },
        ],
      };
    }

    session.engine.destroy();
    this.sessions.delete(sessionId);

    return {
      ok: true,
      diagnostics: [],
      session: {
        id: sessionId,
        disposed: true,
      },
    };
  }

  simulate(definitionJson, scenario = {}, options = {}) {
    const validation = this.validate(definitionJson);
    if (!validation.ok) {
      return validation;
    }

    try {
      const normalizedDefinition = parseGameDefinition(toJsonSafe(definitionJson));
      const compilation = compileGameDefinition(normalizedDefinition);
      const simulationResult = this.simulationRunner.run({
        definition: normalizedDefinition,
        compiledDefinition: compilation.compiledGame,
        scenario: {
          ...scenario,
          ...(options.scenarioOverrides || {}),
        },
        defaults: AUTHORING_REPORT_DEFAULTS,
      });
      const report = simulationResult.report;

      const hashSummary = hashDeterministicPayload(simulationResult.hashInput);
      report.hash = {
        algorithm: hashSummary.algorithm,
        value: hashSummary.hash,
      };

      const runId = `run_${hashSummary.hash.slice(0, 16)}`;

      return {
        ok: true,
        diagnostics: [],
        simulation: {
          runId,
          report,
          finalSnapshot: simulationResult.finalSnapshot,
          timeline: simulationResult.timeline,
          recording: simulationResult.recording,
        },
      };
    } catch (error) {
      const diagnostics =
        error instanceof ValidationError
          ? error.issues.map(toDiagnostic)
          : [
              {
                code: DIAGNOSTIC_CODES.SIMULATION_ERROR,
                path: '/',
                message: `Simulation failed: ${asErrorMessage(error)}`,
                hint: 'Review scenario payload (ticks/intentsByTick) and definition validity.',
              },
            ];

      return {
        ok: false,
        diagnostics,
      };
    }
  }

  diffSnapshots(snapshotA, snapshotB, options = {}) {
    const maxChanges = Number.isInteger(options.maxChanges) && options.maxChanges > 0 ? options.maxChanges : 200;
    const changes = [];

    const walk = (left, right, pathTokens) => {
      if (changes.length >= maxChanges) {
        return;
      }

      if (Object.is(left, right)) {
        return;
      }

      const path = pathTokens.length > 0 ? `/${pathTokens.map(pointerToken).join('/')}` : '/';

      const leftIsObject = left !== null && typeof left === 'object';
      const rightIsObject = right !== null && typeof right === 'object';

      if (!leftIsObject || !rightIsObject) {
        changes.push({ op: 'replace', path, before: toJsonSafe(left), after: toJsonSafe(right) });
        return;
      }

      const isLeftArray = Array.isArray(left);
      const isRightArray = Array.isArray(right);

      if (isLeftArray !== isRightArray) {
        changes.push({ op: 'replace', path, before: toJsonSafe(left), after: toJsonSafe(right) });
        return;
      }

      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of keys) {
        if (changes.length >= maxChanges) {
          return;
        }

        if (!(key in right)) {
          changes.push({
            op: 'remove',
            path: `${path === '/' ? '' : path}/${pointerToken(key)}` || '/',
            before: toJsonSafe(left[key]),
          });
          continue;
        }

        if (!(key in left)) {
          changes.push({
            op: 'add',
            path: `${path === '/' ? '' : path}/${pointerToken(key)}` || '/',
            after: toJsonSafe(right[key]),
          });
          continue;
        }

        walk(left[key], right[key], [...pathTokens, key]);
      }
    };

    if ((snapshotA === undefined && snapshotB !== undefined) || (snapshotA !== undefined && snapshotB === undefined)) {
      return {
        equal: false,
        diagnostics: [
          {
            code: DIAGNOSTIC_CODES.DIFF_INPUT_ERROR,
            path: '/',
            message: 'Both snapshots must be provided.',
            hint: 'Pass two plain JSON-safe snapshots to compare.',
          },
        ],
        changes: [],
      };
    }

    walk(snapshotA, snapshotB, []);

    return {
      equal: changes.length === 0,
      diagnostics: [],
      changes,
      truncated: changes.length >= maxChanges,
    };
  }
}

module.exports = {
  AuthoringFacade,
};
