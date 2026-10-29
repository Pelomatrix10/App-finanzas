(function(){
'use strict';
const host=document.getElementById('tab-agenda'),form=document.getElementById('copper-form'),wrap=document.getElementById('copper-form-wrap');
if(!host||!form||!wrap)return;
const style=document.createElement('style');
style.textContent='.copper-booking-date[data-status="Confirmado"]{background:#a8b994;border-color:#a8b994;color:#15271d}.copper-booking-date[data-status="Confirmado"] span{color:#15271d}.copper-booking-date[data-status="Tentativo"]{background:#d4b279;border-color:#d4b279;color:#302314}.copper-booking-date[data-status="Tentativo"] span{color:#302314}.copper-booking-date[data-status="Cancelado"]{background:#c88989;border-color:#c88989;color:#331b21}.copper-booking-date[data-status="Cancelado"] span{color:#331b21}.copper-agenda-list{margin-top:18px}.copper-agenda-list h3{color:#f3ebdd;font-size:17px}.copper-booking-actions{display:flex;gap:7px;margin-top:10px}.copper-booking-actions button{border:1px solid #70543e;border-radius:8px;background:#203440;color:#f3ebdd;padding:7px 11px;font-size:12px}.copper-agenda-hint{color:#c9bdb1;font-size:12px;line-height:1.5}';
document.head.appendChild(style);
const extraStyle=document.createElement('style');extraStyle.textContent='.copper-booking-actions{flex-wrap:wrap}.copper-booking-actions button:disabled{opacity:.5;cursor:default}.copper-client-picker{grid-column:1/-1}.copper-client-picker label{display:block}.copper-client-picker .copper-create-client{display:flex;gap:8px;align-items:center}.copper-client-picker input[type=checkbox]{width:auto}.copper-client-linked{color:#a8b994;font-size:12px;margin-top:5px}';document.head.appendChild(extraStyle);
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
const api=()=>typeof supabaseClient!=='undefined'&&supabaseClient&&window.titoAccess?.user?supabaseClient:null;
const field=name=>form.elements.namedItem(name);
const limaToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
const key=s=>String(s||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
const clientText=field('cliente');
const picker=el('div','copper-client-picker'),selectLabel=el('label','','Vincular con cliente'),select=el('select');
select.name='cliente_id';selectLabel.append(select);
const checkLabel=el('label','copper-create-client'),create=el('input');create.type='checkbox';create.name='crear_cliente';checkLabel.append(create,document.createTextNode('Crear cliente nuevo con este nombre'));
const hint=el('p','copper-agenda-hint');hint.setAttribute('aria-live','polite');picker.append(selectLabel,checkLabel,hint);clientText.parentElement.after(picker);
const list=el('div','copper-agenda-list');host.appendChild(list);
form.querySelector('[type=submit]').textContent='Guardar trabajo';
host.querySelector('.copper-card p').textContent='Guarda tus rodajes y vincula los confirmados con tus clientes. Confirmar no genera deuda.';
let directory=[],loadedUser=null,loading=false,directoryVersion=0,busy=false;
function options(id=''){
 select.replaceChildren(new Option('Selecciona un cliente existente',''));
 for(const c of directory)select.add(new Option(c.nombre,c.id));
 select.value=id;
}
function updateChoice(){
 const match=directory.find(c=>key(c.nombre)===key(clientText.value));
 if(!select.value&&match){select.value=match.id;create.checked=false;}
 create.disabled=!!select.value||field('estado').value!=='Confirmado'||!clientText.value.trim();
 if(create.disabled)create.checked=false;
 hint.textContent=select.value?'Cliente vinculado. Este rodaje no genera deuda.':field('estado').value==='Confirmado'?'Selecciona un cliente o marca la creación de uno nuevo. No se registrarán cobros.':'Puedes dejar el nombre como referencia. La creación de clientes se habilita al confirmar.';
}
select.onchange=()=>{if(select.value)clientText.value=directory.find(c=>c.id===select.value)?.nombre||'';updateChoice()};
clientText.addEventListener('input',()=>{select.value='';create.checked=false;updateChoice()});
field('estado').addEventListener('change',updateChoice);
async function loadDirectory(){
 const client=api();if(!client)throw new Error('Inicia sesión.');
 const uid=window.titoAccess.user.id,version=++directoryVersion;
 await window.titoCloud.flush();
 const {data,error}=await client.from('clientes').select('id,legacy_id,nombre,nota').eq('user_id',uid).order('nombre');
 if(error)throw error;
 if(window.titoAccess?.user?.id!==uid||version!==directoryVersion)throw new Error('La sesión cambió. Vuelve a abrir el rodaje.');
 directory=data||[];window.titoCloud.mergeClients(directory);
}
async function edit(job){
 if(busy)return;busy=true;
 try{
  await loadDirectory();form.reset();
  for(const name of ['tipo','nombre','cliente','rol','fecha','inicio','fin','lugar','estado','tarifa','notas'])field(name).value=job[name]??'';
  form.dataset.editingId=job.id;delete form.dataset.pendingId;options(job.cliente_id||'');create.checked=false;updateChoice();
  wrap.hidden=false;form.hidden=false;document.getElementById('copper-preview').hidden=true;wrap.scrollIntoView({block:'start'});
 }catch(e){alert('No se pudieron cargar los clientes: '+e.message)}finally{busy=false}
}
function card(job){
 const box=el('article','copper-booking'),dateBox=el('div','copper-booking-date');box.dataset.jobId=job.id;dateBox.dataset.status=job.estado;
 const [year,month,day]=String(job.fecha||'').split('-').map(Number);
 dateBox.append(el('span','',month?new Intl.DateTimeFormat('es-PE',{month:'short'}).format(new Date(year,month-1,1)).toUpperCase():''),el('strong','',String(day||'--').padStart(2,'0')));
 const info=el('div','copper-booking-info');
 info.append(el('div','copper-booking-name',job.nombre),el('div','copper-booking-meta',[job.tipo,job.cliente,[job.inicio?.slice(0,5),job.fin?.slice(0,5)].filter(Boolean).join('–')].filter(Boolean).join(' · ')));
 if(job.cliente_id)info.append(el('div','copper-client-linked',job.cobro_generado_id?'Asistencia registrada · cobro generado':'Cliente vinculado · sin cobro generado por Agenda'));
 else if(job.estado==='Confirmado')info.append(el('div','copper-agenda-hint','Pendiente de vincular a un cliente'));
 const bottom=el('div','copper-booking-bottom');bottom.append(el('span','copper-booking-money',(job.cobro_generado_id?'Cobro ':'')+'S/ '+Number(job.cobro?.monto??job.tarifa??0).toLocaleString('es-PE',{maximumFractionDigits:2})),el('span','copper-booking-status',job.estado));info.append(bottom);
 const actions=el('div','copper-booking-actions'),state=el('button','','Cambiar estado');state.type='button';
 state.onclick=async()=>{
  const next=job.estado==='Tentativo'?'Confirmado':job.estado==='Confirmado'?'Cancelado':'Tentativo';
  if(next==='Confirmado'){await edit({...job,estado:next});return}
  const client=api();if(!client)return;state.disabled=true;
  try{const {error}=await client.rpc('save_agenda_with_client',{job_id:job.id,job:{...job,estado:next},selected_client:job.cliente_id||null,create_client:false});if(error)throw error;await refresh()}
  catch(e){alert('No se pudo actualizar: '+e.message)}finally{state.disabled=false}
 };
 const editButton=el('button','','Editar');editButton.type='button';editButton.onclick=()=>edit(job);
 const remove=el('button','','Eliminar');remove.type='button';remove.onclick=async()=>{
  if(!confirm('¿Eliminar definitivamente este rodaje? El cliente se conservará.'))return;
  const client=api();if(!client)return;remove.disabled=true;
  try{const {error}=await client.from('agenda_trabajos').delete().eq('id',job.id);if(error)throw error;if(form.dataset.editingId===job.id){reset();wrap.hidden=true}await refresh()}
  catch(e){alert('No se pudo eliminar: '+e.message)}finally{remove.disabled=false}
 };
 if(job.cobro_generado_id){state.hidden=true;editButton.hidden=true;remove.hidden=true;}
 const attend=el('button','',job.cobro_generado_id?'Ver cobro':'Asistí · registrar cobro');attend.type='button';
 attend.hidden=!job.cobro_generado_id&&job.estado!=='Confirmado';
 attend.disabled=!job.cobro_generado_id&&job.fecha>limaToday();
 if(attend.disabled){attend.title='Disponible desde la fecha del rodaje';info.append(el('div','copper-agenda-hint','Podrás registrar asistencia el '+job.fecha.split('-').reverse().join('/')));}
 attend.onclick=()=>attendance(job,attend);
 actions.append(attend,state,editButton,remove);info.append(actions);box.append(dateBox,info);return box;
}
async function attendance(job,button){
 if(busy)return;
 let amount=Number(job.tarifa||0);
 if(!job.cobro_generado_id){
  if(!job.cliente_id){alert('Primero edita el rodaje y vincúlalo con un cliente.');return;}
  const input=prompt('Asistencia a '+job.nombre+'\nCliente: '+job.cliente+'\nMonto del cobro pendiente (S/):',String(amount));
  if(input===null)return;amount=Number(input.trim().replace(',','.'));
  if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>1e-6){alert('Ingresa un monto mayor a cero, con hasta dos decimales.');return;}
  if(!confirm('¿Confirmas que asististe a '+job.nombre+'?\nSe registrará un único cobro pendiente para '+job.cliente+' por S/ '+amount.toFixed(2)+'.'))return;
 }
 busy=true;button.disabled=true;
 try{
  await window.titoCloud.flush();
  const {data,error}=await api().rpc('attend_agenda_job',{job_id:job.id,amount});
  if(error)throw error;window.titoCloud.mergeCharge(data);await refresh();
  document.querySelector('.copper-bottom [data-copper="cobros"]')?.click();
 }catch(error){alert('No se pudo completar: '+error.message)}finally{busy=false;button.disabled=false}
}
async function refresh(){
 const client=api();if(!client){loadedUser=null;directory=[];list.replaceChildren(el('p','copper-agenda-hint','Inicia sesión para ver tus trabajos.'));return}
 if(loading)return;loading=true;const uid=window.titoAccess.user.id;
 try{
  const {data,error}=await client.from('agenda_trabajos').select('id,tipo,nombre,cliente,cliente_id,rol,fecha,inicio,fin,lugar,estado,tarifa,notas,cobro_generado_id,asistio_at,cobro:proyectos!agenda_trabajos_cobro_generado_id_fkey(monto,estado)').eq('user_id',uid).order('fecha',{ascending:true});
  if(error)throw error;if(window.titoAccess?.user?.id!==uid)return;
  list.replaceChildren(el('h3','','Trabajos agendados'));
  if(!data?.length)list.append(el('p','copper-agenda-hint','Todavía no hay trabajos guardados.'));
  for(const job of data||[])list.append(card(job));loadedUser=uid;
  window.dispatchEvent(new CustomEvent('tito-agenda-updated'));
 }catch(e){list.replaceChildren(el('p','copper-agenda-hint','No se pudo cargar Agenda: '+e.message))}finally{loading=false}
}
function reset(){delete form.dataset.editingId;delete form.dataset.pendingId;form.reset();options();create.checked=false;updateChoice()}
form.addEventListener('submit',async e=>{
 e.preventDefault();e.stopImmediatePropagation();if(busy)return;
 const client=api();if(!client){alert('Inicia sesión para guardar el trabajo.');return}
 if(!form.reportValidity())return;
 const f=Object.fromEntries(new FormData(form).entries());
 if(f.inicio&&f.fin&&f.inicio>=f.fin){alert('La hora final debe ser posterior a la inicial.');return}
 if(f.estado==='Confirmado'&&!select.value&&!create.checked){alert('Selecciona un cliente existente o marca la creación de uno nuevo.');return}
 const save=form.querySelector('[type=submit]');busy=true;save.disabled=true;const original=save.textContent;save.textContent='Guardando…';
 const uid=window.titoAccess.user.id;
 try{
  await window.titoCloud.flush();
  const payload={tipo:f.tipo,nombre:f.nombre.trim(),cliente:f.cliente||'',rol:f.rol||'',fecha:f.fecha,inicio:f.inicio||null,fin:f.fin||null,lugar:f.lugar||'',estado:f.estado,tarifa:Number(f.tarifa||0),notas:f.notas||''};
  const {data:existing,error:lookupError}=await client.from('agenda_trabajos').select('id').eq('user_id',uid).eq('fecha',payload.fecha).neq('estado','Cancelado');
  if(lookupError)throw lookupError;
  const others=(existing||[]).filter(row=>row.id!==form.dataset.editingId&&row.id!==form.dataset.pendingId);
  if(others.length&&!confirm('Ya hay '+others.length+' reserva(s) activa(s) en esta fecha. ¿Guardar igualmente?'))return;
  const id=form.dataset.editingId||(form.dataset.pendingId ||= crypto.randomUUID());
  const {error}=await client.rpc('save_agenda_with_client',{job_id:id,job:payload,selected_client:select.value||null,create_client:create.checked});
  if(error)throw error;
  reset();wrap.hidden=true;await refresh();
  try{await loadDirectory()}catch(e){alert('El rodaje se guardó. Los clientes se actualizarán al volver a entrar: '+e.message)}
 }catch(e){alert('No se pudo guardar: '+e.message)}finally{busy=false;save.disabled=false;save.textContent=original}
},true);
document.getElementById('copper-open').addEventListener('click',async()=>{
 reset();busy=true;
 try{await loadDirectory();options();updateChoice()}catch(e){alert('No se pudieron cargar los clientes: '+e.message)}finally{busy=false}
},true);
document.getElementById('copper-cancel').addEventListener('click',()=>{if(!busy)reset()},true);
host.addEventListener('click',()=>{if(api()&&loadedUser!==window.titoAccess.user.id)refresh()});
const observer=setInterval(()=>{if(!document.getElementById('tito-app')){clearInterval(observer);return}if(host.classList.contains('active-section')&&(!api()||loadedUser!==window.titoAccess.user.id))refresh()},1500);
window.addEventListener('tito-cloud-status',()=>{if(host.classList.contains('active-section'))refresh()});
window.addEventListener('pagehide',()=>clearInterval(observer));
const originalDelete=window.eliminarCliente;
window.eliminarCliente=async id=>{
 try{await loadDirectory();const c=directory.find(c=>c.legacy_id===id);if(c){const {data,error}=await api().from('agenda_trabajos').select('id').eq('cliente_id',c.id).limit(1);if(error)throw error;if(data?.length){alert('Este cliente tiene rodajes vinculados. Desvincúlalos en Agenda antes de eliminarlo.');return}}originalDelete(id)}
 catch(e){alert('No se pudo comprobar el cliente: '+e.message)}
};
const originalDeleteProject=window.eliminarProyecto;
if(originalDeleteProject)window.eliminarProyecto=async(clientId,projectId)=>{
 try{
  const client=api();if(!client)throw new Error('Inicia sesión para comprobar el cobro.');
  await window.titoCloud.flush();
  const {data,error}=await client.from('proyectos').select('agenda_trabajo_id').eq('user_id',window.titoAccess.user.id).eq('legacy_id',projectId).maybeSingle();
  if(error)throw error;
  if(data?.agenda_trabajo_id){alert('Este cobro está vinculado a una asistencia. Puedes editar su monto y estado desde Cobros; no se puede eliminar por separado.');return;}
  originalDeleteProject(clientId,projectId);
 }catch(error){alert('No se pudo comprobar el cobro: '+error.message)}
};
options();updateChoice();
})();