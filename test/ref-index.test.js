const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { buildRefIndex } = require('../engine/validation/refIndex');

function loadFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'validation', 'fixtures', name), 'utf8')
  );
}

function runDiscoveredRefsCheck() {
  const refIndex = buildRefIndex(loadFixture('valid-definition.json'));

  assert.deepStrictEqual(refIndex.existingNodeRefs, [
    'idle',
    'idle/routines',
    'idle/routines/jobs',
    'idle/routines/jobs/woodcut',
    'idle/routines/jobs/woodcut-upgrade',
  ]);

  assert.deepStrictEqual(refIndex.referencedTargets, [
    {
      path: '/layers/0/softcaps/0/scope',
      ref: 'layer:idle/sublayer:routines/section:jobs/element:woodcut',
      source: 'softcap.scope',
      nodeRef: 'idle/routines/jobs/woodcut',
    },
    {
      path: '/layers/0/sublayers/0/sections/0/elements/1/effect/targetRef',
      ref: 'layer:idle/sublayer:routines/section:jobs/element:woodcut',
      source: 'effect.targetRef',
      nodeRef: 'idle/routines/jobs/woodcut',
    },
  ]);

  assert.deepStrictEqual(refIndex.unresolvedRefs, []);
}

function runUnresolvedRefDetectionCheck() {
  const refIndex = buildRefIndex(loadFixture('invalid-target-reference.json'));

  assert.deepStrictEqual(refIndex.unresolvedRefs, [
    {
      path: '/layers/0/sublayers/0/sections/0/elements/0/effect/targetRef',
      ref: 'layer:idle/sublayer:routines/section:jobs/element:missing',
      source: 'effect.targetRef',
      code: 'REF_ELEMENT_MISSING',
    },
  ]);
}

function runDeterministicOrderingCheck() {
  const definition = {
    meta: { schemaVersion: '1.0', gameId: 'ref-index-ordering' },
    systems: { tickMs: 100 },
    state: { resources: { xp: 0 }, flags: { introSeen: true } },
    layers: [
      {
        id: 'idle',
        type: 'progressLayer',
        softcaps: [
          { id: 'late', scope: 'layer:missingLayer', mode: 'power', key: 'gain', softcapAt: 10, power: 0.5 },
          { id: 'early', scope: 'layer:idle/sublayer:routines', mode: 'power', key: 'gain', softcapAt: 10, power: 0.5 },
        ],
        sublayers: [
          {
            id: 'routines',
            type: 'progress',
            sections: [
              {
                id: 'jobs',
                elements: [
                  {
                    id: 'a-upgrade',
                    type: 'upgrade',
                    effect: { targetRef: 'bad-format' },
                  },
                  {
                    id: 'z-upgrade',
                    type: 'upgrade',
                    unlock: { all: [{ targetRef: 'layer:idle/sublayer:routines/section:jobs/element:missing' }] },
                    effect: { targetRef: 'layer:idle/sublayer:routines/section:jobs/element:a-upgrade' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const refIndex = buildRefIndex(definition);
  assert.deepStrictEqual(
    refIndex.referencedTargets.map((entry) => entry.path),
    [
      '/layers/0/softcaps/0/scope',
      '/layers/0/softcaps/1/scope',
      '/layers/0/sublayers/0/sections/0/elements/0/effect/targetRef',
      '/layers/0/sublayers/0/sections/0/elements/1/effect/targetRef',
      '/layers/0/sublayers/0/sections/0/elements/1/unlock/all/0/targetRef',
    ]
  );

  assert.deepStrictEqual(
    refIndex.unresolvedRefs.map((entry) => `${entry.path}:${entry.code}`),
    [
      '/layers/0/softcaps/0/scope:REF_LAYER_MISSING',
      '/layers/0/sublayers/0/sections/0/elements/0/effect/targetRef:REF_FORMAT',
      '/layers/0/sublayers/0/sections/0/elements/1/unlock/all/0/targetRef:REF_ELEMENT_MISSING',
    ]
  );
}

runDiscoveredRefsCheck();
runUnresolvedRefDetectionCheck();
runDeterministicOrderingCheck();

console.log('ref-index.test.js passed');
