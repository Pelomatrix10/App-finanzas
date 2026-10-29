(function(){
  if(typeof renderClientes!=='function') return;
  const renderBase=renderClientes;
  let selected=typeof mesActual==='function'?mesActual():'all';
  let agendaJobs=[],agendaUser=null,agendaRequest=0;
  function jobsFor(client){
    if(agendaUser!==window.titoAccess?.user?.id)return [];
    return agendaJobs.filter(job=>job.cliente_ref?.legacy_id===client.id);
  }
  function agendaSummary(){
    clientes.forEach(client=>{
      const frame=document.getElementById('frame-'+client.id);
      if(!frame)return;
      const jobs=jobsFor(client);
      if(!jobs.length)return;
      const note=document.createElement('div');
      note.className='tito-client-agenda-summary';
      note.style.cssText='padding:0 18px 14px;color:var(--paper-dim);font-size:12px;line-height:1.6;overflow-wrap:anywhere';
      const heading=document.createElement('div');heading.textContent='RODAJES EN AGENDA · SIN COBRO GENERADO';heading.style.cssText='color:var(--brass);font-size:10px;letter-spacing:.06em;margin-bottom:5px';
      note.appendChild(heading);
      for(const job of jobs){
        const line=document.createElement('div');
        line.textContent=job.nombre+' · '+job.fecha.split('-').reverse().join('/')+' · '+job.estado+' · tarifa prevista '+fmt(Number(job.tarifa||0));
        note.appendChild(line);
      }
      frame.querySelector('.frame-top').after(note);
    });
  }
  async function refreshAgenda(){
    const request=++agendaRequest;
    const user=window.titoAccess?.user?.id;
    if(!user||typeof supabaseClient==='undefined'||!supabaseClient){agendaJobs=[];agendaUser=null;renderClientes();return;}
    if(agendaUser!==user){agendaJobs=[];agendaUser=user;}
    try{
      const {data,error}=await supabaseClient.from('agenda_trabajos')
        .select('id,nombre,fecha,estado,tarifa,cliente_ref:clientes(legacy_id)')
        .eq('user_id',user).not('cliente_id','is',null).order('fecha',{ascending:true});
      if(error)throw error;
      if(request!==agendaRequest||window.titoAccess?.user?.id!==user)return;
      agendaJobs=data||[];renderClientes();
    }catch(error){console.error('TiTo: no se pudieron cargar los rodajes de Clientes',error);}
  }
  function previousMonth(){
    const [year,month]=mesActual().split('-').map(Number);
    const d=new Date(year,month-2,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function ensureBar(){
    const section=document.getElementById('tab-clientes');
    const anchor=section&&section.querySelector('.add-row');
    if(!anchor) return;
    let bar=document.getElementById('tito-client-months');
    if(bar) return bar;
    bar=document.createElement('div');
    bar.id='tito-client-months';
    bar.setAttribute('role','group');
    bar.setAttribute('aria-label','Filtrar clientes por mes');
    bar.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:16px 0;padding:5px;background:rgba(11,32,54,.55);border:1px solid var(--line);border-radius:12px;';
    const now=mesActual(), prev=previousMonth();
    [[prev,nombreMes(prev).split(' ')[0]],[now,nombreMes(now).split(' ')[0]],['all','Todos']].forEach(([month,label])=>{
      const btn=document.createElement('button');
      btn.type='button';btn.dataset.month=month;btn.textContent=label;
      btn.style.cssText='min-width:0;border:0;border-radius:9px;padding:12px 3px;background:transparent;color:var(--paper-dim);font-size:12px;font-weight:650;cursor:pointer;';
      btn.addEventListener('click',()=>{selected=month;renderClientes();});
      bar.appendChild(btn);
    });
    anchor.insertAdjacentElement('beforebegin',bar);
    return bar;
  }
  function latestActivity(project){
    return [fechaCreacion(project),project.fechaFacturacion,fechaPago(project)].filter(Boolean).sort().pop()||'';
  }
  function reorderClients(){
    const container=document.getElementById('lista-clientes');
    if(!container)return;
    const ordered=clientes.map((client,index)=>({
      client,index,
      latest:(client.proyectos||[]).filter(p=>selected==='all'||String(fechaCreacion(p)||'').slice(0,7)===selected).map(latestActivity).sort().pop()||''
    })).sort((a,b)=>b.latest.localeCompare(a.latest)||a.index-b.index);
    ordered.forEach(({client})=>{const frame=document.getElementById('frame-'+client.id);if(frame)container.appendChild(frame);});
  }
  function applyMonth(){
    const bar=ensureBar();
    if(!bar) return;
    bar.querySelectorAll('button').forEach(btn=>{
      const active=btn.dataset.month===selected;
      btn.style.background=active?'var(--brass-soft,rgba(201,130,74,.19))':'transparent';
      btn.style.color=active?'var(--brass,#C9824A)':'var(--paper-dim)';
      btn.setAttribute('aria-pressed',String(active));
    });
    if(selected==='all'){reorderClients();return;}
    let visible=0, total=0, projectCount=0,directoryCount=0;
    clientes.forEach(c=>{
      const frame=document.getElementById('frame-'+c.id);
      if(!frame)return;
      const projects=c.proyectos||[];
      const rows=frame.querySelectorAll('.frame-detail > .detail-row');
      let count=0, sum=0;
      projects.forEach((p,i)=>{
        const match=String(fechaCreacion(p)||'').slice(0,7)===selected;
        if(rows[i])rows[i].style.display=match?'':'none';
        if(match){count++;sum+=Number(p.monto||0);}
      });
      const directoryOnly=!projects.length||jobsFor(c).some(job=>job.estado!=='Cancelado');
      frame.style.display=count||directoryOnly?'':'none';
      if(!count&&directoryOnly)directoryCount++;
      if(count){
        visible++;projectCount+=count;total+=sum;
        const meta=frame.querySelector('.frame-meta');
        if(meta)meta.textContent=count+' proyecto'+(count===1?'':'s')+' · total del mes '+fmt(sum);
      }
    });
    reorderClients();
    const nar=document.getElementById('narrativa-clientes');
    if(nar)nar.textContent=(visible
      ?nombreMes(selected)+': '+projectCount+' proyecto'+(projectCount===1?'':'s')+' en '+visible+' cliente'+(visible===1?'':'s')+' · '+fmt(total)+'. Las deudas indican el total pendiente, incluso de otros meses.'
      :'No hay proyectos de cobro registrados en '+nombreMes(selected)+'. Puedes consultar otro mes en Todos.')
      +(directoryCount?' También se muestran '+directoryCount+' cliente'+(directoryCount===1?'':'s')+' sin cobros en este mes; los rodajes de Agenda no generan deuda.':'');
  }
  renderClientes=function(){
    renderBase();
    applyMonth();
    agendaSummary();
  };
  window.addEventListener('tito-cloud-status',event=>{if(['ready','synced'].includes(event.detail?.status))refreshAgenda();});
  window.addEventListener('tito-agenda-updated',refreshAgenda);
  renderClientes();
  if(window.__titoCloudReady)refreshAgenda();
})();