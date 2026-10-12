import assert from 'node:assert/strict';
import test from 'node:test';
import { runBuild } from '../tools/build.mjs';

function captureBuild(env, statuses = [0, 0]) {
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
  assert.equal(calls.length, 2);
  assert.match(calls[0].args[0], /next[\\/]dist[\\/]bin[\\/]next$/);
  assert.equal(calls[0].args[1], 'build');
  assert.match(calls[1].args[0], /prune-cloudflare-assets\.mjs$/);
  assert.equal(calls[0].options.env.NEXT_PUBLIC_FFXIV_OFFICIAL_ASSETS_ENABLED, 'true');
  assert.strictEqual(calls[0].options.env, calls[1].options.env);
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

test('failed compilation stops packaging and a failed packager fails the release', () => {
  const compileFailure = captureBuild({}, [2]);
  assert.equal(compileFailure.code, 2);
  assert.equal(compileFailure.calls.length, 1);
  assert.equal(captureBuild({}, [0, 3]).code, 3);
  assert.equal(captureBuild({}, [null]).code, 1);
  assert.throws(() => runBuild({ env: {}, execute: () => ({ error: new Error('spawn failed') }) }), /spawn failed/);
});
