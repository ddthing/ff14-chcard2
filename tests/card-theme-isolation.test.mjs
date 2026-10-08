import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function collectSourceFiles(relativeDirectory) {
  const absoluteDirectory = join(repositoryRoot, relativeDirectory);
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:css|tsx?|mjs)$/u.test(entry.name)) files.push(path);
    }
  }

  visit(absoluteDirectory);
  return files;
}

test('card render roots freeze only the inherited browser context already used by the artwork', () => {
  const component = readFileSync(new URL('../src/components/cards/AdventurerCards.tsx', import.meta.url), 'utf8');
  const scope = readFileSync(new URL('../src/components/cards/card-render-scope.module.css', import.meta.url), 'utf8');

  assert.match(component, /renderScopeStyles\.root/u);
  assert.match(component, /data-card-render-scope="true"/u);
  assert.equal((component.match(/<article\s/gu) ?? []).length, 1, 'all three card families share the scoped CardRoot');

  const block = scope.match(/\.root\s*\{([\s\S]*?)\}/u)?.[1];
  assert.ok(block, 'the render-scope rule exists');
  const declarations = new Map([...block.matchAll(/^\s*([\w-]+)\s*:\s*([^;]+);/gmu)]
    .map((match) => [match[1], match[2].trim()]));
  const expectedAmbientProperties = new Set();
  for (const path of collectSourceFiles('src')) {
    if (!path.endsWith('.css')) continue;
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/^\s*(--(?:app-|editor-|theme-|surface-|text-|border-)[\w-]+)\s*:/gmu)) {
      expectedAmbientProperties.add(match[1]);
    }
  }

  const resetProperties = new Map([...declarations].filter(([name]) => name.startsWith('--')));
  assert.deepEqual([...resetProperties.keys()].sort(), [...expectedAmbientProperties].sort());
  assert.ok([...resetProperties.values()].every((value) => value === 'initial'));
  assert.deepEqual(Object.fromEntries([...declarations].filter(([name]) => !name.startsWith('--'))), {
    'color-scheme': 'dark',
    'font-synthesis': 'none',
    'text-rendering': 'optimizeLegibility',
    '-webkit-font-smoothing': 'antialiased',
    '-moz-osx-font-smoothing': 'grayscale',
  });
});

test('card and bitmap-export source has no direct App Theme token dependency', () => {
  const files = [
    ...collectSourceFiles('src/components/cards'),
    ...collectSourceFiles('src/lib/card-export'),
  ];
  const tokenReference = /var\(\s*--(?:app|editor|theme|surface|text|border)-[\w-]+/u;
  const references = files.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(new RegExp(tokenReference.source, 'gu'))]
      .map((match) => `${path}: ${match[0]}`);
  });

  assert.deepEqual(references, []);
});

