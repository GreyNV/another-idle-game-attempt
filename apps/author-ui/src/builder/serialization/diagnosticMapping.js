const HIERARCHY_SEGMENTS = Object.freeze([
  { token: 'layers', kind: 'Layer' },
  { token: 'sublayers', kind: 'SubLayer' },
  { token: 'sections', kind: 'Section' },
  { token: 'elements', kind: 'Element' },
]);

export function createPointerMaps() {
  return {
    pointerToUiId: {},
    uiIdToPointerRoot: {},
  };
}

function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parseHierarchyPointer(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    return [];
  }

  const segments = pointer.split('/').slice(1).map(decodePointerSegment);
  const matches = [];

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];
    const hierarchy = HIERARCHY_SEGMENTS.find((entry) => entry.token === segment);

    if (!hierarchy) {
      continue;
    }

    const numeric = Number.parseInt(next, 10);
    if (Number.isNaN(numeric)) {
      continue;
    }

    matches.push({ kind: hierarchy.kind, index: numeric });
  }

  return matches;
}

export function resolveUiIdFromDiagnosticPath(path, pointerToUiId) {
  if (!path || typeof path !== 'string') {
    return null;
  }

  const parsed = parseHierarchyPointer(path);
  if (parsed.length === 0) {
    return null;
  }

  let pointer = '';
  for (const entry of parsed) {
    const token = HIERARCHY_SEGMENTS.find((segment) => segment.kind === entry.kind)?.token;
    if (!token) {
      continue;
    }
    pointer += `/${token}/${entry.index}`;
  }

  return pointerToUiId[pointer] || null;
}
