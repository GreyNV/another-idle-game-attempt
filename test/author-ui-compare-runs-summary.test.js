const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadSimulationModel() {
  const filePath = path.join(__dirname, '..', 'apps', 'author-ui', 'src', 'simulation', 'model.js');
  return import(pathToFileURL(filePath).href);
}

async function run() {
  const { summarizeDiff, formatCompareSummary } = await loadSimulationModel();

  const equalSummary = summarizeDiff({ equal: true, changes: [] });
  assert.strictEqual(formatCompareSummary(equalSummary), 'No snapshot differences.');

  const changedSummary = summarizeDiff({
    equal: false,
    truncated: true,
    changes: [
      { op: 'add', path: '/a' },
      { op: 'remove', path: '/b' },
      { op: 'replace', path: '/c' },
      { op: 'replace', path: '/d' },
    ],
  });

  assert.strictEqual(changedSummary.total, 4);
  assert.strictEqual(changedSummary.added, 1);
  assert.strictEqual(changedSummary.removed, 1);
  assert.strictEqual(changedSummary.replaced, 2);
  assert.strictEqual(
    formatCompareSummary(changedSummary),
    'Differences: 4 (truncated). add=1, remove=1, replace=2'
  );

  console.log('author-ui-compare-runs-summary tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
