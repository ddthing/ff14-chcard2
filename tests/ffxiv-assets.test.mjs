import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (!specifier.startsWith('./') && !specifier.startsWith('../')) ||
      extname(specifier)
    ) {
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

const { FFXIV_OFFICIAL_ASSETS_ENABLED } = await import(
  '../src/lib/ffxiv-assets/config.ts'
);
const { getOfficialJobIconAsset, getOfficialJobIconSrc } = await import(
  '../src/lib/ffxiv-assets/job-icons.ts'
);

test('official job asset adapter stays disabled and uses the fallback path by default', () => {
  assert.equal(FFXIV_OFFICIAL_ASSETS_ENABLED, false);
  assert.equal(getOfficialJobIconSrc('paladin'), null);
  assert.equal(getOfficialJobIconSrc('warrior'), null);
  assert.equal(getOfficialJobIconSrc(null), null);
  assert.equal(getOfficialJobIconSrc('../paladin'), null);
  assert.equal(getOfficialJobIconAsset('paladin'), null);
  assert.equal(getOfficialJobIconAsset('beastmaster'), null);
});
