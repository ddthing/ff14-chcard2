import assert from 'node:assert/strict';
import test from 'node:test';
import { runBuild } from '../tools/build.mjs';

function captureBuild(env, statuses = [0, 0, 0, 0]) {
  const calls = [];
  const code = runBuild({ env, execute: (program, args, options) => {
    calls.push({ program, args, options });
    return { status: statuses[calls.length - 1] };
  } });
  return { calls, code };
}

test('a release build without local settings enables icons for both Next and its packager', () => {
  const input = { PATH: 'unchanged' };
  const { calls, code } = captureBuild(input);
  assert.equal(code, 0);
  assert.equal(calls.length, 4);
  assert.match(calls[0].args[1], /generate-font-registry\.mjs$/);
  assert.equal(calls[0].args[2], '--check');
  assert.match(calls[1].args[0], /generate-font-preview-css\.mjs$/);
  assert.equal(calls[1].args[1], '--check');
  assert.match(calls[2].args[0], /next[\\/]dist[\\/]bin[\\/]next$/);
  assert.equal(calls[2].args[1], 'build');
  assert.match(calls[3].args[0], /prune-cloudflare-assets\.mjs$/);
  assert.equal(calls[0].options.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED, 'true');
  assert.strictEqual(calls[0].options.env, calls[1].options.env);
  assert.strictEqual(calls[1].options.env, calls[2].options.env);
  assert.strictEqual(calls[2].options.env, calls[3].options.env);
  assert.equal(calls[0].options.env.PATH, 'unchanged');
  assert.equal(input.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED, undefined);
});

test('an explicit disabled flag reaches compilation and packaging unchanged', () => {
  for (const flag of ['false', '', 'invalid']) {
    const { calls, code } = captureBuild({ NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED: flag });
    assert.equal(code, 0);
    assert.ok(calls.every(call => call.options.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED === flag));
  }
});

test('failed font preflight or compilation stops packaging and a failed packager fails the release', () => {
  const preflightFailure = captureBuild({}, [4]);
  assert.equal(preflightFailure.code, 4);
  assert.equal(preflightFailure.calls.length, 1);
  const previewPreflightFailure = captureBuild({}, [0, 3]);
  assert.equal(previewPreflightFailure.code, 3);
  assert.equal(previewPreflightFailure.calls.length, 2);
  const compileFailure = captureBuild({}, [0, 0, 2]);
  assert.equal(compileFailure.code, 2);
  assert.equal(compileFailure.calls.length, 3);
  assert.equal(captureBuild({}, [0, 0, 0, 3]).code, 3);
  assert.equal(captureBuild({}, [null]).code, 1);
  assert.throws(() => runBuild({ env: {}, execute: () => ({ error: new Error('spawn failed') }) }), /spawn failed/);
});
