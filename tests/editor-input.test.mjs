import assert from 'node:assert/strict';
import test from 'node:test';
import {isImeComposing, committedLevel, validLevelInput} from '../src/components/editor/editor-input.ts';
import {resolveEditorKeyboardAction} from '../src/components/editor/editor-keyboard.ts';

test('IME confirmation and cancellation do not invoke picker/canvas shortcuts',()=>{
 for(const status of [{isComposing:true},{keyCode:229}]){
  assert.equal(isImeComposing(status),true);
  for(const key of ['Enter','Escape','+','-','0','z'])assert.equal(resolveEditorKeyboardAction({key,ctrlKey:key==='z',...status}),null);
 }
 assert.equal(isImeComposing({isComposing:false,keyCode:13}),false);
});
test('level editing can be temporarily empty without writing an invalid canonical level',()=>{
 for(const value of ['', '-', 'NaN','101','0','1.5'])assert.equal(validLevelInput(value),false);
 assert.equal(committedLevel('',100),100);assert.equal(committedLevel('NaN',32),32);
 assert.equal(committedLevel('180',10),100);assert.equal(committedLevel('-1',10),1);
 assert.equal(committedLevel('1.5',10),2);assert.equal(validLevelInput('42'),true);
});
