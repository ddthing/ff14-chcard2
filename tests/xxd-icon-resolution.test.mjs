import assert from 'node:assert/strict';
import test from 'node:test';
import {ICON_ALIASES, ICON_NODES} from '../src/components/icons/vendor/xxd-ui-kit/nodes.js';
import {resolveXxdIconName, resolveXxdIconNodes} from '../src/components/icons/resolve-xxd-icon.ts';

test('all direct XXD icon names resolve to their registered node arrays',()=>{
 for(const [name,nodes] of Object.entries(ICON_NODES)){
  assert.equal(resolveXxdIconName(name),name);
  assert.strictEqual(resolveXxdIconNodes(name),nodes);
 }
});

test('XXD aliases resolve to canonical names before node lookup',()=>{
 const entries=Object.entries(ICON_ALIASES);
 assert.ok(entries.length>0);
 for(const [alias,canonicalName] of entries){
  assert.ok(ICON_NODES[canonicalName],`missing canonical icon for ${alias}`);
  assert.equal(resolveXxdIconName(alias),canonicalName);
  assert.strictEqual(resolveXxdIconNodes(alias),ICON_NODES[canonicalName]);
 }
});

test('unknown runtime names do not reach the SVG renderer as undefined node data',()=>{
 assert.equal(resolveXxdIconName('not-an-xxd-icon'),undefined);
 assert.equal(resolveXxdIconNodes('not-an-xxd-icon'),undefined);
});
