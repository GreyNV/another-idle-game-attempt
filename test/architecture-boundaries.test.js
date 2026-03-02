const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const ENGINE_ROOT = path.join(REPO_ROOT, 'engine');
const LAYER_ROOT = path.join(ENGINE_ROOT, 'plugins', 'layers');
const UI_ROOT = path.join(ENGINE_ROOT, 'ui');

function collectJsFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function toPosixRelative(fullPath) {
  return path.relative(REPO_ROOT, fullPath).split(path.sep).join('/');
}

function indexToLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function locateViolations(filePath, regex) {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = [];

  for (const match of content.matchAll(regex)) {
    const matchText = match[0];
    const line = indexToLineNumber(content, match.index || 0);
    matches.push({
      file: toPosixRelative(filePath),
      line,
      pattern: matchText,
    });
  }

  return matches;
}

function formatViolation(ruleName, violation) {
  return [
    `[${ruleName}] ${violation.file}:${violation.line}`,
    `  matched: ${JSON.stringify(violation.pattern)}`,
  ].join('\n');
}

function collectLayerImportViolations() {
  const violations = [];
  const layerFiles = collectJsFiles(LAYER_ROOT).filter(
    (filePath) => path.basename(filePath) !== 'registerBuiltinLayers.js'
  );

  const forbiddenLayerImportRegex = /require\((['"])\.{1,2}\/(?:.*\/)?(?:[A-Z][\w-]*Layer)\1\)/g;

  for (const filePath of layerFiles) {
    const fileViolations = locateViolations(filePath, forbiddenLayerImportRegex);
    violations.push(...fileViolations);
  }

  return violations;
}

function collectUiMutationViolations() {
  const violations = [];
  const uiFiles = collectJsFiles(UI_ROOT);

  const forbiddenUiPatterns = [
    /\bstateStore\.(set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bthis\.stateStore\.(set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bcontext\.state\.(set|patch|replaceCanonical|setDerived)\s*\(/g,
    /require\((['"]).*systems\/state-store\/StateStore\1\)/g,
  ];

  for (const filePath of uiFiles) {
    for (const regex of forbiddenUiPatterns) {
      const fileViolations = locateViolations(filePath, regex);
      violations.push(...fileViolations);
    }
  }

  return violations;
}

function collectCrossLayerWriteViolations() {
  const violations = [];
  const layerFiles = collectJsFiles(LAYER_ROOT).filter(
    (filePath) => path.basename(filePath) !== 'registerBuiltinLayers.js'
  );

  const forbiddenCrossLayerWritePatterns = [
    /\b(?:this\.)?context\.state\.(?:set|patch)\s*\(\s*['"]layers\.[^'"]+['"]/g,
    /\bstateStore\.(?:set|patch)\s*\(\s*['"]layers\.[^'"]+['"]/g,
    /\bthis\.stateStore\.(?:set|patch)\s*\(\s*['"]layers\.[^'"]+['"]/g,
  ];

  for (const filePath of layerFiles) {
    for (const regex of forbiddenCrossLayerWritePatterns) {
      const fileViolations = locateViolations(filePath, regex);
      violations.push(...fileViolations);
    }
  }

  return violations;
}

function run() {
  const layerImportViolations = collectLayerImportViolations();
  const uiMutationViolations = collectUiMutationViolations();
  const crossLayerWriteViolations = collectCrossLayerWriteViolations();

  const diagnostics = [];

  for (const violation of layerImportViolations) {
    diagnostics.push(formatViolation('layer-import-boundary', violation));
  }

  for (const violation of uiMutationViolations) {
    diagnostics.push(formatViolation('ui-read-only-boundary', violation));
  }

  for (const violation of crossLayerWriteViolations) {
    diagnostics.push(formatViolation('cross-layer-write-boundary', violation));
  }

  assert.strictEqual(
    diagnostics.length,
    0,
    [
      'Architecture boundary violations found. Resolve offending imports/writes to preserve deterministic layer boundaries.',
      ...diagnostics,
    ].join('\n')
  );

  console.log('architecture-boundaries tests passed');
}

run();
