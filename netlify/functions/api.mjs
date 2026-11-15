import {createClient} from '@supabase/supabase-js';
import {createHmac,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
const json=(status,value)=>({statusCode:status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(value)});
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function sign(payload,secret){const value=Buffer.from(JSON.stringify({...payload,exp:Date.now()+86400000*30})).toString('base64url');return value+'.'+createHmac('sha256',secret).update(value).digest('base64url');}
function auth(event,secret){
 const token=event.headers.authorization?.replace(/^Bearer /,'')||'';
 const [value,mac]=token.split('.');
 if(!value||!mac||!equal(mac,createHmac('sha256',secret).update(value).digest('base64url')))fail('Please sign in again.',401);
 let user;try{user=JSON.parse(Buffer.from(value,'base64url').toString());}catch{fail('Please sign in again.',401);}
 if(!user.exp||user.exp<Date.now())fail('Please sign in again.',401);
 return user;
}
function checked(result){if(result.error)fail('The server could not save or load the data. Please try again.',503);return result.data;}
async function allRows(page){const rows=[];for(let offset=0;;offset+=1000){const part=checked(await page(offset));rows.push(...part);if(part.length<1000)return rows;}}
const eventsFor=async(db,id)=>checked(await db.from('speaking_events').select('stage,kind,item').eq('student_id',id));
function validItem(body){
 const {stage,kind,item}=body;
 if(!Number.isInteger(stage)||stage<0||stage>4||!['listen_word','listen_sentence','record_word','record_sentence'].includes(kind)||!Number.isInteger(item)||item<0||item>=(kind.endsWith('word')?10:5))fail('Invalid activity.');
}
function stageDone(events,stage){return events.filter(e=>e.stage===stage).length===30;}
function checkAccess(events,body){
 validItem(body);
 if(body.stage>0&&!stageDone(events,body.stage-1))fail('Finish the previous level first.');
 const level=events.filter(e=>e.stage===body.stage);
 if(body.kind!=='listen_word'&&level.filter(e=>e.kind==='listen_word').length<10)fail('Listen to all ten words first.');
 if(body.kind.endsWith('sentence')&&level.filter(e=>e.kind==='record_word').length<10)fail('Save all ten word recordings first.');
}
export async function handler(event){
 if(event.httpMethod!=='POST')return json(405,{error:'Use POST.'});
 const {SUPABASE_URL,TEACHER_PASSWORD,SESSION_SECRET}=process.env;
 const serverKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!SUPABASE_URL||!serverKey||!TEACHER_PASSWORD||TEACHER_PASSWORD.length<16||!SESSION_SECRET||SESSION_SECRET.length<32)return json(503,{error:'Server setup is incomplete. Ask your teacher to complete the setup guide.'});
 if((event.body||'').length>3000000)return json(413,{error:'Recording is too large. Please record a shorter answer.'});
 const db=createClient(SUPABASE_URL,serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  let body;try{body=JSON.parse(event.body||'{}');}catch{fail('Invalid request.');}
  const action=event.queryStringParameters?.action;
  if(action==='teacherLogin'){
   if(typeof body.password!=='string'||!equal(body.password,TEACHER_PASSWORD))fail('Incorrect password.',401);
   // Teacher tokens expire after eight hours.
   const token=sign({role:'teacher',teacherExpires:Date.now()+8*3600000},SESSION_SECRET);
   return json(200,{token});
  }
  if(action==='login'){
   if(typeof body.code!=='string'||typeof body.pin!=='string'||body.pin.length>100)fail('Enter your code and PIN.');
   const student=checked(await db.from('speaking_students').select('*').eq('code',body.code.trim().toUpperCase()).maybeSingle());
   if(!student)fail('Check your code and PIN.',401);
   const [salt,hash]=student.pin_hash.split(':');
   if(!equal(scryptSync(body.pin,salt,32).toString('hex'),hash))fail('Check your code and PIN.',401);
   const full_name=String(body.fullName||student.full_name).trim().slice(0,100);
   const nickname=String(body.nickname||student.nickname).trim().slice(0,30);
   if(!full_name||!nickname)fail('Please enter your name and nickname.');
   checked(await db.from('speaking_students').update({full_name,nickname,last_seen:new Date().toISOString()}).eq('id',student.id));
   return json(200,{token:sign({role:'student',id:student.id},SESSION_SECRET),student:{id:student.id,full_name,nickname},events:await eventsFor(db,student.id)});
  }
  const user=auth(event,SESSION_SECRET);
  const teacher=user.role==='teacher'&&user.teacherExpires>Date.now();
  if(['roster','addStudent','resetPin','detail','audio'].includes(action)){
   if(!teacher)fail('Teacher sign-in required.',403);
   if(action==='roster'){
    const students=await allRows(offset=>db.from('speaking_students').select('id,code,full_name,nickname,last_seen,completed_at,certificate_at').order('code').range(offset,offset+999));
    const events=await allRows(offset=>db.from('speaking_events').select('student_id,stage,kind,item').order('student_id').order('stage').order('kind').order('item').range(offset,offset+999));
    return json(200,{students,events});
   }
   if(action==='addStudent'){
    const code=String(body.code||'').trim().toUpperCase();
    const full_name=String(body.fullName||'').trim().slice(0,100),nickname=String(body.nickname||'').trim().slice(0,30);
    if(!/^[A-Z0-9-]{2,20}$/.test(code)||!full_name||!nickname)fail('Use a code with 2–20 English letters/numbers, plus a name and nickname.');
    const pin=String(body.pin??'');
    if(!/^[0-9]{4}$/.test(pin))fail('กรุณาระบุ PIN เป็นตัวเลข 4 หลัก เช่น 0001');
    const salt=randomBytes(16).toString('hex');
    const pin_hash=salt+':'+scryptSync(pin,salt,32).toString('hex');
    const result=await db.from('speaking_students').insert({code,full_name,nickname,pin_hash});
    if(result.error?.code==='23505')fail('This student code already exists.');
    checked(result);
    return json(200,{code,pin});
   }
   if(action==='resetPin'){
    const pin=String(body.pin??'');
    if(!/^[0-9]{4}$/.test(pin))fail('กรุณาระบุ PIN เป็นตัวเลข 4 หลัก เช่น 0001');
    if(!/^[0-9a-f-]{36}$/.test(body.studentId||''))fail('Invalid student.');
    const student=checked(await db.from('speaking_students').select('id,code').eq('id',body.studentId).maybeSingle());
    if(!student)fail('ไม่พบนักเรียนคนนี้',404);
    const salt=randomBytes(16).toString('hex');
    const pin_hash=salt+':'+scryptSync(pin,salt,32).toString('hex');
    checked(await db.from('speaking_students').update({pin_hash}).eq('id',student.id));
    return json(200,{code:student.code,pin});
   }
   if(action==='detail'){
    const recordings=await allRows(offset=>db.from('speaking_recordings').select('id,stage,kind,item,created_at').eq('student_id',body.studentId).order('created_at').order('id').range(offset,offset+999));
    return json(200,{recordings});
   }
   const recording=checked(await db.from('speaking_recordings').select('object_path').eq('id',body.recordingId).single());
   const signed=checked(await db.storage.from('speaking-audio').createSignedUrl(recording.object_path,300));
   return json(200,{url:signed.signedUrl});
  }
  if(user.role!=='student')fail('Student sign-in required.',403);
  const id=user.id;
  if(action==='state'){
   const student=checked(await db.from('speaking_students').select('id,full_name,nickname,completed_at,certificate_at').eq('id',id).single());
   return json(200,{student,events:await eventsFor(db,id)});
  }
  if(action==='listen'){
   if(!['listen_word','listen_sentence'].includes(body.kind))fail('Invalid listening activity.');
   checkAccess(await eventsFor(db,id),body);
   checked(await db.from('speaking_events').upsert({student_id:id,stage:body.stage,kind:body.kind,item:body.item},{onConflict:'student_id,stage,kind,item',ignoreDuplicates:true}));
   return json(200,{saved:true});
  }
  if(action==='upload'){
   if(!['record_word','record_sentence'].includes(body.kind))fail('Invalid recording activity.');
   checkAccess(await eventsFor(db,id),body);
   if(!/^[0-9a-f-]{36}$/.test(body.id||'')||typeof body.audio!=='string')fail('Invalid recording.');
   const mime=String(body.mime||'').split(';')[0];
   const extension={'audio/webm':'webm','audio/mp4':'m4a','audio/ogg':'ogg','audio/wav':'wav','audio/x-m4a':'m4a'}[mime];
   if(!extension)fail('This recording format is not supported.');
   const bytes=Buffer.from(body.audio,'base64');
   if(bytes.length<100||bytes.length>2097152)fail('Please record a short answer (maximum 2 MB).');
   const path=id+'/'+body.id+'.'+extension;
   checked(await db.storage.from('speaking-audio').upload(path,bytes,{contentType:mime,upsert:true}));
   checked(await db.rpc('save_speaking_recording',{p_id:body.id,p_student:id,p_stage:body.stage,p_kind:body.kind,p_item:body.item,p_path:path}));
   return json(200,{saved:true});
  }
  if(action==='certificate'){
   const events=await eventsFor(db,id);
   if(![0,1,2,3,4].every(s=>stageDone(events,s)))fail('Complete and sync all five levels first.');
   const student=checked(await db.from('speaking_students').select('full_name,completed_at,certificate_at').eq('id',id).single());
   const date=student.completed_at||new Date().toISOString();
   checked(await db.from('speaking_students').update({completed_at:date,certificate_at:student.certificate_at||date}).eq('id',id));
   return json(200,{name:student.full_name,date});
  }
  fail('Unknown action.',404);
 }catch(error){return json(error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
}
