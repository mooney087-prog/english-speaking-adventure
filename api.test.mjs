import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
let events=[],writes=[];
globalThis.__speakingTestClient=()=>({from(table){
 if(table!=='speaking_events')throw new Error('Unexpected database access: '+table);
 return {select:()=>({eq:async()=>({data:events,error:null})}),upsert:async(data)=>{writes.push(data);return {data:null,error:null};}};
}});
const source=readFileSync(new URL('../netlify/functions/api.mjs',import.meta.url),'utf8').replace("import {createClient} from '@supabase/supabase-js';","const createClient=globalThis.__speakingTestClient;");
const {handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const secret='unit-test-only-secret-that-is-not-for-deployment';
const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test-only',TEACHER_PASSWORD:'unit-test-teacher-password',SESSION_SECRET:secret};
function studentToken(){const value=Buffer.from(JSON.stringify({role:'student',id:'student-test',exp:Date.now()+60000})).toString('base64url');return value+'.'+createHmac('sha256',secret).update(value).digest('base64url');}
async function request(action,body={},token){return handler({httpMethod:'POST',headers:token?{authorization:'Bearer '+token}:{},queryStringParameters:{action},body:JSON.stringify(body)});}
test('API access controls and stage rules with a simulated database',async()=>{
 const original={...process.env};Object.assign(process.env,env);
 try{
  assert.equal((await request('teacherLogin',{password:'wrong'})).statusCode,401);
  const teacher=await request('teacherLogin',{password:env.TEACHER_PASSWORD});assert.equal(teacher.statusCode,200);assert.ok(JSON.parse(teacher.body).token);
  assert.equal((await request('roster')).statusCode,401);
  const token=studentToken();assert.equal((await request('roster',{},token)).statusCode,403);
  events=[];writes=[];
  assert.equal((await request('listen',{stage:1,kind:'listen_word',item:0},token)).statusCode,400);
  assert.equal((await request('upload',{stage:0,kind:'record_word',item:0},token)).statusCode,400);
  assert.equal((await request('listen',{stage:0,kind:'listen_word',item:10},token)).statusCode,400);
  assert.equal((await request('listen',{stage:0,kind:'listen_word',item:0},token)).statusCode,200);
  assert.deepEqual(writes,[{student_id:'student-test',stage:0,kind:'listen_word',item:0}]);
  events=Array.from({length:10},(_,item)=>({stage:0,kind:'listen_word',item}));
  assert.equal((await request('listen',{stage:0,kind:'listen_sentence',item:0},token)).statusCode,400);
  events.push(...Array.from({length:10},(_,item)=>({stage:0,kind:'record_word',item})));
  assert.equal((await request('listen',{stage:0,kind:'listen_sentence',item:0},token)).statusCode,200);
  assert.equal((await request('upload',{stage:0,kind:'record_sentence',item:0,id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',audio:'invalid',mime:'text/plain'},token)).statusCode,400);
  assert.equal((await request('certificate',{},token)).statusCode,400);
  delete process.env.SESSION_SECRET;assert.equal((await request('teacherLogin',{})).statusCode,503);
 }finally{for(const key of Object.keys(env)){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});
