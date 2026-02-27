function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }

  const result = {};
  for (const [key, entryValue] of Object.entries(value)) {
    result[key] = deepClone(entryValue);
  }
  return result;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

function splitPath(path) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new Error('path must be a non-empty string');
  }
  return path.split('.');
}

function readPath(root, path) {
  const parts = splitPath(path);
  let current = root;

  for (const part of parts) {
    if (!isPlainObject(current) || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

function writePath(root, path, value) {
  const parts = splitPath(path);
  let current = root;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = current[part];
    if (!isPlainObject(next)) {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

function patchPath(root, path, partial) {
  if (!isPlainObject(partial)) {
    throw new Error('partial must be a plain object');
  }

  const current = readPath(root, path);
  if (current !== undefined && !isPlainObject(current)) {
    throw new Error(`Cannot patch non-object value at path "${path}".`);
  }

  const next = { ...(current || {}), ...deepClone(partial) };
  writePath(root, path, next);
}

class StateStore {
  constructor(initialState = {}) {
    this.canonicalState = deepClone(initialState);
    this.derivedState = {};
  }

  /**
   * Canonical-vs-derived policy:
   * - Canonical state is mutable through set/patch.
   * - Derived state is read-only to general callers and can only be replaced via setDerived().
   */
  get(path) {
    if (path.startsWith('derived.')) {
      return readPath(this.derivedState, path.slice('derived.'.length));
    }

    if (path === 'derived') {
      return this.derivedState;
    }

    return readPath(this.canonicalState, path);
  }

  set(path, value) {
    this.#assertCanonicalWritePath(path);
    writePath(this.canonicalState, path, deepClone(value));
  }

  patch(path, partial) {
    this.#assertCanonicalWritePath(path);
    patchPath(this.canonicalState, path, partial);
  }

  setDerived(path, value) {
    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new Error('path must be a non-empty string');
    }

    writePath(this.derivedState, path, deepClone(value));
  }

  snapshot() {
    return deepFreeze({
      canonical: deepClone(this.canonicalState),
      derived: deepClone(this.derivedState),
    });
  }

  #assertCanonicalWritePath(path) {
    if (path === 'derived' || path.startsWith('derived.')) {
      throw new Error('StateStore canonical policy violation: set/patch cannot write into derived state namespace.');
    }
  }
}

module.exports = {
  StateStore,
};
