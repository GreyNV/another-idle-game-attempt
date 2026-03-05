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
  const allowedMetadataContractImports = [/engine\/index\.mjs['"]/];
  const facadeRequiredModules = new Set(['apps/author-ui/server/index.cjs']);
  const builderToLegacyEditorImport = /(?:import\s+[^'"\n]+\s+from\s+|require\()\s*['"][^'"]*\/editor\/[^'"]*['"]/g;
  const directStateMutationPatterns = [
    /\bstateStore\.(?:set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bthis\.stateStore\.(?:set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bcontext\.state\.(?:set|patch|replaceCanonical|setDerived)\s*\(/g,
    /\bcanonicalState\s*\[[^\]]+\]\s*=/g,
    /\bcanonicalState\.[A-Za-z_$][\w$]*\s*=/g,
  ];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const repoPath = toRepoPath(filePath);

    for (const match of collectMatches(content, forbiddenInternalEngineImport)) {
      diagnostics.push(formatViolation('author-ui-forbidden-engine-internal-import', filePath, match));
    }

    for (const match of collectMatches(content, engineImportWithoutFacade)) {
      const isMetadataContractImport = allowedMetadataContractImports.some((pattern) =>
        pattern.test(match.text)
      );
      const requiresFacade = facadeRequiredModules.has(repoPath);

      if (requiresFacade && !content.includes('AuthoringFacade')) {
        diagnostics.push(formatViolation('author-ui-facade-required-for-server-modules', filePath, match));
      }

      if (!requiresFacade && !isMetadataContractImport) {
        diagnostics.push(formatViolation('author-ui-ui-modules-metadata-contracts-only', filePath, match));
      }
    }

    if (repoPath.startsWith('apps/author-ui/src/builder/')) {
      for (const match of collectMatches(content, builderToLegacyEditorImport)) {
        diagnostics.push(formatViolation('author-ui-builder-legacy-editor-coupling', filePath, match));
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

  const metadataModulePath = path.join(
    REPO_ROOT,
    'apps',
    'author-ui',
    'src',
    'editor',
    'metadata.js'
  );
  const metadataModuleContent = fs.readFileSync(metadataModulePath, 'utf8');
  const metadataEngineImports = collectMatches(metadataModuleContent, engineImportWithoutFacade);

  assert.ok(
    metadataEngineImports.length > 0,
    'Expected metadata module to import engine metadata contract.'
  );
  assert.ok(
    metadataEngineImports.every((match) =>
      allowedMetadataContractImports.some((pattern) => pattern.test(match.text))
    ),
    'metadata.js should be allowed to use metadata contract imports without AuthoringFacade.'
  );
  assert.ok(
    !metadataModuleContent.includes('AuthoringFacade'),
    'metadata.js must not depend on AuthoringFacade.'
  );

  console.log('author-ui-boundaries tests passed');
}

run();
