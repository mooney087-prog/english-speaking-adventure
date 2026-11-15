import {api} from './store.js';
import {stages,stageProgress} from './content.js';
const app=document.querySelector('#app');
let token='',roster=[],events=[],selected=null;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text){const node=document.querySelector('#status');if(node)node.textContent=text;}
function login(){
 token='';
 app.innerHTML='<section class="card"><h1>เข้าสู่ระบบครู</h1><form id="login"><label>รหัสผ่านครู<input type="password" name="password" required autocomplete="current-password"></label><button class="primary">Sign in</button></form><p id="status" role="status"></p><p class="small">ตั้งค่ารหัสผ่านใน Netlify ตามคู่มือติดตั้งก่อนใช้งาน</p></section>';
}
async function refresh(){
 const data=await api('roster',{},token);
 roster=data.students;events=data.events;render();
}
function render(){
 app.innerHTML='<section class="card"><div class="row"><h1>รายชื่อนักเรียน</h1><button data-action="logout">ออกจากระบบ</button></div><button data-action="refresh">รีเฟรชผลล่าสุด</button><p id="status" role="status"></p><p class="small">คะแนนแสดงการฝึกที่ส่งสำเร็จ ครูเปิดฟังเสียงเพื่อประเมินการพูดเพิ่มเติมได้</p><div class="tablewrap"><table><thead><tr><th>นักเรียน</th><th>เข้าใช้ล่าสุด</th><th>ความคืบหน้า</th><th>ฟังเสียง</th></tr></thead><tbody>'+roster.map(student=>{
  const own=events.filter(e=>e.student_id===student.id);
  const scores=stages.map((s,i)=>{const p=stageProgress(own,i);return s.title+' '+p.heard+'/10 ฟัง · '+p.words+'/10 คำ · '+p.sentences+'/5 ประโยค';});
  return '<tr><td>'+escape(student.code)+'<br><strong>'+escape(student.full_name)+'</strong><br>'+escape(student.nickname)+'</td><td>'+(student.last_seen?new Date(student.last_seen).toLocaleString('th-TH'):'ยังไม่เข้าเรียน')+'</td><td>'+scores.map(escape).join('<br>')+'<br>'+(student.certificate_at?'ออกเกียรติบัตรแล้ว':'')+'</td><td><button data-detail="'+student.id+'">เปิดเสียง</button></td></tr>';
 }).join('')+'</tbody></table></div></section><section class="card"><h2>เพิ่มนักเรียนก่อนส่งลิงก์</h2><form id="student"><label>รหัสนักเรียน เช่น P301<input name="code" pattern="[A-Za-z0-9-]{2,20}" required></label><label>ชื่อ–นามสกุล<input name="fullName" required maxlength="100"></label><label>ชื่อเล่น<input name="nickname" required maxlength="30"></label><button class="primary">เพิ่มและสร้างรหัสเข้าเรียน</button></form><p id="credentials" class="notice" hidden></p><p class="small">เก็บรหัสเข้าเรียนที่แสดงไว้ แล้วส่งให้ผู้ปกครองของนักเรียนคนนั้น รหัสจะแสดงครั้งเดียว</p></section><section id="detail"></section>';
}
async function detail(id){
 selected=id;message('กำลังโหลดเสียง…');
 const {recordings}=await api('detail',{studentId:id},token);
 const groups=new Map();
 for(const r of recordings){
  const key=r.stage+':'+r.kind+':'+r.item;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(r);
 }
 const student=roster.find(s=>s.id===id);
 document.querySelector('#detail').innerHTML='<section class="card"><h2>เสียงของ '+escape(student.full_name)+'</h2><p>เลือกฟังครั้งแรกและครั้งล่าสุดที่เด็กส่ง</p>'+([...groups.entries()].map(([key,items])=>{
  const r=items[0],word=r.kind==='record_word';
  const label=(word?stages[r.stage].words:stages[r.stage].sentences)[r.item][0];
  const last=items.at(-1);
  return '<div class="card"><strong>'+escape(stages[r.stage].title)+' · '+escape(label)+'</strong><div class="row"><button data-audio="'+r.id+'">ครั้งแรก</button><button data-audio="'+last.id+'">ล่าสุด ('+items.length+' ครั้ง)</button></div></div>';
 }).join('')||'<p>ยังไม่มีเสียงที่ส่งสำเร็จ</p>')+'<audio id="teacher-player" controls hidden></audio></section>';
 message('โหลดผลล่าสุดแล้ว');document.querySelector('#detail').scrollIntoView({behavior:'smooth'});
}
app.addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;
 try{
  const data=Object.fromEntries(new FormData(form));
  if(form.id==='login'){token=(await api('teacherLogin',data)).token;await refresh();}
  else{
   const result=await api('addStudent',data,token);await refresh();
   const box=document.querySelector('#credentials');box.hidden=false;box.textContent='รหัสนักเรียน '+result.code+' · รหัสเข้าเรียน '+result.pin+' — กรุณาจดไว้ตอนนี้';
   box.scrollIntoView({behavior:'smooth'});
  }
 }catch(error){message(error.message);button.disabled=false;}
});
app.addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button||button.type==='submit'&&!button.dataset.action&&!button.dataset.detail&&!button.dataset.audio)return;
 try{
  if(button.dataset.detail){await detail(button.dataset.detail);return;}
  if(button.dataset.audio){
   const {url}=await api('audio',{recordingId:button.dataset.audio},token);
   const player=document.querySelector('#teacher-player');player.src=url;player.hidden=false;player.play().catch(()=>message('กด Play ที่เครื่องเล่นเพื่อฟังเสียง'));return;
  }
  if(button.dataset.action==='logout'){document.querySelector('#teacher-player')?.pause();login();}
  if(button.dataset.action==='refresh')await refresh();
 }catch(error){message(error.message);}
});
login();
