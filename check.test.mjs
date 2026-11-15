import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stages,stageProgress} from '../public/content.js';
import {readFileSync,existsSync} from 'node:fs';
test('all content and correct atlas indexes',()=>{
 assert.equal(stages.length,5);
 for(const stage of stages){
  assert.equal(stage.words.length,10);assert.equal(stage.sentences.length,5);
  assert.ok(existsSync(new URL('../public/assets/atlas-'+stage.atlas+'.webp',import.meta.url)));
  for(const row of stage.words)assert.ok(row.length===3&&row.every(v=>typeof v==='string'&&v.length));
  for(const row of stage.sentences)assert.ok(row.length===4&&row.slice(0,3).every(Boolean)&&row[3]>=0&&row[3]<10);
 }
});
test('completion requires every listening and recording activity',()=>{
 let events=[];
 for(const [kind,n] of [['listen_word',10],['record_word',10],['listen_sentence',5],['record_sentence',5]]){
  for(let item=0;item<n;item++)events.push({stage:0,kind,item});
 }
 assert.equal(stageProgress(events,0).score,30);
 assert.equal(stageProgress(events,0).done,true);
 events.push({...events[0]});
 assert.equal(stageProgress(events,0).score,30);
 assert.equal(stageProgress(events.filter(e=>e.kind!=='listen_sentence'),0).done,false);
 assert.equal(stageProgress(events,1).score,0);
});
test('private storage and restricted database access declared',()=>{
 const sql=readFileSync(new URL('./database.sql',import.meta.url),'utf8');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/'speaking-audio','speaking-audio',false/);
 assert.match(sql,/revoke all on function/);
});
