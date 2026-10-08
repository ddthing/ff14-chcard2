import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((!specifier.startsWith('./') && !specifier.startsWith('../')) || extname(specifier)) {
      return nextResolve(specifier, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const parentPath = fileURLToPath(context.parentURL);
      const candidate = `${resolvePath(dirname(parentPath), specifier)}.ts`;
      if (!existsSync(candidate)) throw error;
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  },
});

process.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED = 'false';

const { FFXIV_OFFICIAL_ASSETS_ENABLED, resolveJobIcon } = await import('../src/lib/ffxiv-assets/index.ts');

test('the feature flag leaves XIVAPI assets disabled by default and keeps generic fallback available', () => {
  assert.equal(FFXIV_OFFICIAL_ASSETS_ENABLED, false);
  for (const jobId of ['paladin', 'dark-knight', 'red-mage', 'beastmaster', null, undefined, '../paladin']) {
    assert.equal(resolveJobIcon({ jobId, usage: 'picker' }), null);
  }
});
