import engineContracts from '../../../../engine/index.js';

const { AuthoringFacade, progressAuthoringMetadata } = engineContracts;

void AuthoringFacade;

export const SECTION_ORDER = Object.freeze(
  progressAuthoringMetadata.palette.groups.flatMap((group) => group.kinds)
);

export const SECTION_LABELS = Object.freeze({ ...progressAuthoringMetadata.palette.labels });

function toLegacyField(field) {
  const inputKind = field.input && field.input.kind;
  let type = 'text';

  if (inputKind === 'number') {
    type = 'number';
  } else if (inputKind === 'id') {
    type = 'id';
  } else if (inputKind === 'ref') {
    type = `ref:${field.input.section}`;
  }

  return {
    key: field.key,
    label: field.label,
    type,
    required: field.required,
    defaultValue: field.defaultValue,
    persistedPath: field.persistedPath,
  };
}

export const ENTITY_METADATA = Object.freeze(
  Object.fromEntries(
    SECTION_ORDER.map((section) => {
      const kindMetadata = progressAuthoringMetadata.kinds[section];
      return [
        section,
        {
          kind: kindMetadata.kind,
          label: kindMetadata.label,
          output: kindMetadata.output,
          defaults: Object.fromEntries(
            Object.entries(kindMetadata.defaultTemplate).filter(([key]) => key !== 'id')
          ),
          fields: kindMetadata.fields.map(toLegacyField),
        },
      ];
    })
  )
);

export const PALETTE_GROUPS = Object.freeze(progressAuthoringMetadata.palette.groups.map((group) => ({ ...group })));
