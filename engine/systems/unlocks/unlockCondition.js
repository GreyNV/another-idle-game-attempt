/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} root
 * @param {string} dottedPath
 */
function readPath(root, dottedPath) {
  const parts = dottedPath.split('.');
  let current = root;
  for (const part of parts) {
    if (!isObject(current) || !(part in current)) {
      return { exists: false, value: undefined };
    }
    current = current[part];
  }
  return { exists: true, value: current };
}

const COMPARISON_OPS = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']);

/**
 * @param {number} value
 * @returns {number}
 */
function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}


/**
 * Progress fallback for zero-threshold comparisons. Produces a smooth approach
 * curve where progress increases as distance to zero shrinks.
 *
 * @param {number} current
 * @returns {number}
 */
function estimateZeroThresholdProgress(current) {
  return clampProgress(1 / (1 + Math.abs(current)));
}

/**
 * Stable progress approximation for threshold operators.
 *
 * For `gte`/`gt` this reports how close `current` is to `target` from below.
 * For `lte`/`lt` this reports how close `current` is to `target` from above.
 * For zero thresholds, progress increases smoothly as values approach zero.
 *
 * @param {{ current: number, target: number, direction: 'at-least' | 'at-most', strict?: boolean }} input
 * @returns {number}
 */
function estimateThresholdProgress(input) {
  const { current, target, direction, strict = false } = input;

  let progress = 0;
  if (direction === 'at-least') {
    if (current >= target) {
      progress = 1;
    } else if (target === 0) {
      progress = estimateZeroThresholdProgress(current);
    } else if (target > 0) {
      progress = clampProgress(current / target);
    } else {
      progress = clampProgress(target / current);
    }

    if (strict && current <= target) {
      return Math.min(progress, 1 - Number.EPSILON);
    }

    return progress;
  }

  if (current <= target) {
    progress = 1;
  } else if (target === 0) {
    progress = estimateZeroThresholdProgress(current);
  } else if (target > 0) {
    progress = clampProgress(target / current);
  } else {
    progress = clampProgress(current / target);
  }

  if (strict && current >= target) {
    return Math.min(progress, 1 - Number.EPSILON);
  }

  return progress;
}

/**
 * @param {unknown} rawCondition
 */
function parseUnlockCondition(rawCondition) {
  if (!isObject(rawCondition)) {
    return { ok: false, code: 'UNLOCK_AST_TYPE', message: 'Unlock condition must be an object.' };
  }

  const keys = Object.keys(rawCondition);
  if (keys.length !== 1) {
    return { ok: false, code: 'UNLOCK_AST_SHAPE', message: 'Unlock condition must contain exactly one operator key.' };
  }

  const [operator] = keys;
  const payload = rawCondition[operator];

  if (operator === 'always') {
    if (payload !== true && payload !== false) {
      return { ok: false, code: 'UNLOCK_ALWAYS_TYPE', message: 'always expects a boolean value.' };
    }
    return { ok: true, value: { type: 'always', value: payload } };
  }

  if (operator === 'resourceGte') {
    if (!isObject(payload) || typeof payload.path !== 'string' || typeof payload.value !== 'number') {
      return { ok: false, code: 'UNLOCK_RESOURCE_GTE_SHAPE', message: 'resourceGte expects { path: string, value: number }.' };
    }
    return { ok: true, value: { type: 'resourceGte', path: payload.path, value: payload.value } };
  }

  if (operator === 'compare') {
    if (!isObject(payload) || typeof payload.path !== 'string' || typeof payload.op !== 'string' || typeof payload.value !== 'number') {
      return { ok: false, code: 'UNLOCK_COMPARE_SHAPE', message: 'compare expects { path: string, op: string, value: number }.' };
    }
    if (!COMPARISON_OPS.has(payload.op)) {
      return { ok: false, code: 'UNLOCK_COMPARE_OP', message: `Unsupported compare op "${payload.op}".` };
    }
    return { ok: true, value: { type: 'compare', path: payload.path, op: payload.op, value: payload.value } };
  }

  if (operator === 'flag') {
    if (!isObject(payload) || typeof payload.path !== 'string') {
      return { ok: false, code: 'UNLOCK_FLAG_SHAPE', message: 'flag expects { path: string }.' };
    }
    return { ok: true, value: { type: 'flag', path: payload.path } };
  }

  if (operator === 'all' || operator === 'any') {
    if (!Array.isArray(payload) || payload.length === 0) {
      return { ok: false, code: 'UNLOCK_GROUP_SHAPE', message: `${operator} expects a non-empty array of conditions.` };
    }

    const children = [];
    for (let index = 0; index < payload.length; index += 1) {
      const parsedChild = parseUnlockCondition(payload[index]);
      if (!parsedChild.ok) {
        return { ok: false, code: parsedChild.code, message: `${operator}[${index}]: ${parsedChild.message}` };
      }
      children.push(parsedChild.value);
    }

    return { ok: true, value: { type: operator, children } };
  }

  if (operator === 'not') {
    const parsedInner = parseUnlockCondition(payload);
    if (!parsedInner.ok) {
      return { ok: false, code: parsedInner.code, message: `not: ${parsedInner.message}` };
    }
    return { ok: true, value: { type: 'not', child: parsedInner.value } };
  }

  return { ok: false, code: 'UNLOCK_AST_OPERATOR_UNKNOWN', message: `Unknown unlock operator "${operator}".` };
}

/**
 * @param {any} ast
 * @param {Record<string, unknown>} state
 */
function evaluateUnlockCondition(ast, state) {
  if (ast.type === 'always') {
    return ast.value;
  }

  if (ast.type === 'resourceGte') {
    const read = readPath(state, ast.path);
    return read.exists && typeof read.value === 'number' && read.value >= ast.value;
  }

  if (ast.type === 'compare') {
    const read = readPath(state, ast.path);
    if (!read.exists || typeof read.value !== 'number') {
      return false;
    }

    if (ast.op === 'gt') return read.value > ast.value;
    if (ast.op === 'gte') return read.value >= ast.value;
    if (ast.op === 'lt') return read.value < ast.value;
    if (ast.op === 'lte') return read.value <= ast.value;
    if (ast.op === 'eq') return read.value === ast.value;
    return read.value !== ast.value;
  }

  if (ast.type === 'flag') {
    const read = readPath(state, ast.path);
    return read.exists && read.value === true;
  }

  if (ast.type === 'all') {
    return ast.children.every((child) => evaluateUnlockCondition(child, state));
  }

  if (ast.type === 'any') {
    return ast.children.some((child) => evaluateUnlockCondition(child, state));
  }

  if (ast.type === 'not') {
    return !evaluateUnlockCondition(ast.child, state);
  }

  return false;
}

/**
 * Canonical unlock-progress estimator for unlock AST nodes.
 *
 * UI placeholder composition MUST use this API (via `UnlockEvaluator`) instead of
 * layer-specific heuristics so progress semantics stay deterministic engine-wide.
 *
 * Stable operator behavior:
 * - `resourceGte`: numeric ratio `current/required` clamped to `[0, 1]`.
 * - `compare`: `gt/gte/lt/lte` use deterministic threshold progress. Strict
 *   operators (`gt`/`lt`) never report `1` unless the strict condition is true;
 *   `eq/neq` are binary (`0` or `1`).
 * - `flag` / `always`: binary (`0` or `1`).
 * - `all`: arithmetic mean of child progress.
 * - `any`: maximum child progress.
 * - `not`: inversion (`1 - childProgress`), but returns `1` exactly when
 *   `evaluateUnlockCondition(notNode, state)` is already true.
 *
 * @param {any} ast
 * @param {Record<string, unknown>} state
 * @returns {number}
 */
function evaluateUnlockProgress(ast, state) {
  if (ast.type === 'always') {
    return ast.value ? 1 : 0;
  }

  if (ast.type === 'resourceGte') {
    const read = readPath(state, ast.path);
    if (!read.exists || typeof read.value !== 'number') {
      return 0;
    }

    if (ast.value <= 0) {
      return read.value >= ast.value ? 1 : 0;
    }

    return clampProgress(read.value / ast.value);
  }

  if (ast.type === 'compare') {
    const read = readPath(state, ast.path);
    if (!read.exists || typeof read.value !== 'number') {
      return 0;
    }

    if (ast.op === 'eq' || ast.op === 'neq') {
      return evaluateUnlockCondition(ast, state) ? 1 : 0;
    }

    if (ast.op === 'gt' || ast.op === 'gte') {
      return estimateThresholdProgress({
        current: read.value,
        target: ast.value,
        direction: 'at-least',
        strict: ast.op === 'gt',
      });
    }

    return estimateThresholdProgress({
      current: read.value,
      target: ast.value,
      direction: 'at-most',
      strict: ast.op === 'lt',
    });
  }

  if (ast.type === 'flag') {
    const read = readPath(state, ast.path);
    return read.exists && read.value === true ? 1 : 0;
  }

  if (ast.type === 'all') {
    const total = ast.children.reduce((sum, child) => sum + evaluateUnlockProgress(child, state), 0);
    return clampProgress(total / ast.children.length);
  }

  if (ast.type === 'any') {
    return ast.children.reduce((best, child) => {
      const childProgress = evaluateUnlockProgress(child, state);
      return childProgress > best ? childProgress : best;
    }, 0);
  }

  if (ast.type === 'not') {
    if (evaluateUnlockCondition(ast, state)) {
      return 1;
    }
    return clampProgress(1 - evaluateUnlockProgress(ast.child, state));
  }

  return 0;
}

/**
 * @param {{ wasUnlocked: boolean, ast: any, state: Record<string, unknown>, phase: string }} input
 */
function evaluateUnlockTransition(input) {
  if (input.phase !== 'end-of-tick') {
    throw new Error(`Unlock transitions must be evaluated at end-of-tick, received phase "${input.phase}".`);
  }

  if (input.wasUnlocked) {
    return { unlocked: true, transitioned: false };
  }

  const nowUnlocked = evaluateUnlockCondition(input.ast, input.state);
  return {
    unlocked: nowUnlocked,
    transitioned: nowUnlocked,
  };
}

module.exports = {
  COMPARISON_OPS,
  parseUnlockCondition,
  evaluateUnlockCondition,
  evaluateUnlockProgress,
  evaluateUnlockTransition,
};
