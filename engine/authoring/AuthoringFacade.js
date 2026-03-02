const { GameEngine } = require('../core/GameEngine');
const { parseGameDefinition } = require('../validation/parser/parseGameDefinition');
const { validateGameDefinitionSchema } = require('../validation/schema/validateGameDefinitionSchema');
const { validateReferences } = require('../validation/references/validateReferences');
const { ValidationError } = require('../validation/errors/ValidationError');
const { DIAGNOSTIC_CODES } = require('./authoring-types');

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

function pointerToken(token) {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

class AuthoringFacade {
  constructor() {
    this.sessionCounter = 0;
    this.sessions = new Map();
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

  createSession(definitionJson, options = {}) {
    const validation = this.validate(definitionJson);
    if (!validation.ok) {
      return validation;
    }

    const sessionId = `authoring-session-${this.sessionCounter + 1}`;
    const createdAt = Date.now();

    try {
      const engine = new GameEngine(options.engineOptions || {});
      engine.initialize(definitionJson);
      this.sessionCounter += 1;
      this.sessions.set(sessionId, engine);

      return {
        ok: true,
        diagnostics: [],
        session: {
          id: sessionId,
          createdAt,
          definitionMeta: toJsonSafe((engine.definition && engine.definition.meta) || {}),
        },
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

  simulate(definitionJson, scenario = {}) {
    const validation = this.validate(definitionJson);
    if (!validation.ok) {
      return validation;
    }

    const ticks = Number.isInteger(scenario.ticks) && scenario.ticks >= 0 ? scenario.ticks : 1;
    const intentsByTick = Array.isArray(scenario.intentsByTick) ? scenario.intentsByTick : [];

    try {
      const normalizedDefinition = parseGameDefinition(definitionJson);
      const engine = new GameEngine(scenario.engineOptions || {});
      engine.initialize(normalizedDefinition);

      const summaries = [];
      for (let tickIndex = 0; tickIndex < ticks; tickIndex += 1) {
        const intents = Array.isArray(intentsByTick[tickIndex]) ? intentsByTick[tickIndex] : [];
        for (const intent of intents) {
          engine.enqueueIntent(intent);
        }

        summaries.push({
          tick: tickIndex,
          summary: toJsonSafe(engine.tick()),
          snapshot: toJsonSafe(engine.stateStore.snapshot()),
        });
      }

      const finalSnapshot = engine.stateStore ? toJsonSafe(engine.stateStore.snapshot()) : null;
      engine.destroy();

      return {
        ok: true,
        diagnostics: [],
        simulation: {
          tickCount: ticks,
          ticks: summaries,
          finalSnapshot,
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
