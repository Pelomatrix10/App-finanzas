(function(){
'use strict';
const host=document.getElementById('tab-agenda');if(!host)return;
const box=document.createElement('div');box.className='copper-card';box.id='tito-reminders';
const title=document.createElement('strong');title.textContent='Recordatorios de rodajes';
const text=document.createElement('p');text.className='copper-agenda-hint';text.textContent='18:00 del día anterior y una hora antes del inicio · hora de Perú. Solo rodajes confirmados. Si no hay hora de inicio, se toma 09:00.';
const status=document.createElement('p');status.className='copper-agenda-hint';status.setAttribute('aria-live','polite');
const enable=document.createElement('button');enable.type='button';enable.textContent='Activar en este dispositivo';
const disable=document.createElement('button');disable.type='button';disable.textContent='Desactivar';disable.style.marginLeft='8px';disable.hidden=true;
box.append(title,text,status,enable,disable);host.querySelector('.copper-card').after(box);
const api=()=>typeof supabaseClient!=='undefined'&&window.titoAccess?.user?supabaseClient:null;
const supported=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
function bytes(value){const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function registration(){
 return await navigator.serviceWorker.getRegistration()||await navigator.serviceWorker.register('./service-worker.js');
}
async function update(){
 if(!supported()){status.textContent='Para recibir avisos en iPhone, añade TiTo a la pantalla de inicio y ábrelo desde su icono.';enable.hidden=true;return;}
 if(!api()){status.textContent='Inicia sesión para activar los recordatorios.';enable.disabled=true;return;}
 enable.hidden=false;enable.disabled=false;
 try{
  const reg=await registration(),sub=await reg.pushManager.getSubscription();
  if(sub){
   const {data,error}=await api().from('tito_push_subscriptions').select('id').eq('endpoint',sub.endpoint).is('disabled_at',null).limit(1);
   if(error)throw error;
   const active=!!data?.length;
   status.textContent=active?'Recordatorios activados en este dispositivo.':'Pulsa Activar para vincular los avisos con tu cuenta.';
   enable.hidden=active;disable.hidden=!active;
  }else{status.textContent=Notification.permission==='denied'?'Los avisos están bloqueados. Puedes permitirlos en los ajustes de TiTo o del navegador.':'Actívalos para recibir avisos aunque TiTo esté cerrado.';disable.hidden=true;}
 }catch(e){status.textContent='No se pudo comprobar la activación: '+e.message;}
}
enable.onclick=async()=>{
 if(!api()||!supported())return;
 // The browser permission prompt is invoked directly by this user gesture.
 const permission=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
 enable.disabled=true;
 try{
  if(await permission!=='granted'){status.textContent='No se activaron los avisos. Puedes permitirlos en los ajustes del dispositivo.';return;}
  const client=api(),uid=window.titoAccess.user.id;
  const {data,error}=await client.from('tito_push_public_config').select('public_key').eq('id',true).single();
  if(error||!data?.public_key)throw new Error('El servicio se está preparando. Vuelve a intentarlo en un minuto.');
  const reg=await registration();await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(data.public_key)});
  if(window.titoAccess?.user?.id!==uid)throw new Error('La sesión cambió. Vuelve a activar los avisos.');
  const saved=await client.rpc('register_tito_push',{subscription:sub.toJSON()});
  if(saved.error)throw saved.error;
  await update();
 }catch(e){status.textContent='No se pudieron activar los avisos: '+e.message;}finally{enable.disabled=false}
};
async function deactivate(){
 const client=api();if(!client||!supported())return;
 const reg=await registration(),sub=await reg.pushManager.getSubscription();
 if(sub){await sub.unsubscribe();const {error}=await client.from('tito_push_subscriptions').delete().eq('endpoint',sub.endpoint);if(error)console.warn('TiTo: el dispositivo ya se desactivó; queda pendiente limpiar su registro.');}
}
disable.onclick=async()=>{disable.disabled=true;try{await deactivate();await update()}catch(e){status.textContent='No se pudieron desactivar: '+e.message}finally{disable.disabled=false}};
window.titoPush={deactivate};
window.addEventListener('tito-cloud-status',event=>{if(event.detail?.status==='ready')update()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update()});
if(window.__titoCloudReady)update();
const jobId=new URL(location.href).searchParams.get('agenda');
if(jobId&&/^[0-9a-f-]{36}$/i.test(jobId)){
 let opened=false;
 const showAgenda=()=>document.querySelector('.copper-bottom [data-copper="agenda"]')?.click();
 window.addEventListener('tito-cloud-status',event=>{if(event.detail?.status==='ready')showAgenda()});
 if(window.__titoCloudReady)showAgenda();
 window.addEventListener('tito-agenda-updated',()=>{if(opened)return;opened=true;document.querySelector('.copper-bottom [data-copper="agenda"]')?.click();document.querySelector('[data-job-id="'+jobId+'"]')?.scrollIntoView({block:'center'});});
}
})();