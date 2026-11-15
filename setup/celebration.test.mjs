import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('part completion renders the automatic mascot and removes the Play requirement',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const render=source.slice(source.indexOf('function render(){'),source.indexOf('async function updateSync'));
 const app={innerHTML:''};let onEnd,finished=false,hidden=false;
 const context={app,page:'celebrate',user:{preview:true,student:{nickname:'Explorer'}},escape:s=>s,lastError:'Part complete',updateSync:()=>{},
  document:{querySelector:selector=>selector==='.mascot-runner'?{addEventListener:(event,callback)=>{assert.equal(event,'animationend');onEnd=callback;}}:selector==='.celebrate'?{classList:{add:name=>finished=name==='is-finished'}}:{set hidden(value){hidden=value;}}}
 };
 vm.runInNewContext(render+';render();',context);
 assert.match(app.innerHTML,/mascot-runner/);assert.match(app.innerHTML,/Pause animation/);
 assert.doesNotMatch(app.innerHTML,/Play celebration beat|data-action="beat"/);
 assert.ok(onEnd);onEnd();assert.equal(finished,true);assert.equal(hidden,true);
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(css,/animation:mascot-run 3s ease-in-out 2/);
 assert.match(css,/animation:mascot-jump .5s ease-in-out 12/);
 assert.match(css,/animation-play-state:paused/);
});
