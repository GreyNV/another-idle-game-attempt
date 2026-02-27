const NODE_REF_ORDER = ['layer', 'sublayer', 'section', 'element'];

/**
 * @param {unknown} value
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {string} ref
 */
function parseNodeRef(ref) {
  if (!isNonEmptyString(ref)) {
    return { ok: false, code: 'NODE_REF_EMPTY', message: 'Node reference must be a non-empty string.' };
  }

  const parts = ref.split('/').map((part) => part.trim());
  const parsed = {};
  let lastScopeIndex = -1;

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    if (part.length === 0) {
      return { ok: false, code: 'NODE_REF_SEGMENT_EMPTY', message: `Reference contains an empty segment at index ${partIndex}.` };
    }

    const colonIndex = part.indexOf(':');
    if (colonIndex <= 0 || colonIndex === part.length - 1) {
      return { ok: false, code: 'NODE_REF_FORMAT', message: `Invalid segment "${part}". Expected <scope>:<id>.` };
    }

    const scope = part.slice(0, colonIndex).trim();
    const id = part.slice(colonIndex + 1).trim();
    if (!isNonEmptyString(id)) {
      return { ok: false, code: 'NODE_REF_ID_EMPTY', message: `Scope "${scope}" must include a non-empty id.` };
    }

    const scopeIndex = NODE_REF_ORDER.indexOf(scope);
    if (scopeIndex === -1) {
      return { ok: false, code: 'NODE_REF_SCOPE_INVALID', message: `Unknown scope "${scope}".` };
    }

    if (parsed[scope]) {
      return { ok: false, code: 'NODE_REF_SCOPE_DUPLICATE', message: `Scope "${scope}" is repeated.` };
    }

    if (scopeIndex !== lastScopeIndex + 1) {
      return {
        ok: false,
        code: 'NODE_REF_SCOPE_ORDER',
        message: `Scope "${scope}" is out of order. Required order: ${NODE_REF_ORDER.join(' -> ')}.`,
      };
    }

    parsed[scope] = id;
    lastScopeIndex = scopeIndex;
  }

  if (!parsed.layer) {
    return { ok: false, code: 'NODE_REF_LAYER_REQUIRED', message: 'Node reference must start at layer scope.' };
  }

  return {
    ok: true,
    value: {
      layer: parsed.layer,
      sublayer: parsed.sublayer,
      section: parsed.section,
      element: parsed.element,
    },
  };
}

/**
 * @param {{layer: string, sublayer?: string, section?: string, element?: string}} nodeRef
 */
function formatNodeRef(nodeRef) {
  const segments = [`layer:${nodeRef.layer}`];
  if (nodeRef.sublayer) {
    segments.push(`sublayer:${nodeRef.sublayer}`);
  }
  if (nodeRef.section) {
    segments.push(`section:${nodeRef.section}`);
  }
  if (nodeRef.element) {
    segments.push(`element:${nodeRef.element}`);
  }
  return segments.join('/');
}

/**
 * @param {string} ref
 */
function normalizeNodeRef(ref) {
  const parsed = parseNodeRef(ref);
  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, value: formatNodeRef(parsed.value) };
}

module.exports = {
  NODE_REF_ORDER,
  parseNodeRef,
  formatNodeRef,
  normalizeNodeRef,
};
