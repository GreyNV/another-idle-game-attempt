const assert = require('assert');

(async () => {
  const { fromGameDefinition, toGameDefinition } = await import('../apps/author-ui/src/builder/serialization/builderSerialization.js');

  const definition = {
    meta: { schemaVersion: '1.2.0', gameId: 'roundtrip' },
    systems: { tickMs: 100 },
    state: { resources: { wood: 1 } },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        sublayers: [
          {
            id: 'core',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                type: 'actions',
                elements: [
                  { id: 'woodcut', type: 'routine', mode: 'manual' },
                  { id: 'mine', type: 'routine', mode: 'auto' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const { graph } = fromGameDefinition(definition);
  const { definition: serialized } = toGameDefinition(graph);

  assert.deepStrictEqual(serialized, definition);

  const uiIds = [];
  const visit = (node) => {
    uiIds.push(node.uiId);
    node.children.forEach(visit);
  };
  graph.layers.forEach(visit);

  assert.strictEqual(new Set(uiIds).size, uiIds.length, 'uiId values should be unique per block');

  console.log('author-ui-builder-roundtrip tests passed');
})();
