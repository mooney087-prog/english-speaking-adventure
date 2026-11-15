import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scryptSync} from 'node:crypto';
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
let student=null;
globalThis.__pinClient=()=>({from(table){
 if(table==='speaking_events')return {select:()=>({eq:async()=>({data:[],error:null})})};
 assert.equal(table,'speaking_students');
 return {
  insert:async data=>{student={id,...data};return {data:null,error:null};},
  select:()=>({eq:(key,value)=>({maybeSingle:async()=>({data:student?.[key]===value?student:null,error:null})})}),
  update:data=>({eq:async(key,value)=>{assert.equal(student[key],value);Object.assign(student,data);return {data:null,error:null};}})
 };
}});
const source=readFileSync(new URL('../netlify/functions/api.mjs',import.meta.url),'utf8').replace("import {createClient} from '@supabase/supabase-js';","const createClient=globalThis.__pinClient;");
const {handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test-only',TEACHER_PASSWORD:'unit-test-teacher-password',SESSION_SECRET:'unit-test-session-secret-long-enough'};
async function request(action,body={},token){return handler({httpMethod:'POST',headers:token?{authorization:'Bearer '+token}:{},queryStringParameters:{action},body:JSON.stringify(body)});}
test('teacher creates leading-zero PINs, resets only the hash, and legacy PINs still work',async()=>{
 const original={...process.env};Object.assign(process.env,env);
 try{
  const teacher=JSON.parse((await request('teacherLogin',{password:env.TEACHER_PASSWORD})).body).token;
  for(const pin of ['001','00001','abcd','12 3','๑๒๓๔'])assert.equal((await request('addStudent',{code:'P301',fullName:'Test Student',nickname:'Test',pin},teacher)).statusCode,400);
  const created=await request('addStudent',{code:'P301',fullName:'Test Student',nickname:'Test',pin:'0001'},teacher);
  assert.deepEqual(JSON.parse(created.body),{code:'P301',pin:'0001'});
  assert.ok(!student.pin_hash.includes('0001'));
  assert.equal((await request('login',{code:'P301',pin:'1'})).statusCode,401);
  const logged=await request('login',{code:'P301',pin:'0001'});assert.equal(logged.statusCode,200);
  const studentToken=JSON.parse(logged.body).token;
  assert.equal((await request('resetPin',{studentId:id,pin:'0002'},studentToken)).statusCode,403);
  assert.equal((await request('resetPin',{studentId:id,pin:'0002'})).statusCode,401);
  const before={...student};
  assert.equal((await request('resetPin',{studentId:id,pin:'0024'},teacher)).statusCode,200);
  const after={...student};delete before.pin_hash;delete after.pin_hash;assert.deepEqual(after,before);
  assert.equal((await request('login',{code:'P301',pin:'0001'})).statusCode,401);
  assert.equal((await request('login',{code:'P301',pin:'0024'})).statusCode,200);
  const salt='test-legacy-salt',legacy='abcdef123456';student.pin_hash=salt+':'+scryptSync(legacy,salt,32).toString('hex');
  assert.equal((await request('login',{code:'P301',pin:legacy})).statusCode,200);
 }finally{for(const key of Object.keys(env)){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});

test('teacher form suggests 0001 and 0024 as strings and shows PIN reset controls',async()=>{
 const vm=await import('node:vm');
 const text=readFileSync(new URL('../public/teacher.js',import.meta.url),'utf8');
 const snippet=text.slice(text.indexOf('function suggestedPin'),text.indexOf('async function detail'));
 for(const [count,expected] of [[0,'0001'],[23,'0024']]){
  const app={innerHTML:''};const roster=Array.from({length:count},(_,i)=>({id:String(i),code:'P3'+i,full_name:'Test',nickname:'Test'}));
  vm.runInNewContext(snippet+';render();',{app,roster,events:[],stages:[],escape:String});
  assert.ok(app.innerHTML.includes('value="'+expected+'"'));
  assert.match(app.innerHTML,/inputmode="numeric" pattern="\[0-9\]\{4\}"/);
  if(count)assert.match(app.innerHTML,/data-reset=/);
 }
});
