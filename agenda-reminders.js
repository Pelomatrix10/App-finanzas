(function(){
'use strict';
const host=document.getElementById('tab-agenda');if(!host)return;
const box=document.createElement('div');box.className='copper-card';box.id='tito-reminders';box.hidden=true;
const title=document.createElement('strong');title.textContent='Recordatorios de rodajes';
const text=document.createElement('p');text.className='copper-agenda-hint';text.textContent='18:00 del día anterior y una hora antes del inicio · hora de Perú.';
const status=document.createElement('p');status.className='copper-agenda-hint';status.setAttribute('aria-live','polite');
const enable=document.createElement('button');enable.type='button';enable.textContent='Activar en este dispositivo';
box.append(title,text,status,enable);host.querySelector('.copper-card').after(box);
const settings=document.createElement('div');settings.className='copper-card';settings.id='tito-reminders-settings';
const settingsTitle=document.createElement('strong');settingsTitle.textContent='Recordatorios de rodajes';
const settingsStatus=document.createElement('p');settingsStatus.className='copper-agenda-hint';settingsStatus.setAttribute('aria-live','polite');
const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Activar avisos';
settings.append(settingsTitle,settingsStatus,toggle);document.getElementById('tab-config')?.appendChild(settings);
const api=()=>typeof supabaseClient!=='undefined'&&window.titoAccess?.user?supabaseClient:null;
const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
const preferenceKey=uid=>'tito-reminders-choice::'+uid;
function preference(uid){try{return localStorage.getItem(preferenceKey(uid))}catch{return null}}
function remember(uid,value){try{localStorage.setItem(preferenceKey(uid),value)}catch{}}
function bytes(value){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function registration(){return await navigator.serviceWorker.getRegistration()||await navigator.serviceWorker.register('./service-worker.js');}
let state='checking',revision=0,busy=false,needsNewSubscription=false;
function render(next,message){
 state=next;box.hidden=!['setup','problem'].includes(next);
 status.textContent=message||'';
 enable.hidden=!supported();enable.disabled=busy||!api();
 enable.textContent=next==='problem'?'Revisar activación':'Activar en este dispositivo';
 settingsStatus.textContent=next==='active'?'Activados en este dispositivo. '+text.textContent:next==='off'?'Desactivados por tu elección.':message||'Comprobando los recordatorios…';
 toggle.textContent=next==='active'?'Desactivar avisos':'Activar avisos';
 toggle.disabled=busy||!api()||!supported()||next==='checking';
}
async function update(){
 if(busy)return;
 const client=api(),uid=window.titoAccess?.user?.id,request=++revision;
 const current=()=>request===revision&&window.titoAccess?.user?.id===uid&&!busy;
 if(!client||!uid){render('checking','Inicia sesión para administrar los recordatorios.');return;}
 const desired=preference(uid);
 if(desired==='off'){render('off');return;}
 if(!supported()){render(desired==='on'?'problem':'setup','En iPhone, añade TiTo a la pantalla de inicio y ábrelo desde su icono para activar los avisos.');return;}
 try{
  const reg=await registration(),sub=await reg.pushManager.getSubscription();if(!current())return;
  if(sub&&Notification.permission!=='denied'){
   const {data,error}=await client.from('tito_push_subscriptions').select('id,disabled_at').eq('endpoint',sub.endpoint).limit(1);
   if(!current())return;if(error)throw error;
   if(data?.length&&data[0].disabled_at){needsNewSubscription=true;render('problem','El servicio de avisos dejó de reconocer este dispositivo. Pulsa Revisar activación para renovarla.');return;}
   if(data?.length){needsNewSubscription=false;remember(uid,'on');render('active');return;}
   if(desired==='on'){
    // Restore this account's previously approved device without prompting or subscribing again.
    const {error}=await client.rpc('register_tito_push',{subscription:sub.toJSON()});
    if(!current())return;if(error)throw error;render('active');return;
   }
  }
  if(!current())return;
  render(desired==='on'?'problem':'setup',Notification.permission==='denied'
   ?'Los avisos están bloqueados. Permítelos en los ajustes de TiTo o del navegador.'
   :desired==='on'?'La activación de este dispositivo ya no está disponible. Pulsa Revisar activación para recuperarla.':'Activa los recordatorios una sola vez en este dispositivo.');
 }catch(error){if(current())render('problem','No se pudo comprobar la activación. Revisa tu conexión y vuelve a intentarlo.');}
}
async function activate(){
 if(!api()||!supported()||busy)return;
 const client=api(),uid=window.titoAccess.user.id;
 const permission=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
 busy=true;++revision;render(state,status.textContent);
 try{
  if(await permission!=='granted'){render('problem','Los avisos no tienen permiso. Puedes permitirlos en los ajustes del dispositivo.');return;}
  const {data,error}=await client.from('tito_push_public_config').select('public_key').eq('id',true).single();
  if(error||!data?.public_key)throw new Error('El servicio se está preparando.');
  const reg=await registration();await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(sub&&needsNewSubscription){await sub.unsubscribe();sub=null;}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(data.public_key)});
  if(window.titoAccess?.user?.id!==uid)throw new Error('La sesión cambió.');
  const {error:saveError}=await client.rpc('register_tito_push',{subscription:sub.toJSON()});
  if(saveError)throw saveError;
  needsNewSubscription=false;remember(uid,'on');render('active');
 }catch(error){render('problem','No se pudieron activar los avisos. Revisa la conexión y el permiso del dispositivo.');}
 finally{busy=false;if(window.titoAccess?.user?.id===uid)render(state,status.textContent);else render('checking');}
}
async function deactivate(){
 const client=api(),uid=window.titoAccess?.user?.id;if(!client||!uid)return;
 ++revision;
 if(supported()){
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(sub){await sub.unsubscribe();remember(uid,'off');const {error}=await client.from('tito_push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)throw error;}
 }
 remember(uid,'off');
 render('off');
}
async function suspend(){
 // Explicit logout removes server delivery for privacy, but retains native consent and the device subscription.
 const client=api(),uid=window.titoAccess?.user?.id;if(!client||!uid||!supported())return;
 ++revision;
 const reg=await registration(),sub=await reg.pushManager.getSubscription();
 if(sub){
  if(state==='active')remember(uid,'on');
  const {error}=await client.from('tito_push_subscriptions').delete().eq('endpoint',sub.endpoint);
  if(error){await sub.unsubscribe();throw error;}
 }
 render('checking');
}
enable.onclick=activate;
toggle.onclick=async()=>{
 if(state!=='active'){await activate();return;}
 busy=true;
 try{await deactivate()}catch(error){render('problem','No se pudo completar la desactivación. Revisa tu conexión.');}
 finally{busy=false;render(state,status.textContent);}
};
window.titoPush={deactivate,suspend};
window.addEventListener('tito-cloud-status',event=>{if(event.detail?.status==='ready')update()});
window.addEventListener('tito-session-ready',update);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update()});
window.addEventListener('online',update);
if(window.__titoCloudReady)update();
const jobId=new URL(location.href).searchParams.get('agenda');
if(jobId&&/^[0-9a-f-]{36}$/i.test(jobId)){
 let opened=false;
 const showAgenda=()=>document.querySelector('.copper-bottom [data-copper="agenda"]')?.click();
 window.addEventListener('tito-cloud-status',event=>{if(event.detail?.status==='ready')showAgenda()});
 if(window.__titoCloudReady)showAgenda();
 window.addEventListener('tito-agenda-updated',()=>{if(opened)return;opened=true;showAgenda();document.querySelector('[data-job-id="'+jobId+'"]')?.scrollIntoView({block:'center'});});
}
})();