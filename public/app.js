import {stages,stageProgress} from './content.js';
import {api,queuePut,queueAll,queueDelete,base64} from './store.js';
const app=document.querySelector('#app');
let user=null,events=[],stage=0,mode='listen',item=0,page='login';
let view=0,speech=0,recording=null,pendingBlob=null,recordingUrl='',syncing=null,lastError='',sessionSaved=false;
try{user=JSON.parse(localStorage.getItem('speaking-session'));}catch{}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const progress=()=>stageProgress(events,stage);
const savedKey=()=> 'speaking-events:'+user.student.id;
function readLocal(){try{events=JSON.parse(localStorage.getItem(savedKey())||'[]');}catch{events=[];}}
function persist(){try{localStorage.setItem(savedKey(),JSON.stringify(events));localStorage.setItem('speaking-session',JSON.stringify(user));sessionSaved=true;}catch{sessionSaved=false;}}
function merge(list){for(const event of list)if(!events.some(e=>e.stage===event.stage&&e.kind===event.kind&&e.item===event.item))events.push(event);persist();}
function status(text){const el=document.querySelector('#status');if(el)el.textContent=text;}
function clean(){
 view++;speech++;window.speechSynthesis?.cancel();
 if(recording){const current=recording;recording=null;clearTimeout(current.timer);if(current.rec.state==='recording')current.rec.stop();current.stream.getTracks().forEach(t=>t.stop());}
 if(recordingUrl)URL.revokeObjectURL(recordingUrl);recordingUrl='';pendingBlob=null;
}
function show(name){clean();page=name;render();window.scrollTo(0,0);}
function sprite(index){
 const x=(index%5)*25,y=index<5?0:100;
 return '<div class="sprite" role="img" aria-label="'+escape(stages[stage].words[index][0])+'" style="background-image:url(assets/atlas-'+stages[stage].atlas+'.webp);background-position:'+x+'% '+y+'%"></div>';
}
function render(){
 if(page==='login'){
  app.innerHTML='<section class="card"><div class="eyebrow">WELCOME, LITTLE EXPLORER</div><h1>เริ่มการผจญภัยฝึกพูด</h1><img class="entry" src="assets/entry-0.webp" alt="Fox guide in a fruit garden"><form id="login"><label>รหัสนักเรียน<input name="code" required maxlength="20" autocomplete="username"></label><label>PIN จากครู (รหัสใหม่ 4 หลัก)<input name="pin" type="password" inputmode="numeric" required maxlength="100" autocomplete="current-password"><span class="small">ใส่เลขศูนย์ด้านหน้าให้ครบ เช่น 0001 · บัญชีเดิมยังใช้ PIN เดิมได้จนกว่าครูจะเปลี่ยนให้</span></label><label>ชื่อ–นามสกุลสำหรับเกียรติบัตร<input name="fullName" maxlength="100" required></label><label>ชื่อเล่น<input name="nickname" maxlength="30" required></label><label class="small"><input style="width:auto;min-height:0" name="consent" type="checkbox" required> ผู้ปกครองรับทราบว่าเสียงและผลการฝึกจะส่งให้ครูเพื่อติดตามการเรียนรู้</label><p class="small">ตรวจชื่อให้ถูกต้องก่อนเริ่ม ชื่อจะปรากฏบนเกียรติบัตร</p><button class="primary wide">Start my adventure</button><p id="status" role="status"></p></form><button class="wide" data-action="preview">Try a practice preview</button><p class="small">โหมดตัวอย่างทดลองกิจกรรมในเครื่องนี้</p></section>';return;
 }
 const intro='<div class="card"><div class="row"><strong>'+escape(user.student.nickname)+'</strong><button data-action="logout">ออกจากระบบ</button></div><p class="small">'+(user.preview?'Practice preview · ข้อมูลอยู่ในเครื่องนี้':'ผลการฝึกและเสียงจะส่งให้ครู')+'</p><div class="row"><button data-action="sync">ส่งงานที่รอส่ง</button><span id="sync-state" class="small"></span></div></div>';
 if(page==='map'){
  const total=stages.reduce((sum,_,i)=>sum+stageProgress(events,i).score,0);
  app.innerHTML=intro+'<section class="card"><div class="row"><h1>My adventure</h1><span class="badge">★ '+total+' / 150</span></div><div class="stack">'+stages.map((s,i)=>{
   const p=stageProgress(events,i),unlocked=i===0||stageProgress(events,i-1).done;
   return '<button class="level" data-level="'+i+'" '+(!unlocked?'disabled':'')+'><img src="assets/entry-'+i+'.webp" alt=""><span><strong>Level '+(i+1)+' · '+s.title+'</strong><span class="small">'+s.thai+'</span><span class="small">'+(p.done?'Mascot collected · ':!unlocked?'Locked · ':'')+p.score+' / 30</span></span></button>';
  }).join('')+'</div></section><section class="card"><h2>My mascot collection</h2><p>'+stages.map((s,i)=>stageProgress(events,i).done?'<span class="collectible"><img src="assets/mascot.webp" alt="Fox mascot"><span>'+escape(s.title)+' Explorer</span></span>':'').join('')+'</p><button class="gold wide" data-action="certificate" '+(!stages.every((_,i)=>stageProgress(events,i).done)?'disabled':'')+'>My certificate</button><p id="status" role="status"></p></section>';
 }else if(page==='entry'){
  app.innerHTML=intro+'<section class="card"><div class="eyebrow">LEVEL '+(stage+1)+'</div><h1>'+stages[stage].title+'</h1><p>'+stages[stage].thai+'</p><img class="entry" src="assets/entry-'+stage+'.webp" alt="Welcome to '+stages[stage].title+'"><p>10 Words + 5 Sentences</p><div class="stack"><button class="primary" data-action="start">Start exploring</button><button data-action="review-listen">Listen to words again</button>'+(progress().heard===10?'<button data-action="review-record">Practise word recording</button>':'')+(progress().words===10?'<button data-action="review-sentence">Practise sentences</button>':'')+'<button data-action="map">Back to map</button></div></section>';
 }else if(page==='practice'){
  const p=progress(),sentence=mode==='sentence',isRecord=mode!=='listen',list=sentence?stages[stage].sentences:stages[stage].words;
  const row=list[item],picture=sentence?row[3]:item;
  const has=events.some(e=>e.stage===stage&&e.kind===(sentence?'record_sentence':isRecord?'record_word':'listen_word')&&e.item===item);
  const recorded=sentence?p.sentences:p.words;
  app.innerHTML=intro+'<section class="card"><div class="row"><button data-action="map">Map</button><span class="badge">★ '+p.score+' / 30</span></div><h2>'+stages[stage].title+'</h2><div class="eyebrow">'+(sentence?'SPEAK IN SENTENCES':isRecord?'RECORD THE WORDS':'LISTEN TO THE WORDS')+'</div><progress max="'+list.length+'" value="'+(isRecord?recorded:p.heard)+'" aria-label="Section progress"></progress><p class="small">'+(item+1)+' / '+list.length+' · '+(isRecord?recorded:p.heard)+' completed</p>'+sprite(picture)+'<p class="word">'+escape(row[0])+'</p><details><summary>คำอ่านและคำแปล</summary><p class="thai">'+escape(row[1])+'</p><p class="thai">'+escape(row[2])+'</p><p class="small">คำอ่านไทยช่วยเริ่มฝึก เสียงภาษาอังกฤษเป็นต้นแบบในการออกเสียง</p></details><div class="controls"><button class="primary" data-action="listen">Listen'+(isRecord?' again':'')+'</button>'+(isRecord?'<button id="record" data-action="record" '+(sentence&&!events.some(e=>e.stage===stage&&e.kind==='listen_sentence'&&e.item===item)?'disabled':'')+'>Record my voice</button><audio id="playback" controls hidden aria-label="My voice"></audio><button id="use" data-action="use" disabled>Use this recording</button>':'')+'</div><p id="status" class="status" role="status">'+(has?'Completed. You can practise again.':'Listen, take your time and try.')+'</p><div class="split"><button data-action="previous" '+(item===0?'disabled':'')+'>Previous</button><button id="next" data-action="next" '+(!has?'disabled':'')+'>'+(item===list.length-1?'Finish this part':'Next')+'</button></div></section>';
 }else if(page==='celebrate'){
  app.innerHTML=intro+'<section class="card celebrate"><div class="confetti" aria-hidden="true">✦ ✧ ✦</div><h1>Well done, '+escape(user.student.nickname)+'!</h1><div class="mascot-track" role="img" aria-label="Your fox mascot is running and jumping to celebrate"><div class="mascot-lane"><div class="mascot-runner"><div class="mascot-facing"><img class="dancer" src="assets/mascot-jump-v3.gif" alt=""></div></div></div></div><p>'+escape(lastError)+'</p><p>Keep practising. Keep growing!</p><div class="stack"><button data-action="pause-celebration" aria-pressed="false">Pause animation</button><button data-action="stop-cheer">Stop voice</button><button class="primary" data-action="continue">Continue adventure</button></div><p class="small" id="cheer-status" role="status"></p></section>';
  celebrationVoice();
 }
 updateSync();
}
function celebrationVoice(){
 const stop=document.querySelector('[data-action="stop-cheer"]');
 const hint=document.querySelector('#cheer-status');
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){
  if(stop)stop.hidden=true;
  if(hint)hint.textContent='Well done! You did it!';
  return;
 }
 const current=view;
 const utterance=new window.SpeechSynthesisUtterance('Well done! You did it! Keep going!');
 utterance.lang='en-GB';utterance.rate=.9;utterance.pitch=1.18;utterance.volume=.85;
 const voices=window.speechSynthesis.getVoices();
 const voice=voices.find(v=>v.lang.toLowerCase()==='en-gb')||voices.find(v=>v.lang.toLowerCase().startsWith('en'));
 if(voice)utterance.voice=voice;
 const finish=()=>{if(current===view&&stop)stop.disabled=true;};
 utterance.onend=finish;
 utterance.onerror=()=>{finish();if(current===view&&hint)hint.textContent='Well done! You did it! หากไม่ได้ยินเสียง ให้ตรวจระดับเสียงและเสียงภาษาอังกฤษของเครื่อง';};
 try{window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);}catch{utterance.onerror();}
}
async function updateSync(){const el=document.querySelector('#sync-state');if(!el)return;try{const pending=(await queueAll()).filter(q=>q.studentId===user.student.id).length;el.textContent=user.preview?'Preview mode':pending?'รอส่ง '+pending+' รายการ':'ส่งงานครบแล้ว';}catch{el.textContent='กรุณาเปิดสิทธิ์จัดเก็บข้อมูลในเบราว์เซอร์';}}
async function enqueue(kind,blob){
 const data={id:crypto.randomUUID(),studentId:user.student.id,stage,kind,item,time:Date.now(),...(blob?{blob,mime:blob.type}:{})};
 await queuePut(data);
 if(user?.student.id===data.studentId)merge([{stage:data.stage,kind:data.kind,item:data.item}]);
 updateSync();sync();
}
function sync(){
 if(!user||user.preview)return Promise.resolve();
 if(syncing)return syncing;
 const syncingUser=user;
 syncing=(async()=>{
  try{
   while(true){
    const all=(await queueAll()).filter(q=>q.studentId===syncingUser.student.id);
    if(!all.length)break;
    for(const q of all){
     const payload={stage:q.stage,kind:q.kind,item:q.item};
     if(q.blob)await api('upload',{...payload,id:q.id,audio:await base64(q.blob),mime:q.mime},syncingUser.token);
     else await api('listen',payload,syncingUser.token);
     await queueDelete(q.id);
    }
   }
   const state=await api('state',{},syncingUser.token);
   if(user?.student.id===syncingUser.student.id){merge(state.events);user.student=state.student;persist();}
  }catch(error){const el=document.querySelector('#sync-state');if(el)el.textContent='รอส่ง · '+error.message;}
 })().finally(()=>{syncing=null;updateSync();});
 return syncing;
}

function listen(){
 if(recording){status('Stop recording first.');return;}
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){status('ไม่พบเสียงภาษาอังกฤษ กรุณาเปิดใน Chrome หรือ Safari และตรวจการตั้งค่าเสียง');return;}
 speech++;const token=speech,current=view;
 speechSynthesis.cancel();document.querySelector('#playback')?.pause();
 const row=mode==='sentence'?stages[stage].sentences[item]:stages[stage].words[item];
 const utterance=new SpeechSynthesisUtterance(row[0]);utterance.lang='en-GB';utterance.rate=.78;
 const voice=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase()==='en-gb');if(voice)utterance.voice=voice;
 utterance.onend=async()=>{
  if(token!==speech||current!==view)return;
  const kind=mode==='sentence'?'listen_sentence':'listen_word';
  try{if(!events.some(e=>e.stage===stage&&e.kind===kind&&e.item===item))await enqueue(kind);
   if(mode==='listen'){document.querySelector('#next').disabled=false;status('Great listening! Tap Next when you are ready.');}else{document.querySelector('#record').disabled=false;status('Your turn! Record your voice.');}
  }catch(e){status(e.message);}
 };
 utterance.onerror=e=>{if(current===view&&!['interrupted','canceled'].includes(e.error))status('เสียงเล่นไม่ได้ ลองกดอีกครั้งหรือตรวจการตั้งค่าเสียงของเครื่อง');};
 speechSynthesis.speak(utterance);
}
async function record(){
 const button=document.querySelector('#record');
 if(recording){button.disabled=true;const session=recording;clearTimeout(session.timer);session.rec.stop();return;}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('อุปกรณ์นี้อัดเสียงไม่ได้ ลองเปิดลิงก์ใน Chrome หรือ Safari และอนุญาตไมโครโฟน');return;}
 speech++;window.speechSynthesis?.cancel();document.querySelector('#playback')?.pause();const current=view;button.disabled=true;
 let stream;
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(current!==view){stream.getTracks().forEach(t=>t.stop());return;}
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));
  const rec=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:48000}:{audioBitsPerSecond:48000});
  const chunks=[],session={rec,stream};recording=session;
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onstop=()=>{
   clearTimeout(session.timer);stream.getTracks().forEach(t=>t.stop());
   if(current!==view||recording!==session)return;
   recording=null;button.disabled=false;button.textContent='Record again';
   if(!chunks.length){status('ไม่ได้ยินเสียง ลองอัดใหม่');return;}
   pendingBlob=new Blob(chunks,{type:rec.mimeType||chunks[0].type});
   if(pendingBlob.size>2097152){pendingBlob=null;status('ไฟล์ใหญ่เกินไป กรุณาอัดสั้นลง');return;}
   if(recordingUrl)URL.revokeObjectURL(recordingUrl);recordingUrl=URL.createObjectURL(pendingBlob);
   const player=document.querySelector('#playback');player.src=recordingUrl;player.hidden=false;
   document.querySelector('#use').disabled=false;status('Listen to your voice. Choose Use this recording when ready.');
  };
  rec.onerror=()=>{stream.getTracks().forEach(t=>t.stop());if(current===view){recording=null;button.disabled=false;status('Recording failed. Try again.');}};
  pendingBlob=null;document.querySelector('#use').disabled=true;rec.start();
  button.textContent='Stop recording';status('Recording…');session.timer=setTimeout(()=>{if(rec.state==='recording')rec.stop();},20000);
 }catch{stream?.getTracks().forEach(t=>t.stop());if(current===view){recording=null;status('อนุญาตไมโครโฟนเพื่ออัดเสียง แล้วลองอีกครั้ง');}}
 finally{if(current===view&&!recording)button.disabled=false;else if(current===view)button.disabled=false;}
}
async function useRecording(){
 const button=document.querySelector('#use');if(!pendingBlob||recording)return;
 button.disabled=true;
 try{
  const player=document.querySelector('#playback');
  if(!player.played.length){status('Play your voice before saving.');button.disabled=false;return;}
  await enqueue(mode==='sentence'?'record_sentence':'record_word',pendingBlob);
  pendingBlob=null;const nextButton=document.querySelector('#next');if(nextButton)nextButton.disabled=false;
  status(user?.preview?'Saved on this device for preview.':'บันทึกในเครื่องแล้ว ระบบกำลังส่งให้ครู ดูสถานะส่งงานด้านบน');
 }catch(e){status('บันทึกไม่สำเร็จ '+e.message);button.disabled=false;}
}
function begin(){
 const p=progress();
 mode=p.heard<10?'listen':p.words<10?'record':'sentence';
 const kind=mode==='listen'?'listen_word':mode==='record'?'record_word':'record_sentence';
 const max=mode==='sentence'?5:10;
 item=Array.from({length:max},(_,i)=>i).find(i=>!events.some(e=>e.stage===stage&&e.kind===kind&&e.item===i))??0;
 show('practice');
}
let continuation='record';
function next(){
 const n=mode==='sentence'?5:10;
 if(item<n-1){item++;show('practice');return;}
 const p=progress();
 if(mode==='listen'&&p.heard<10||mode==='record'&&p.words<10||mode==='sentence'&&!p.done){status('Complete all activities in this part first.');return;}
 continuation=mode==='listen'?'record':mode==='record'?'sentence':'map';
 lastError=continuation==='map'?'Level '+(stage+1)+' complete! Your '+stages[stage].title+' Explorer mascot is collected.':'You finished this part!';
 show('celebrate');
}
async function certificate(){
 const owner=user;
 status('กำลังตรวจผลการฝึกที่ส่งสำเร็จ…');
 try{
  if(user.preview)throw new Error('โหมดตัวอย่างยังออกเกียรติบัตรจริงไม่ได้');
  await sync();
  if(user?.student.id!==owner.student.id)return;
  const pending=(await queueAll()).some(q=>q.studentId===owner.student.id);
  if(pending)throw new Error('ยังมีงานรอส่ง กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วส่งงานให้ครบ');
  const result=await api('certificate',{},owner.token);
  if(user?.student.id!==owner.student.id)return;
  clean();page='certificate';
  app.innerHTML='<section class="certificate"><div class="eyebrow">ENGLISH SPEAKING ADVENTURE</div><h1>CERTIFICATE OF COMPLETION</h1><p>This certificate is proudly presented to</p><div class="name">'+escape(result.name)+'</div><p>for completing all five levels of vocabulary<br>and simple-sentence speaking practice.</p><p class="certtopics">'+stages.map(s=>s.title).join(' · ')+'</p><p><em>Keep practising. Keep speaking. Keep growing!</em></p><p>Completed on '+new Date(result.date).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})+'</p><img class="signature" src="assets/signature.webp" alt="Wongduen Khunakon signature"><strong>Wongduen Khunakon</strong><br>English teacher</section><div class="no-print stack" style="margin-top:15px"><button class="gold" data-action="print">Save as PDF / Print</button><button data-action="map">Back to map</button></div>';
  window.scrollTo(0,0);
 }catch(e){status(e.message);}
}
app.addEventListener('submit',async e=>{
 if(e.target.id!=='login')return;e.preventDefault();
 const form=e.target,button=form.querySelector('button');button.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form));
  if(!data.fullName.trim()||!data.nickname.trim())throw new Error('กรุณากรอกชื่อให้ครบ');
  const result=await api('login',data);
  user=result;readLocal();merge(result.events);persist();show('map');sync();
 }catch(error){status(error.message);button.disabled=false;}
});
app.addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.dataset.level!==undefined){stage=Number(button.dataset.level);show('entry');return;}
 switch(button.dataset.action){
  case 'preview':user={preview:true,student:{id:'preview',nickname:'Explorer',full_name:'Practice preview'}};readLocal();show('map');break;
  case 'logout':clean();user=null;events=[];try{localStorage.removeItem('speaking-session');}catch{}show('login');break;
  case 'map':show('map');break;
  case 'sync':await sync();break;
  case 'start':begin();break;
  case 'review-listen':mode='listen';item=0;show('practice');break;
  case 'review-record':if(progress().heard===10){mode='record';item=0;show('practice');}break;
  case 'review-sentence':if(progress().words===10){mode='sentence';item=0;show('practice');}break;
  case 'listen':listen();break;
  case 'record':record();break;
  case 'use':await useRecording();break;
  case 'previous':item--;show('practice');break;
  case 'next':next();break;
  case 'continue':if(continuation==='map'){show('map');if(!user.preview&&stages.every((_,i)=>stageProgress(events,i).done))await certificate();}else{mode=continuation;item=0;show('practice');}break;
  case 'pause-celebration':{
   const scene=document.querySelector('.celebrate');
   const paused=scene.classList.toggle('is-paused');
   const mascot=scene.querySelector('.dancer');if(mascot)mascot.src=paused?'assets/mascot.webp':'assets/mascot-jump-v3.gif';
   button.textContent=paused?'Resume animation':'Pause animation';button.setAttribute('aria-pressed',String(paused));
   break;
  }
  case 'stop-cheer':window.speechSynthesis?.cancel();button.disabled=true;break;
  case 'certificate':await certificate();break;
  case 'print':window.print();break;
 }
});
window.addEventListener('online',sync);
window.addEventListener('pagehide',clean);
if(user?.student){readLocal();show('map');sync();}else show('login');
