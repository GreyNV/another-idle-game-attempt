const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const CANONICAL_SHEET_PATH = path.join(REPO_ROOT, 'docs/agent-character-sheet.md');

const REQUIRED_HEADINGS = [
  '## Role',
  '## Preferred style',
  '## Technology stack assumptions',
  '## Non-negotiable architecture rules',
  '## Delivery checklist',
];

const REQUIRED_KEYWORDS = [
  'implementation-focused engine architect',
  'engine_blueprint_v_1.md',
  'layers[]',
  'No direct layer-to-layer calls',
  'UI never mutates state directly; UI emits intents',
  'deterministic',
];

function run() {
  assert.strictEqual(fs.existsSync(CANONICAL_SHEET_PATH), true, 'Missing docs/agent-character-sheet.md');

  const contents = fs.readFileSync(CANONICAL_SHEET_PATH, 'utf8');

  for (const heading of REQUIRED_HEADINGS) {
    assert.ok(contents.includes(heading), `Missing required heading: ${heading}`);
  }

  for (const keyword of REQUIRED_KEYWORDS) {
    assert.ok(contents.includes(keyword), `Missing required keyword: ${keyword}`);
  }

  console.log('doc-consistency tests passed');
}

run();
