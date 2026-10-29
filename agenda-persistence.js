(function(){
'use strict';
const host=document.getElementById('tab-agenda'), form=document.getElementById('copper-form'),wrap=document.getElementById('copper-form-wrap');
if(!host||!form||!wrap)return;
const style=document.createElement('style');
style.textContent='.copper-booking-date[data-status="Confirmado"]{background:#a8b994;border-color:#a8b994;color:#15271d}.copper-booking-date[data-status="Confirmado"] span{color:#15271d}.copper-booking-date[data-status="Tentativo"]{background:#d4b279;border-color:#d4b279;color:#302314}.copper-booking-date[data-status="Tentativo"] span{color:#302314}.copper-booking-date[data-status="Cancelado"]{background:#c88989;border-color:#c88989;color:#331b21}.copper-booking-date[data-status="Cancelado"] span{color:#331b21}.copper-agenda-list{margin-top:18px}.copper-agenda-list h3{color:#f3ebdd;font-size:17px}.copper-booking-actions{display:flex;gap:7px;margin-top:10px}.copper-booking-actions button{border:1px solid #70543e;border-radius:8px;background:#203440;color:#f3ebdd;padding:7px 11px;font-size:12px}.copper-agenda-hint{color:#c9bdb1;font-size:12px;line-height:1.5}';
document.head.appendChild(style);
const list=document.createElement('div');list.className='copper-agenda-list';host.appendChild(list);
let loadedUser=null,loading=false;
const api=()=>typeof supabaseClient!=='undefined'&&supabaseClient&&window.titoAccess?.user?supabaseClient:null;
function el(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
function card(job){
 const box=el('article','copper-booking'),dateBox=el('div','copper-booking-date');dateBox.dataset.status=job.estado;
 const [year,month,day]=String(job.fecha||'').split('-').map(Number);
 const mon=month?new Intl.DateTimeFormat('es-PE',{month:'short'}).format(new Date(year,month-1,1)).toUpperCase():'';
 dateBox.append(el('span','',mon),el('strong','',String(day||'--').padStart(2,'0')));
 const info=el('div','copper-booking-info'), name=el('div','copper-booking-name',job.nombre);
 const time=[job.inicio?.slice(0,5),job.fin?.slice(0,5)].filter(Boolean).join('–');
 info.append(name,el('div','copper-booking-meta',[job.tipo,job.cliente,time].filter(Boolean).join(' · ')));
 const bottom=el('div','copper-booking-bottom');
 bottom.append(el('span','copper-booking-money','S/ '+Number(job.tarifa||0).toLocaleString('es-PE',{maximumFractionDigits:2})),el('span','copper-booking-status',job.estado));
 info.append(bottom);
 const actions=el('div','copper-booking-actions'),state=el('button','','Cambiar estado');state.type='button';
 state.onclick=async()=>{
  const next=job.estado==='Tentativo'?'Confirmado':job.estado==='Confirmado'?'Cancelado':'Tentativo';
  if(next==='Confirmado'&&!confirm('¿Confirmar este rodaje? Quedará marcado como ocupado en tu agenda. Todavía no crea deuda ni cliente.'))return;
  state.disabled=true;
  const {error}=await api().from('agenda_trabajos').update({estado:next,updated_at:new Date().toISOString()}).eq('id',job.id);
  if(error){alert('No se pudo actualizar: '+error.message);state.disabled=false;return}
  await refresh();
 };
 actions.append(state);info.append(actions);box.append(dateBox,info);return box;
}
async function refresh(){
 const client=api();if(!client){list.replaceChildren(el('p','copper-agenda-hint','Inicia sesión para ver tus trabajos.'));return}
 if(loading)return;loading=true;
 try{
 const {data,error}=await client.from('agenda_trabajos').select('id,tipo,nombre,cliente,rol,fecha,inicio,fin,lugar,estado,tarifa,notas').order('fecha',{ascending:true});
 if(error)throw error;
 list.replaceChildren(el('h3','','Trabajos agendados'));
 if(!data?.length)list.append(el('p','copper-agenda-hint','Todavía no hay trabajos guardados.'));
 for(const job of data||[])list.append(card(job));
 loadedUser=window.titoAccess.user.id;
 }catch(e){list.replaceChildren(el('p','copper-agenda-hint','No se pudo cargar Agenda: '+e.message))}
 finally{loading=false}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();e.stopImmediatePropagation();
 const client=api();if(!client){alert('Inicia sesión para guardar el trabajo.');return}
 if(!form.reportValidity())return;
 const f=Object.fromEntries(new FormData(form).entries());
 if(f.inicio&&f.fin&&f.inicio>=f.fin){alert('La hora final debe ser posterior a la inicial.');return}
 const save=form.querySelector('[type="submit"]');save.disabled=true;const original=save.textContent;save.textContent='Guardando…';
 try{
  const payload={tipo:f.tipo,nombre:f.nombre.trim(),cliente:f.cliente||'',rol:f.rol||'',fecha:f.fecha,inicio:f.inicio||null,fin:f.fin||null,lugar:f.lugar||'',estado:f.estado,tarifa:Number(f.tarifa||0),notas:f.notas||''};
  const {data:existing,error:lookupError}=await client.from('agenda_trabajos').select('id,nombre,estado,inicio,fin').eq('fecha',payload.fecha).neq('estado','Cancelado');
  if(lookupError)throw lookupError;
  if(existing?.length && !confirm('Ya hay '+existing.length+' reserva(s) activa(s) en esta fecha. ¿Guardar igualmente?'))return;
  const {error}=await client.from('agenda_trabajos').insert(payload);
  if(error)throw error;
  wrap.hidden=true;form.reset();await refresh();
 }catch(err){alert('No se pudo guardar: '+err.message)}
 finally{save.disabled=false;save.textContent=original}
},true);
host.addEventListener('click',()=>{if(api()&&loadedUser!==window.titoAccess.user.id)refresh()});
const observer=setInterval(()=>{if(!document.getElementById('tito-app')){clearInterval(observer);return}if(host.classList.contains('active-section')&&api()&&loadedUser!==window.titoAccess.user.id)refresh()},1500);
window.addEventListener('tito-cloud-status',()=>{if(host.classList.contains('active-section'))refresh()});
window.addEventListener('pagehide',()=>clearInterval(observer));
})();