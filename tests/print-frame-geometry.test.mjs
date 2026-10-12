import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import postcss from 'postcss';

const root = process.cwd();
const requireFromTest = createRequire(import.meta.url);
const React = requireFromTest('react');
const { renderToStaticMarkup } = requireFromTest('react-dom/server');
const typescript = requireFromTest('typescript');

const frameTsx = readFileSync(resolve(root, 'src/components/cards/craft/print-frame.tsx'), 'utf8');
const frameCss = readFileSync(resolve(root, 'src/components/cards/craft/print-frame.module.css'), 'utf8');
const frameAst = postcss.parse(frameCss);
const cinematicTsx = readFileSync(resolve(root, 'src/components/cards/masters/cinematic-master.tsx'), 'utf8');
const cinematicCss = readFileSync(resolve(root, 'src/components/cards/masters/cinematic-master.module.css'), 'utf8');

const compiledFrame = typescript.transpileModule(frameTsx, {
  compilerOptions: {
    jsx: typescript.JsxEmit.ReactJSX,
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const frameModule = { exports: {} };
const cssNames = new Proxy({}, { get: (_target, property) => String(property) });
const frameRequire = (specifier) => {
  if (specifier === './print-frame.module.css') return { __esModule: true, default: cssNames };
  if (specifier === './engraving-mark') {
    return { EngravingMark: () => React.createElement('svg', { 'data-test-engraving': true }) };
  }
  return requireFromTest(specifier);
};

vm.runInNewContext(compiledFrame, {
  exports: frameModule.exports,
  module: frameModule,
  require: frameRequire,
});

const { PrintFrame } = frameModule.exports;

function declarations(selector, ast = frameAst) {
  const values = new Map();
  let found = false;
  ast.walkRules(candidate => {
    if (!candidate.selector.split(',').some(part => part.trim() === selector)) return;
    found = true;
    candidate.walkDecls(declaration => values.set(declaration.prop, declaration.value));
  });
  assert.ok(found, `expected CSS rule ${selector}`);
  return values;
}

test('PrintFrame opts into responsive geometry without changing legacy server markup', () => {
  const legacy = renderToStaticMarkup(React.createElement(PrintFrame, { family: 'cinematic' }));
  const card = renderToStaticMarkup(React.createElement(PrintFrame, { family: 'cinematic', geometry: 'card' }));

  assert.doesNotMatch(legacy, /data-frame-geometry/u);
  assert.match(card, /data-frame-geometry="card"/u);
  assert.match(card, /aria-hidden="true"/u);
  for (const corner of ['tl', 'tr', 'br', 'bl']) {
    assert.match(card, new RegExp(`class="corner ${corner}"`, 'u'));
  }
  for (const rail of ['innerTopRule', 'innerBottomRule', 'innerLeftRule', 'innerRightRule']) {
    assert.match(card, new RegExp(`class="${rail}"`, 'u'));
  }
});

test('card geometry uses one size-container short-side measure and joins both rails to the engraved corners', () => {
  const geometry = declarations(".frame[data-frame-geometry='card']");
  assert.equal(geometry.get('container-type'), 'size');
  for (const property of [
    '--frame-stroke', '--frame-inset', '--corner-size', '--corner-reach',
    '--inner-frame-stroke', '--inner-frame-inset', '--inner-corner-reach',
  ]) {
    assert.match(geometry.get(property) ?? '', /cqmin$/u, `${property} follows the shorter card dimension`);
  }
  assert.equal(geometry.get('font-size'), '1px', 'card geometry does not resolve CQ units on its own box');

  const cornerSize = Number.parseFloat(geometry.get('--corner-size'));
  const cornerReach = Number.parseFloat(geometry.get('--corner-reach'));
  const stroke = Number.parseFloat(geometry.get('--frame-stroke'));
  const innerFrameInset = Number.parseFloat(geometry.get('--inner-frame-inset'));
  const innerCornerReach = Number.parseFloat(geometry.get('--inner-corner-reach'));
  const innerFrameStroke = Number.parseFloat(geometry.get('--inner-frame-stroke'));
  const outerFrameInset = Number.parseFloat(geometry.get('--frame-inset'));
  const assertRatio = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, message);
  assertRatio(cornerReach / cornerSize, 45 / 64, 'the rails meet the outer SVG paths');
  assertRatio(stroke / cornerSize, 1 / 64, 'CSS rails and the one-unit SVG stroke share a width');
  assertRatio((innerFrameInset - outerFrameInset) / cornerSize, 5 / 64, 'the inner rule shares the SVG offset');
  assertRatio(innerCornerReach / cornerSize, 32 / 64, 'the inset SVG reach excludes its existing offset');
  assertRatio((innerFrameInset - outerFrameInset + innerCornerReach) / cornerSize, 37 / 64,
    'the inner rule meets the inset SVG endpoint');
  assertRatio(innerFrameStroke / cornerSize, 0.65 / 64, 'the inset rule shares the SVG stroke width');
  assert.equal(frameAst.nodes.some(node => node.type === 'rule' && /::before|::after/u.test(node.selector)), false,
    'frame rails are joined segments instead of overlapping pseudo-element rectangles');

  assert.equal(declarations('.topRule').get('height'), 'var(--frame-stroke)');
  assert.equal(declarations('.bottomRule').get('height'), 'var(--frame-stroke)');
  assert.equal(declarations('.leftRule').get('width'), 'var(--frame-stroke)');
  assert.equal(declarations('.rightRule').get('width'), 'var(--frame-stroke)');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .leftRule").get('display'), 'block');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .rightRule").get('display'), 'block');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .topRule").get('background'), 'currentColor');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .topMark").get('display'), 'none');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .innerTopRule").get('height'), 'var(--inner-frame-stroke)');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .innerBottomRule").get('height'), 'var(--inner-frame-stroke)');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .innerLeftRule").get('width'), 'var(--inner-frame-stroke)');
  assert.equal(declarations(".frame[data-frame-geometry='card'] .innerRightRule").get('width'), 'var(--inner-frame-stroke)');
  assert.equal(declarations('.corner').get('width'), 'var(--corner-size)');
  assert.equal(declarations('.corner').get('height'), 'var(--corner-size)');

  const cornerAnchors = {
    '.tl': ['top', 'left'],
    '.tr': ['top', 'right'],
    '.br': ['right', 'bottom'],
    '.bl': ['bottom', 'left'],
  };
  for (const [selector, edges] of Object.entries(cornerAnchors)) {
    const corner = declarations(selector);
    for (const edge of edges) assert.equal(corner.get(edge), 'var(--frame-inset)');
  }

  assert.equal(
    declarations(".frame[data-print-frame='cinematic'][data-frame-geometry='card'] .corner.br").get('display'),
    'block',
  );
  assert.equal(declarations(".frame[data-print-frame='cinematic'] .corner.br").get('display'), 'none');
  assert.equal(declarations(".frame[data-print-frame='cinematic'] .leftRule").get('display'), 'none');
});

test('cinematic opts into the shared frame without local duplicate rails or child-order selectors', () => {
  assert.match(cinematicTsx, /<PrintFrame family="cinematic" geometry="card"\s*\/>/u);

  const start = cinematicCss.indexOf('.frame {');
  const end = cinematicCss.indexOf('/* Square preserves', start);
  assert.ok(start >= 0 && end > start, 'the cinematic frame section remains a bounded block');
  const frameSection = cinematicCss.slice(start, end);
  assert.doesNotMatch(frameSection, /::before|::after|nth-of-type|--frame-inset|--corner-size|--corner-reach/u);
});
