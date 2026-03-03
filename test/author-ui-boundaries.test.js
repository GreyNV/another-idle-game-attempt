const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const AUTHOR_UI_ROOT = path.join(REPO_ROOT, 'apps', 'author-ui');

function collectSourceFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (/\.(cjs|js|jsx|mjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function toRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function indexToLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function collectMatches(content, regex) {
  return Array.from(content.matchAll(regex)).map((match) => ({
    text: match[0],
    line: indexToLineNumber(content, match.index || 0),
  }));
}

function formatViolation(rule, filePath, match) {
  return `[${rule}] ${toRepoPath(filePath)}:${match.line} => ${JSON.stringify(match.text)}`;
}

function run() {
  const files = collectSourceFiles(AUTHOR_UI_ROOT);
  const diagnostics = [];

  const forbiddenInternalEngineImport =
    /(?:import\s+[^'"\n]+\s+from\s+|require\()\s*['"][^'"]*engine\/(?:core|systems|plugins|validation|ui)(?:\/[^'"]*)?['"]/g;
  const engineImportWithoutFacade =
    /(?:import\s+[^'"\n]+\s+from\s+|require\()\s*['"][^'"]*engine(?:\/[^'"]*)?['"]/g;
  const directStateMutationPatterns = [
    /\bstateStore\.(?:set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bthis\.stateStore\.(?:set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bcontext\.state\.(?:set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bcanonicalState\s*\[[^\]]+\]\s*=/g,
    /\bcanonicalState\.[A-Za-z_$][\w$]*\s*=/g,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');

    for (const match of collectMatches(content, forbiddenInternalEngineImport)) {
      diagnostics.push(formatViolation('author-ui-forbidden-engine-internal-import', filePath, match));
    }

    for (const match of collectMatches(content, engineImportWithoutFacade)) {
      if (!content.includes('AuthoringFacade')) {
        diagnostics.push(formatViolation('author-ui-facade-only-communication', filePath, match));
      }
    }

    for (const pattern of directStateMutationPatterns) {
      for (const match of collectMatches(content, pattern)) {
        diagnostics.push(formatViolation('author-ui-state-mutation-boundary', filePath, match));
      }
    }
  }

  assert.strictEqual(
    diagnostics.length,
    0,
    ['Author UI boundary violations found.', ...diagnostics].join('\n')
  );

  console.log('author-ui-boundaries tests passed');
}

run();
