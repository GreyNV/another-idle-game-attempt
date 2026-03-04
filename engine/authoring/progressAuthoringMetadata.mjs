const PROGRESS_ENTITY_KINDS = Object.freeze(['resources', 'routines', 'buyables', 'upgrades']);

function buildField(key, config) {
  return Object.freeze({
    key,
    required: false,
    defaultValue: '',
    input: Object.freeze({ kind: 'text' }),
    ...config,
  });
}

const progressAuthoringMetadata = Object.freeze({
  palette: Object.freeze({
    groups: Object.freeze([
      Object.freeze({ id: 'production', label: 'Production', kinds: Object.freeze(['resources', 'routines']) }),
      Object.freeze({ id: 'economy', label: 'Economy', kinds: Object.freeze(['buyables', 'upgrades']) }),
    ]),
    labels: Object.freeze({
      resources: 'Resources',
      routines: 'Routines',
      buyables: 'Buyables',
      upgrades: 'Upgrades',
    }),
  }),
  kinds: Object.freeze({
    resources: Object.freeze({
      kind: 'resources',
      label: 'Resource',
      output: Object.freeze({
        sectionPath: 'progress.resources',
        orderPath: 'progress.resources.order',
        byIdPath: 'progress.resources.byId',
        entryPathTemplate: 'progress.resources.byId.{id}',
      }),
      defaultTemplate: Object.freeze({ id: '', name: 'New Resource', start: 0 }),
      fields: Object.freeze([
        buildField('id', { label: 'Id', required: true, input: Object.freeze({ kind: 'id' }), persistedPath: 'progress.resources.byId.{id}.id' }),
        buildField('name', { label: 'Name', required: true, defaultValue: 'New Resource', persistedPath: 'progress.resources.byId.{id}.name' }),
        buildField('start', {
          label: 'Start Value',
          required: true,
          defaultValue: 0,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.resources.byId.{id}.start',
        }),
      ]),
    }),
    routines: Object.freeze({
      kind: 'routines',
      label: 'Routine',
      output: Object.freeze({
        sectionPath: 'progress.routines',
        orderPath: 'progress.routines.order',
        byIdPath: 'progress.routines.byId',
        entryPathTemplate: 'progress.routines.byId.{id}',
      }),
      defaultTemplate: Object.freeze({
        id: '',
        name: 'New Routine',
        producesResourceId: '',
        producesAmount: 1,
        consumesResourceId: '',
        consumesAmount: 0,
      }),
      fields: Object.freeze([
        buildField('id', { label: 'Id', required: true, input: Object.freeze({ kind: 'id' }), persistedPath: 'progress.routines.byId.{id}.id' }),
        buildField('name', { label: 'Name', required: true, defaultValue: 'New Routine', persistedPath: 'progress.routines.byId.{id}.name' }),
        buildField('producesResourceId', {
          label: 'Produces Resource Id',
          required: true,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'resources' }),
          persistedPath: 'progress.routines.byId.{id}.producesResourceId',
        }),
        buildField('producesAmount', {
          label: 'Produces Amount',
          required: true,
          defaultValue: 1,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.routines.byId.{id}.producesAmount',
        }),
        buildField('consumesResourceId', {
          label: 'Consumes Resource Id',
          required: false,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'resources' }),
          persistedPath: 'progress.routines.byId.{id}.consumesResourceId',
        }),
        buildField('consumesAmount', {
          label: 'Consumes Amount',
          required: false,
          defaultValue: 0,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.routines.byId.{id}.consumesAmount',
        }),
      ]),
    }),
    buyables: Object.freeze({
      kind: 'buyables',
      label: 'Buyable',
      output: Object.freeze({
        sectionPath: 'progress.buyables',
        orderPath: 'progress.buyables.order',
        byIdPath: 'progress.buyables.byId',
        entryPathTemplate: 'progress.buyables.byId.{id}',
      }),
      defaultTemplate: Object.freeze({
        id: '',
        name: 'New Buyable',
        costResourceId: '',
        costAmount: 10,
        grantsRoutineId: '',
        effectTargetResourceId: '',
        effectAmount: 1,
      }),
      fields: Object.freeze([
        buildField('id', { label: 'Id', required: true, input: Object.freeze({ kind: 'id' }), persistedPath: 'progress.buyables.byId.{id}.id' }),
        buildField('name', { label: 'Name', required: true, defaultValue: 'New Buyable', persistedPath: 'progress.buyables.byId.{id}.name' }),
        buildField('costResourceId', {
          label: 'Cost Resource Id',
          required: true,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'resources' }),
          persistedPath: 'progress.buyables.byId.{id}.costResourceId',
        }),
        buildField('costAmount', {
          label: 'Cost Amount',
          required: true,
          defaultValue: 10,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.buyables.byId.{id}.costAmount',
        }),
        buildField('grantsRoutineId', {
          label: 'Grants Routine Id',
          required: false,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'routines' }),
          persistedPath: 'progress.buyables.byId.{id}.grantsRoutineId',
        }),
        buildField('effectTargetResourceId', {
          label: 'Effect Target Resource Id',
          required: false,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'resources' }),
          persistedPath: 'progress.buyables.byId.{id}.effectTargetResourceId',
        }),
        buildField('effectAmount', {
          label: 'Effect Amount',
          required: false,
          defaultValue: 1,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.buyables.byId.{id}.effectAmount',
        }),
      ]),
    }),
    upgrades: Object.freeze({
      kind: 'upgrades',
      label: 'Upgrade',
      output: Object.freeze({
        sectionPath: 'progress.upgrades',
        orderPath: 'progress.upgrades.order',
        byIdPath: 'progress.upgrades.byId',
        entryPathTemplate: 'progress.upgrades.byId.{id}',
      }),
      defaultTemplate: Object.freeze({
        id: '',
        name: 'New Upgrade',
        costResourceId: '',
        costAmount: 25,
        targetResourceId: '',
        targetBuyableId: '',
        multiplier: 2,
      }),
      fields: Object.freeze([
        buildField('id', { label: 'Id', required: true, input: Object.freeze({ kind: 'id' }), persistedPath: 'progress.upgrades.byId.{id}.id' }),
        buildField('name', { label: 'Name', required: true, defaultValue: 'New Upgrade', persistedPath: 'progress.upgrades.byId.{id}.name' }),
        buildField('costResourceId', {
          label: 'Cost Resource Id',
          required: true,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'resources' }),
          persistedPath: 'progress.upgrades.byId.{id}.costResourceId',
        }),
        buildField('costAmount', {
          label: 'Cost Amount',
          required: true,
          defaultValue: 25,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.upgrades.byId.{id}.costAmount',
        }),
        buildField('targetResourceId', {
          label: 'Target Resource Id',
          required: false,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'resources' }),
          persistedPath: 'progress.upgrades.byId.{id}.targetResourceId',
        }),
        buildField('targetBuyableId', {
          label: 'Target Buyable Id',
          required: false,
          defaultValue: '',
          input: Object.freeze({ kind: 'ref', section: 'buyables' }),
          persistedPath: 'progress.upgrades.byId.{id}.targetBuyableId',
        }),
        buildField('multiplier', {
          label: 'Multiplier',
          required: true,
          defaultValue: 2,
          input: Object.freeze({ kind: 'number' }),
          persistedPath: 'progress.upgrades.byId.{id}.multiplier',
        }),
      ]),
    }),
  }),
});

function asKindList(metadata = progressAuthoringMetadata) {
  return PROGRESS_ENTITY_KINDS.filter((kind) => Boolean(metadata.kinds[kind]));
}

export { PROGRESS_ENTITY_KINDS, progressAuthoringMetadata, asKindList };
