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
  evaluateUnlockTransition,
};
