import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('sync waits for an in-flight send and drains newly queued work before returning',async()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function sync(){'),source.indexOf('\nfunction listen(){'));
 const queue=[{id:'first',studentId:'student-1',stage:0,kind:'listen_word',item:0}];
 const calls=[];let unblock,entered;
 const started=new Promise(resolve=>entered=resolve);
 const gate=new Promise(resolve=>unblock=resolve);
 const context={
  queueAll:async()=>[...queue],queueDelete:async id=>{queue.splice(queue.findIndex(q=>q.id===id),1);},
  api:async(action,payload)=>{calls.push(action+':'+(payload.item??''));if(calls.length===1){entered();await gate;}return {events:[],student:{id:'student-1'}};},
  merge:()=>{},persist:()=>{},updateSync:()=>{},document:{querySelector:()=>null}
 };
 vm.runInNewContext("let user={student:{id:'student-1'},token:'test'},syncing=null;"+fn+';this.runSync=sync;',context);
 const first=context.runSync();await started;
 queue.push({id:'second',studentId:'student-1',stage:0,kind:'listen_word',item:1});
 const waiter=context.runSync();assert.equal(first,waiter);
 unblock();await waiter;
 assert.equal(queue.length,0);assert.deepEqual(calls,['listen:0','listen:1','state:']);
});
