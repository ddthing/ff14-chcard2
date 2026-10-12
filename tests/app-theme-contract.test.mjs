import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import postcss from 'postcss';

const root = new URL('../', import.meta.url);
const roles = new Map([
  ['--app-bg', '--background'],
  ['--app-surface', '--card'],
  ['--app-surface-raised', '--popover'],
  ['--app-workspace', '--muted'],
  ['--app-control', '--card'],
  ['--app-control-hover', '--accent'],
  ['--app-border', '--border'],
  ['--app-border-strong', '--input'],
  ['--app-text', '--foreground'],
  ['--app-text-muted', '--muted-foreground'],
  ['--app-text-subtle', '--muted-foreground'],
  ['--app-accent', '--primary'],
  ['--app-on-accent', '--primary-foreground'],
  ['--app-accent-soft', '--accent'],
  ['--app-focus', '--ring'],
  ['--app-header', '--card'],
  ['--app-error', '--destructive'],
  ['--app-error-surface', '--muted'],
  ['--app-success', '--foreground'],
  ['--app-success-surface', '--muted'],
]);

function checkAdapter(css, preset) {
  const theme = postcss.parse(preset);
  const modes = new Map();
  theme.walkRules(rule => {
    if (rule.selector !== ':root' && rule.selector !== '.dark') return;
    modes.set(rule.selector, new Set(rule.nodes.filter(n => n.type === 'decl').map(n => n.prop)));
  });
  const adapter = postcss.parse(css);
  for (const mode of ['light', 'dark']) {
    const declarations = new Map();
    adapter.walkRules(rule => {
      if (!rule.selectors.includes(`html[data-app-theme='${mode}']`)) return;
      rule.walkDecls(decl => declarations.set(decl.prop, decl.value.trim()));
    });
    for (const [role, token] of roles) {
      assert.equal(declarations.get(role), `var(${token})`, `${mode}: ${role} must use its preset role directly`);
      assert.ok(modes.get(mode === 'light' ? ':root' : '.dark')?.has(token), `${token} exists in the installed ${mode} preset`);
    }
  }
}

test('app roles use the installed preset directly in both appearance modes', () => {
  checkAdapter(readFileSync(new URL('src/app/app-theme.css', root), 'utf8'), readFileSync(new URL('src/app/shadcn-theme.css', root), 'utf8'));
});

test('installed preset matches the canonical design record', () => {
  const design = readFileSync(new URL('DESIGN.md', root), 'utf8');
  const recordedHash = design.match(/원본 SHA-256\s*\|\s*`([A-Fa-f0-9]{64})`/u)?.[1];
  assert.ok(recordedHash, 'DESIGN.md records the installed preset fingerprint');
  const preset = readFileSync(new URL('src/app/shadcn-theme.css', root));
  assert.equal(createHash('sha256').update(preset).digest('hex'), recordedHash.toLowerCase(), 'reapplying the user-selected preset requires updating the design contract');
});

test('theme guard rejects mixed, hard-coded, and semantically redirected aliases', () => {
  const css = readFileSync(new URL('src/app/app-theme.css', root), 'utf8');
  const preset = readFileSync(new URL('src/app/shadcn-theme.css', root), 'utf8');
  for (const value of ['#706458', 'color-mix(in oklch, var(--foreground) 10%, var(--muted-foreground))', 'var(--destructive)']) {
    assert.throws(() => checkAdapter(css.replace('--app-text-muted: var(--muted-foreground)', `--app-text-muted: ${value}`), preset));
  }
});

test('component styles cannot redefine app color roles outside the adapter or card isolation boundary', () => {
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.css') && !file.endsWith('app-theme.css') && !file.endsWith('card-render-scope.module.css')) {
        postcss.parse(readFileSync(file, 'utf8')).walkDecls(decl => {
          assert.ok(!roles.has(decl.prop), `${file}: ${decl.prop} would override the shared preset contract`);
        });
      }
    }
  }
  visit(fileURLToPath(new URL('src/', root)));
});
