import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
register('./ts-alias-loader.mjs', import.meta.url);
const { preserveCardLocalSvgClip } = await import('../src/lib/card-export/index.ts');

test('export keeps a card instance SVG clip reference local to the serialized clone', () => {
  const styles = new Map();
  const node = { nodeType: 1, getAttribute: name => name === 'data-card-local-clip' ? 'editorial-brush-R2' : null, style: { setProperty: (name, value) => styles.set(name, value) } };
  preserveCardLocalSvgClip(node);
  assert.equal(styles.get('clip-path'), 'url("#editorial-brush-R2")');
  assert.equal(styles.get('-webkit-clip-path'), 'url("#editorial-brush-R2")');
});

test('SVG clip serialization leaves unrelated nodes and unsafe references unchanged', () => {
  for (const id of [null, '', 'https://example.test/clip.svg#clip', 'clip")']) {
    let writes = 0;
    preserveCardLocalSvgClip({ nodeType: 1, getAttribute: () => id, style: { setProperty: () => writes++ } });
    assert.equal(writes, 0);
  }
  preserveCardLocalSvgClip({ nodeType: 3 });
});
