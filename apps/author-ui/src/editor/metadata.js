export const SECTION_ORDER = ['resources', 'routines', 'buyables', 'upgrades'];

export const SECTION_LABELS = {
  resources: 'Resources',
  routines: 'Routines',
  buyables: 'Buyables',
  upgrades: 'Upgrades',
};

export const ENTITY_METADATA = {
  resources: {
    label: 'Resource',
    fields: [
      { key: 'id', label: 'Id', type: 'id', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true, defaultValue: 'New Resource' },
      { key: 'start', label: 'Start Value', type: 'number', required: true, defaultValue: 0 },
    ],
    defaults: { name: 'New Resource', start: 0 },
  },
  routines: {
    label: 'Routine',
    fields: [
      { key: 'id', label: 'Id', type: 'id', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true, defaultValue: 'New Routine' },
      { key: 'producesResourceId', label: 'Produces Resource Id', type: 'ref:resources', required: true, defaultValue: '' },
      { key: 'producesAmount', label: 'Produces Amount', type: 'number', required: true, defaultValue: 1 },
      { key: 'consumesResourceId', label: 'Consumes Resource Id', type: 'ref:resources', required: false, defaultValue: '' },
      { key: 'consumesAmount', label: 'Consumes Amount', type: 'number', required: false, defaultValue: 0 },
    ],
    defaults: {
      name: 'New Routine',
      producesResourceId: '',
      producesAmount: 1,
      consumesResourceId: '',
      consumesAmount: 0,
    },
  },
  buyables: {
    label: 'Buyable',
    fields: [
      { key: 'id', label: 'Id', type: 'id', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true, defaultValue: 'New Buyable' },
      { key: 'costResourceId', label: 'Cost Resource Id', type: 'ref:resources', required: true, defaultValue: '' },
      { key: 'costAmount', label: 'Cost Amount', type: 'number', required: true, defaultValue: 10 },
      { key: 'grantsRoutineId', label: 'Grants Routine Id', type: 'ref:routines', required: false, defaultValue: '' },
      { key: 'effectTargetResourceId', label: 'Effect Target Resource Id', type: 'ref:resources', required: false, defaultValue: '' },
      { key: 'effectAmount', label: 'Effect Amount', type: 'number', required: false, defaultValue: 1 },
    ],
    defaults: {
      name: 'New Buyable',
      costResourceId: '',
      costAmount: 10,
      grantsRoutineId: '',
      effectTargetResourceId: '',
      effectAmount: 1,
    },
  },
  upgrades: {
    label: 'Upgrade',
    fields: [
      { key: 'id', label: 'Id', type: 'id', required: true },
      { key: 'name', label: 'Name', type: 'text', required: true, defaultValue: 'New Upgrade' },
      { key: 'costResourceId', label: 'Cost Resource Id', type: 'ref:resources', required: true, defaultValue: '' },
      { key: 'costAmount', label: 'Cost Amount', type: 'number', required: true, defaultValue: 25 },
      { key: 'targetResourceId', label: 'Target Resource Id', type: 'ref:resources', required: false, defaultValue: '' },
      { key: 'targetBuyableId', label: 'Target Buyable Id', type: 'ref:buyables', required: false, defaultValue: '' },
      { key: 'multiplier', label: 'Multiplier', type: 'number', required: true, defaultValue: 2 },
    ],
    defaults: {
      name: 'New Upgrade',
      costResourceId: '',
      costAmount: 25,
      targetResourceId: '',
      targetBuyableId: '',
      multiplier: 2,
    },
  },
};
