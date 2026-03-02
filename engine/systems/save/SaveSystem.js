const {
  compareSchemaVersions,
  validateSchemaVersion,
  DEFAULT_COMPATIBILITY_POLICY,
} = require('../../validation/schema/schemaVersionPolicy');

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class SaveSystem {
  constructor(options = {}) {
    this.compatibilityPolicy = options.compatibilityPolicy || DEFAULT_COMPATIBILITY_POLICY;
    this.schemaVersion = options.schemaVersion;

    const schemaIssues = validateSchemaVersion(this.schemaVersion, this.compatibilityPolicy);
    if (schemaIssues.length > 0) {
      throw new Error(`SaveSystem requires a compatible schemaVersion. ${schemaIssues[0].message}`);
    }
  }

  serialize(stateSnapshot, metadata = {}) {
    if (!isPlainObject(stateSnapshot)) {
      throw new Error('SaveSystem.serialize requires stateSnapshot to be a plain object.');
    }

    if (!isPlainObject(metadata)) {
      throw new Error('SaveSystem.serialize requires metadata to be a plain object when provided.');
    }

    return {
      schemaVersion: this.schemaVersion,
      snapshot: clone(stateSnapshot),
      metadata: clone(metadata),
    };
  }

  deserialize(payload) {
    if (!isPlainObject(payload)) {
      throw new Error('SaveSystem.deserialize requires payload to be a plain object.');
    }

    const migrated = this.migrate(payload, this.schemaVersion);
    return {
      schemaVersion: migrated.schemaVersion,
      snapshot: clone(migrated.snapshot),
      metadata: clone(migrated.metadata || {}),
    };
  }

  migrate(payload, targetSchemaVersion) {
    if (!isPlainObject(payload)) {
      throw new Error('SaveSystem.migrate requires payload to be a plain object.');
    }

    const targetIssues = validateSchemaVersion(targetSchemaVersion, this.compatibilityPolicy);
    if (targetIssues.length > 0) {
      throw new Error(`SaveSystem.migrate target schemaVersion is invalid. ${targetIssues[0].message}`);
    }

    const payloadVersionIssues = validateSchemaVersion(payload.schemaVersion, this.compatibilityPolicy);
    if (payloadVersionIssues.length > 0) {
      throw new Error(`SaveSystem.migrate payload schemaVersion is incompatible. ${payloadVersionIssues[0].message}`);
    }

    const comparison = compareSchemaVersions(payload.schemaVersion, targetSchemaVersion);
    if (comparison === null) {
      throw new Error('SaveSystem.migrate could not compare schema versions.');
    }

    if (comparison === 0) {
      return {
        schemaVersion: targetSchemaVersion,
        snapshot: clone(payload.snapshot),
        metadata: clone(payload.metadata || {}),
      };
    }

    throw new Error(
      `SaveSystem.migrate has no migration path from schemaVersion ${payload.schemaVersion} to ${targetSchemaVersion}.`
    );
  }
}

module.exports = {
  SaveSystem,
};
