let dbPromise;
function database(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('speaking-adventure',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('queue',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('Cannot save on this device. Please allow browser storage.'));
 });
 return dbPromise;
}
export async function queuePut(item){const db=await database();return new Promise((resolve,reject)=>{
 const tx=db.transaction('queue','readwrite');tx.objectStore('queue').put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
});}
export async function queueDelete(id){const db=await database();return new Promise((resolve,reject)=>{
 const tx=db.transaction('queue','readwrite');tx.objectStore('queue').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
});}
export async function queueAll(){const db=await database();return new Promise((resolve,reject)=>{
 const req=db.transaction('queue').objectStore('queue').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>a.time-b.time));req.onerror=()=>reject(req.error);
});}
export async function api(action,data={},token=''){
 const response=await fetch('/.netlify/functions/api?action='+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 let body;try{body=await response.json();}catch{throw new Error('The server is not connected yet. Please follow the setup guide.');}
 if(!response.ok)throw new Error(body.error||'Please try again.');
 return body;
}
export function base64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});}
