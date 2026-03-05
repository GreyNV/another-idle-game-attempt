const assert = require('assert');

(async () => {
  const { fromGameDefinition, toGameDefinition } = await import('../apps/author-ui/src/builder/serialization/builderSerialization.js');
  const { parseHierarchyPointer, resolveUiIdFromDiagnosticPath } = await import('../apps/author-ui/src/builder/serialization/diagnosticMapping.js');

  const definition = {
    meta: { schemaVersion: '1.2.0', gameId: 'diag-map' },
    systems: {},
    state: {},
    layers: [
      {
        id: 'layer-a',
        sublayers: [
          {
            id: 'sub-a',
            sections: [
              {
                id: 'sec-a',
                elements: [{ id: 'el-1' }, { id: 'el-2' }, { id: 'el-3' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const { graph } = fromGameDefinition(definition);
  const { pointerMaps } = toGameDefinition(graph);

  const parsed = parseHierarchyPointer('/layers/0/sublayers/0/sections/0/elements/2/type');
  assert.deepStrictEqual(parsed, [
    { kind: 'Layer', index: 0 },
    { kind: 'SubLayer', index: 0 },
    { kind: 'Section', index: 0 },
    { kind: 'Element', index: 2 },
  ]);

  const uiId = resolveUiIdFromDiagnosticPath('/layers/0/sublayers/0/sections/0/elements/2/type', pointerMaps.pointerToUiId);
  const elementUiId = graph.layers[0].children[0].children[0].children[2].uiId;
  assert.strictEqual(uiId, elementUiId);

  assert.strictEqual(pointerMaps.uiIdToPointerRoot[elementUiId], '/layers/0/sublayers/0/sections/0/elements/2');

  console.log('author-ui-builder-diagnostic-mapping tests passed');
})();
