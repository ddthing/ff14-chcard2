import assert from 'node:assert/strict';
import test from 'node:test';
import {registerUploadCancellation,cancelPendingEditorUploads} from '../src/components/editor/upload-session.ts';

test('reset cancels a pending decode even when the card has no data change, and unmount drops its registration',()=>{
 const decode=new AbortController();
 const unregister=registerUploadCancellation(()=>decode.abort());
 cancelPendingEditorUploads();assert.equal(decode.signal.aborted,true);
 unregister();
 const next=new AbortController();
 const removeNext=registerUploadCancellation(()=>next.abort());
 removeNext();cancelPendingEditorUploads();assert.equal(next.signal.aborted,false);
});
