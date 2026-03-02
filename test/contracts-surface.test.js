const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const CONTRACT_MODULES = [
  {
    modulePath: 'engine/core/contracts/BaseLayer.js',
    exports: ['BASE_LAYER_CONTRACT', 'REQUIRED_LAYER_METHODS', 'assertValidBaseLayerInstance'],
  },
  {
    modulePath: 'engine/core/contracts/EventBusContract.js',
    exports: ['EVENT_BUS_CONTRACT'],
  },
  {
    modulePath: 'engine/core/contracts/StateStoreContract.js',
    exports: ['STATE_STORE_CONTRACT'],
  },
  {
    modulePath: 'engine/core/contracts/IntentRouterContract.js',
    exports: ['INTENT_ROUTER_CONTRACT'],
  },
  {
    modulePath: 'engine/core/contracts/UnlockEvaluatorContract.js',
    exports: ['UNLOCK_EVALUATOR_CONTRACT'],
  },
  {
    modulePath: 'engine/core/contracts/ModifierResolverContract.js',
    exports: ['MODIFIER_RESOLVER_CONTRACT'],
  },
];

function run() {
  for (const contractModule of CONTRACT_MODULES) {
    const absolutePath = path.join(REPO_ROOT, contractModule.modulePath);
    assert.strictEqual(fs.existsSync(absolutePath), true, `Expected contract file: ${contractModule.modulePath}`);

    const loaded = require(absolutePath);
    for (const exportName of contractModule.exports) {
      assert.notStrictEqual(loaded[exportName], undefined, `${contractModule.modulePath} missing export ${exportName}`);
    }
  }

  console.log('contracts-surface tests passed');
}

run();
