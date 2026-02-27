/** @type {import('./types').CompatibilityPolicy} */
const DEFAULT_COMPATIBILITY_POLICY = {
  supportedMajor: 1,
  minimumMinor: 0,
  maximumMinor: 1,
};

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
        message: 'schemaVersion must be a string in <major>.<minor> format.',
        hint: 'Set meta.schemaVersion to a string like "1.0".',
      },
    ];
  }

  const match = /^(\d+)\.(\d+)$/.exec(schemaVersion);
  if (!match) {
    return [
      {
        code: 'SCHEMA_VERSION_FORMAT',
        path: '/meta/schemaVersion',
        message: `Unsupported schemaVersion format "${schemaVersion}".`,
        hint: 'Use numeric dot notation (for example "1.0").',
      },
    ];
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

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
  DEFAULT_COMPATIBILITY_POLICY,
  validateSchemaVersion,
};
