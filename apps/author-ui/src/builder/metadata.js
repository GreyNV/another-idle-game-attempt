export const BUILDER_METADATA = Object.freeze({
  Layer: {
    label: 'Layer',
    fields: [
      { key: 'id', label: 'Id', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
    ],
  },
  SubLayer: {
    label: 'SubLayer',
    fields: [
      { key: 'id', label: 'Id', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
    ],
  },
  Section: {
    label: 'Section',
    fields: [
      { key: 'id', label: 'Id', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
    ],
  },
  Element: {
    label: 'Element',
    fields: [
      { key: 'id', label: 'Id', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'intent', label: 'Intent', type: 'text' },
      { key: 'label', label: 'Label', type: 'text' },
    ],
  },
});
