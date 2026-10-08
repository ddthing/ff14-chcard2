import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const identityStyles = await readFile(
  resolvePath(root, 'src/components/cards/masters/identity-master.module.css'),
  'utf8',
);

function declarationFor(selector, property) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = identityStyles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(block, `missing CSS rule for ${selector}`);
  const declaration = block[1].match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`));
  return declaration?.[1].trim();
}

test('Adventurer Record ribbon stays at the card top and above the frame at every ratio', () => {
  assert.equal(declarationFor('.canvas', '--identity-ribbon-top'), '0%');
  assert.equal(declarationFor('.masthead', 'top'), 'var(--identity-ribbon-top)');

  const frameZIndex = Number(declarationFor('.frame', 'z-index'));
  const ribbonZIndex = Number(declarationFor('.masthead', 'z-index'));
  assert.ok(ribbonZIndex > frameZIndex, 'ribbon must layer above all frame decorations');

  for (const ratio of ['1:1', '4:5', '3:4', '9:16', '16:9']) {
    const escapedRatio = ratio.replace(':', '\\:');
    const ratioRule = identityStyles.match(
      new RegExp(`\\.canvas\\[data-ratio='${escapedRatio}'\\]\\s*\\{([^}]*)\\}`),
    )?.[1] ?? '';
    assert.doesNotMatch(ratioRule, /--identity-ribbon-top\s*:/, `${ratio} must not shift the ribbon down`);
  }
});
