import { progressAuthoringMetadata } from '../../../../engine/index.mjs';

const LAYER_ARCHETYPE_OPTIONS = Object.freeze(['progressLayer', 'inventoryLayer', 'statisticsLayer']);

const LAYER_KIND_METADATA = Object.freeze({
  kind: 'layers',
  label: 'Layer',
  output: Object.freeze({
    sectionPath: 'progress.layers',
    orderPath: 'progress.layers.order',
    byIdPath: 'progress.layers.byId',
    entryPathTemplate: 'progress.layers.byId.{id}',
  }),
  defaultTemplate: Object.freeze({
    id: '',
    title: 'New Layer',
    type: 'progressLayer',
  }),
  fields: Object.freeze([
    Object.freeze({ key: 'id', label: 'Id', required: true, defaultValue: '', input: Object.freeze({ kind: 'id' }) }),
    Object.freeze({ key: 'title', label: 'Title', required: true, defaultValue: 'New Layer', input: Object.freeze({ kind: 'text' }) }),
    Object.freeze({
      key: 'type',
      label: 'Archetype',
      required: true,
      defaultValue: 'progressLayer',
      input: Object.freeze({ kind: 'enum', options: LAYER_ARCHETYPE_OPTIONS }),
    }),
  ]),
});

export const SECTION_ORDER = Object.freeze([
  'layers',
  ...progressAuthoringMetadata.palette.groups.flatMap((group) => group.kinds),
]);

export const SECTION_LABELS = Object.freeze({
  layers: 'Layers',
  ...progressAuthoringMetadata.palette.labels,
});

function toLegacyField(field) {
  const inputKind = field.input && field.input.kind;
  let type = 'text';

  if (inputKind === 'number') {
    type = 'number';
  } else if (inputKind === 'id') {
    type = 'id';
  } else if (inputKind === 'ref') {
    type = `ref:${field.input.section}`;
  } else if (inputKind === 'enum') {
    type = `enum:${(field.input.options || []).join('|')}`;
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

const progressKinds = Object.fromEntries(
  progressAuthoringMetadata.palette.groups
    .flatMap((group) => group.kinds)
    .map((section) => {
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
);

export const ENTITY_METADATA = Object.freeze({
  layers: {
    kind: LAYER_KIND_METADATA.kind,
    label: LAYER_KIND_METADATA.label,
    output: LAYER_KIND_METADATA.output,
    defaults: Object.fromEntries(
      Object.entries(LAYER_KIND_METADATA.defaultTemplate).filter(([key]) => key !== 'id')
    ),
    fields: LAYER_KIND_METADATA.fields.map(toLegacyField),
  },
  ...progressKinds,
});

export const PALETTE_GROUPS = Object.freeze([
  Object.freeze({ id: 'structure', label: 'Structure', kinds: Object.freeze(['layers']) }),
  ...progressAuthoringMetadata.palette.groups.map((group) => ({ ...group })),
]);
