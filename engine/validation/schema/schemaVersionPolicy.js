/** @type {import('./types').CompatibilityPolicy} */
const DEFAULT_COMPATIBILITY_POLICY = {
  supportedMajor: 1,
  minimumMinor: 0,
  maximumMinor: 2,
};

/**
 * @typedef {{major: number, minor: number, patch: number}} NormalizedSchemaVersion
 */

/**
 * @param {unknown} version
 * @returns {NormalizedSchemaVersion | null}
 */
function parseSchemaVersion(version) {
  if (typeof version !== 'string') {
    return null;
  }

  const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(version);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  };
}

/**
 * @param {unknown} left
 * @param {unknown} right
 * @returns {number | null}
 */
function compareSchemaVersions(left, right) {
  const leftVersion = parseSchemaVersion(left);
  const rightVersion = parseSchemaVersion(right);
  if (!leftVersion || !rightVersion) {
    return null;
  }

  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major;
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor;
  }

  return leftVersion.patch - rightVersion.patch;
}

/**
 * @param {unknown} schemaVersion
 * @param {import('./types').CompatibilityPolicy} [policy]
 * @returns {import('./types').ValidationIssue[]}
 */
function validateSchemaVersion(schemaVersion, policy = DEFAULT_COMPATIBILITY_POLICY) {
  if (typeof schemaVersion !== 'string') {
    return [
      {
        code: 'SCHEMA_VERSION_TYPE',
        path: '/meta/schemaVersion',
        message: 'schemaVersion must be a string in <major>.<minor>[.<patch>] format.',
        hint: 'Set meta.schemaVersion to a string like "1.0" or "1.2.0".',
      },
    ];
  }

  const normalized = parseSchemaVersion(schemaVersion);
  if (!normalized) {
    return [
      {
        code: 'SCHEMA_VERSION_FORMAT',
        path: '/meta/schemaVersion',
        message: `Unsupported schemaVersion format "${schemaVersion}".`,
        hint: 'Use numeric dot notation (for example "1.0" or "1.2.0").',
      },
    ];
  }

  const { major, minor } = normalized;

  if (major !== policy.supportedMajor) {
    return [
      {
        code: 'SCHEMA_VERSION_MAJOR_MISMATCH',
        path: '/meta/schemaVersion',
        message: `Schema major ${major} is incompatible with engine major ${policy.supportedMajor}.`,
        hint: `Migrate definition to ${policy.supportedMajor}.x or run an engine supporting ${major}.x.`,
      },
    ];
  }

  if (minor < policy.minimumMinor || minor > policy.maximumMinor) {
    return [
      {
        code: 'SCHEMA_VERSION_MINOR_OUT_OF_RANGE',
        path: '/meta/schemaVersion',
        message: `Schema minor ${minor} is outside supported range ${policy.minimumMinor}-${policy.maximumMinor} for major ${major}.`,
        hint: `Use a schemaVersion between ${major}.${policy.minimumMinor} and ${major}.${policy.maximumMinor}.`,
      },
    ];
  }

  return [];
}

module.exports = {
  compareSchemaVersions,
  DEFAULT_COMPATIBILITY_POLICY,
  parseSchemaVersion,
  validateSchemaVersion,
};
