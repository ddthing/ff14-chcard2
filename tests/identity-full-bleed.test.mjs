import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import postcss from 'postcss';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require('typescript');

globalThis.__identityCreateElement = createElement;

function findModule(specifier, parentURL) {
  const base = specifier.startsWith('@/')
    ? resolve(root, 'src', specifier.slice(2))
    : resolve(dirname(fileURLToPath(parentURL)), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/image') return { url: 'identity-full-bleed:next-image', shortCircuit: true };
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const file = findModule(specifier, context.parentURL);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'identity-full-bleed:next-image') {
      return {
        format: 'module',
        source: 'export default function Image(props) { const { fill, unoptimized, priority, ...attributes } = props; return globalThis.__identityCreateElement("img", attributes); }',
        shortCircuit: true,
      };
    }

    if (url.startsWith('file:')) {
      const file = fileURLToPath(url);
      if (file.endsWith('.module.css')) {
        return {
          format: 'module',
          source: 'export default new Proxy({}, { get: (_target, key) => String(key) });',
          shortCircuit: true,
        };
      }
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        const source = readFileSync(file, 'utf8');
        const output = ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true,
          },
          fileName: file,
        }).outputText;
        return { format: 'module', source: output, shortCircuit: true };
      }
    }

    return nextLoad(url, context);
  },
});

const [{ IdentityMaster }, { getConerSample }] = await Promise.all([
  import('../src/components/cards/masters/identity-master.tsx'),
  import('../src/components/cards/types.ts'),
]);

const identityCss = readFileSync(resolve(root, 'src/components/cards/masters/identity-master.module.css'), 'utf8');
const identityAst = postcss.parse(identityCss);
const printFrameCss = readFileSync(resolve(root, 'src/components/cards/craft/print-frame.module.css'), 'utf8');
const identityTsx = readFileSync(resolve(root, 'src/components/cards/masters/identity-master.tsx'), 'utf8');
const presentationTsx = readFileSync(resolve(root, 'src/components/cards/card-presentation.tsx'), 'utf8');
const photoCss = readFileSync(resolve(root, 'src/components/cards/CardPhoto.module.css'), 'utf8');

function declarationsFor(selector) {
  let declarations = null;
  identityAst.walkRules((rule) => {
    if (rule.selector !== selector) return;
    declarations = new Map();
    rule.walkDecls((declaration) => declarations.set(declaration.prop, declaration.value));
  });
  return declarations;
}

function resolvedCanvasProperty(ratio, property) {
  const base = declarationsFor('.canvas');
  assert.ok(base, 'base canvas rule exists');
  const ratioDeclarations = declarationsFor(`.canvas[data-ratio='${ratio}']`);
  return ratioDeclarations?.get(property) ?? base.get(property);
}

function assertGeometry(ratio, expected) {
  assert.deepEqual({
    photoLeft: resolvedCanvasProperty(ratio, '--identity-photo-left'),
    photoTop: resolvedCanvasProperty(ratio, '--identity-photo-top'),
    photoWidth: resolvedCanvasProperty(ratio, '--identity-photo-width'),
    photoHeight: resolvedCanvasProperty(ratio, '--identity-photo-height'),
    paperTop: resolvedCanvasProperty(ratio, '--identity-paper-top'),
    paperLeft: resolvedCanvasProperty(ratio, '--identity-paper-left'),
    paperRight: resolvedCanvasProperty(ratio, '--identity-paper-right'),
    paperBottom: resolvedCanvasProperty(ratio, '--identity-paper-bottom'),
  }, expected, `${ratio} resolved photo and paper geometry`);
}

test('Adventurer Record photo and paper meet without an outer photo inset at all five ratios', () => {
  const photo = declarationsFor('.photo');
  const paper = declarationsFor('.paper');
  const stock = declarationsFor('.stock');
  assert.equal(photo?.get('left'), 'var(--identity-photo-left)');
  assert.equal(photo?.get('top'), 'var(--identity-photo-top)');
  assert.equal(photo?.get('width'), 'var(--identity-photo-width)');
  assert.equal(photo?.get('height'), 'var(--identity-photo-height)');
  assert.equal(paper?.get('top'), 'var(--identity-paper-top)');
  assert.equal(paper?.get('left'), 'var(--identity-paper-left)');
  assert.equal(paper?.get('right'), 'var(--identity-paper-right)');
  assert.equal(paper?.get('bottom'), 'var(--identity-paper-bottom)');
  assert.equal(stock?.get('top'), 'var(--identity-paper-top)');
  assert.equal(stock?.get('left'), 'var(--identity-paper-left)');
  assert.equal(stock?.get('right'), 'var(--identity-paper-right)');
  assert.equal(stock?.get('bottom'), 'var(--identity-paper-bottom)');

  const portrait = (height) => ({
    photoLeft: '0%', photoTop: '0%', photoWidth: '100%', photoHeight: height,
    paperTop: height, paperLeft: '0%', paperRight: '0%', paperBottom: '0%',
  });
  assertGeometry('4:5', portrait('58.2%'));
  assertGeometry('1:1', portrait('50.8%'));
  assertGeometry('3:4', portrait('60.6%'));
  assertGeometry('9:16', portrait('64.9%'));
  assertGeometry('16:9', {
    photoLeft: '0%', photoTop: '0%', photoWidth: '45%', photoHeight: '100%',
    paperTop: '0%', paperLeft: '45%', paperRight: '0%', paperBottom: '0%',
  });

  assert.deepEqual(Object.fromEntries(declarationsFor(".canvas[data-ratio='16:9'] .seamDivider")), {
    top: '50%',
    left: '45%',
    transform: 'translate(-50%, -50%) rotate(90deg)',
  }, 'landscape seam engraving is centered and vertical on the portrait/paper boundary');
});

test('the card edge frame uses shared card geometry with all rails and corners available', () => {
  assert.match(identityTsx, /<PrintFrame family="id-card" geometry="card"\s*\/>/);
  assert.match(identityCss, /\.frame\s*\{[^}]*z-index:\s*10/s);
  assert.doesNotMatch(identityCss, /\.frame::(?:before|after)/);
  assert.doesNotMatch(identityCss, /\.frame\s+:global\(\[data-print-frame=/);
  assert.doesNotMatch(identityCss, /nth-of-type\s*\(/);

  const frameSurface = printFrameCss.match(/\.frame\[data-frame-geometry='card'\]\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(frameSurface, /container-type:\s*size/);
  assert.match(printFrameCss, /\.frame\[data-print-frame='id-card'\]\s*\{[^}]*opacity:/s);
});

test('an absent portrait keeps the fullbleed photo layer and canonical crop handling', () => {
  const data = getConerSample('id-card', '4:5');
  data.imageUrl = '';
  const markup = renderToStaticMarkup(createElement(IdentityMaster, { data, locale: 'en', ratio: '4:5' }));
  assert.match(markup, /<div class="photo photo"><\/div>/);
  assert.match(markup, /data-print-frame="id-card" data-frame-geometry="card"/);
  assert.equal((markup.match(/class="corner /g) ?? []).length, 4);

  assert.match(identityTsx, /<ArtPhoto data=\{data\} locale=\{locale\} className=\{styles\.photo\} \/>/);
  assert.match(presentationTsx, /data\.imageUrl\s*&&\s*<PhotoPrintImage/);
  assert.match(photoCss, /object-position:\s*var\(--card-image-position\)/);
  assert.match(photoCss, /transform:\s*scale\(var\(--card-image-scale\)\) rotate\(var\(--card-image-rotation\)\)/);
  assert.match(photoCss, /transform-origin:\s*center/);
  assert.doesNotMatch(identityCss, /\.photo\s*\{[^}]*transform\s*:/s);
});
