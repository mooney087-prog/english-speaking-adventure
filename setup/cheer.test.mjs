import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('the mascot speaks once in British English and handles unavailable voices',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function celebrationVoice(){'),source.indexOf('async function updateSync'));
 const spoken=[],stop={},hint={};let cancelled=0;
 const british={lang:'en-GB'};
 const context={view:1,document:{querySelector:s=>s==='#cheer-status'?hint:stop},window:{SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{getVoices:()=>[{lang:'th-TH'},british],cancel:()=>cancelled++,speak:u=>spoken.push(u)}}};
 vm.runInNewContext(fn+';celebrationVoice();',context);
 assert.equal(spoken.length,1);assert.equal(cancelled,1);
 assert.equal(spoken[0].text,'Well done! You did it! Keep going!');assert.equal(spoken[0].lang,'en-GB');assert.equal(spoken[0].voice,british);
 spoken[0].onend();assert.equal(stop.disabled,true);assert.equal(spoken.length,1);
 context.window={};vm.runInNewContext('celebrationVoice();',context);
 assert.equal(stop.hidden,true);assert.match(hint.textContent,/Well done/);
});
