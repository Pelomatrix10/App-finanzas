(function(){
  function mesDeFecha(f){
    if(!f) return '';
    const m=String(f).slice(0,7);
    return /^\d{4}-\d{2}$/.test(m)?m:'';
  }

  function movimientosDelMes(mes){
    const items=[];
    clientes.forEach(c=>(c.proyectos||[]).forEach(p=>{
      const fecha=p.estado==='pagado'?fechaPago(p):fechaCreacion(p);
      if(mesDeFecha(fecha)!==mes) return;
      items.push({fecha:String(fecha||''),tipo:p.estado==='pagado'?'Cobro':'Proyecto pendiente',titulo:c.nombre,detalle:p.concepto,monto:Number(p.monto||0),signo:p.estado==='pagado'?'+':'',clase:p.estado==='pagado'?'pagado':'pendiente'});
    }));

    colaboradores.forEach(c=>(c.pagos||[]).forEach(p=>{
      const fecha=p.estado==='pagado'?fechaPago(p):fechaCreacion(p);
      if(mesDeFecha(fecha)!==mes) return;
      items.push({fecha:String(fecha||''),tipo:p.estado==='pagado'?'Pago al equipo':'Pago pendiente',titulo:c.nombre,detalle:p.concepto,monto:Number(p.monto||0),signo:p.estado==='pagado'?'-':'',clase:p.estado==='pagado'?'debe':'pendiente'});
    }));

    equipo.forEach(e=>{
      if(mesDeFecha(e.fecha)!==mes) return;
      items.push({fecha:String(e.fecha||''),tipo:'Gear',titulo:e.nombre,detalle:e.categoria||'Equipo',monto:Number(e.monto||0),signo:'',clase:''});
    });

    return items.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  }

  function asegurarHubMensual(){
    const breakdown=document.getElementById('lista-breakdown');
    if(!breakdown) return;
    const bloque=breakdown.parentElement;
    if(bloque) bloque.style.display='none';

    const kicker=document.querySelector('#tab-resumen .summary-kicker');
    if(kicker) kicker.style.display='none';

    if(document.getElementById('summary-month-hub')) return;

    const hub=document.createElement('div');
    hub.id='summary-month-hub';
    hub.className='editorial-card';
    hub.style.marginTop='20px';
    hub.style.padding='16px';

    const head=document.createElement('div');
    head.className='editorial-head';
    head.style.marginBottom='12px';
    head.innerHTML='<h3 style="margin:0">Mes del resumen</h3><span>Histórico</span>';
    hub.appendChild(head);

    const monthControl=document.querySelector('#tab-resumen .month-control');
    if(monthControl){
      monthControl.style.margin='0 0 12px';
      monthControl.style.padding='0';
      hub.appendChild(monthControl);
    }

    const card=document.createElement('button');
    card.id='summary-movements-cta';
    card.type='button';
    card.className='btn btn-ghost btn-block';
    card.style.padding='14px 15px';
    card.style.textAlign='left';
    card.style.display='flex';
    card.style.justifyContent='space-between';
    card.style.alignItems='center';
    card.innerHTML='<span><strong style="display:block;font-size:16px">Ver movimientos</strong><small id="summary-movements-label" style="display:block;margin-top:4px;color:var(--paper-dim);font-family:Inter,sans-serif;letter-spacing:0;text-transform:none"></small></span><span aria-hidden="true" style="font-size:22px">→</span>';
    card.addEventListener('click',abrirMovimientos);
    hub.appendChild(card);

    (bloque||breakdown).insertAdjacentElement('beforebegin',hub);
  }

  function actualizarHub(){
    asegurarHubMensual();
    const label=document.getElementById('summary-movements-label');
    if(label) label.textContent=nombreMes(resumenMes);
  }

  function renderPanel(){
    const section=document.getElementById('tab-cobros');
    if(!section) return;
    let panel=document.getElementById('movimientos-mes-panel');
    if(!panel){
      panel=document.createElement('div');
      panel.id='movimientos-mes-panel';
      panel.style.marginBottom='22px';
      section.insertAdjacentElement('afterbegin',panel);
    }
    const items=movimientosDelMes(resumenMes);
    panel.innerHTML=`
      <div class="section-title">Movimientos · ${esc(nombreMes(resumenMes))}</div>
      <div style="font-size:12px;color:var(--paper-dim);margin:0 2px 12px">Actividad registrada durante el mes seleccionado.</div>
      ${items.length?items.map(x=>`<div class="cobro-row"><div class="cobro-left"><div class="cliente">${esc(x.tipo)}</div><div class="concepto">${esc(x.titulo)} · ${esc(x.detalle)}</div><div class="fecha" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-dim)">${esc(x.fecha)}</div></div><div class="cobro-right"><div class="cobro-monto ${x.clase}">${esc(x.signo)}${fmt(x.monto)}</div></div></div>`).join(''):'<div class="empty">No hay movimientos registrados en este mes.</div>'}
    `;
  }

  function activarPestana(tab){
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    document.querySelectorAll('main>section').forEach(s=>s.classList.toggle('active-section',s.id==='tab-'+tab));
    if(typeof renderAll==='function') renderAll();
  }

  function abrirMovimientos(){
    renderPanel();
    activarPestana('cobros');
    requestAnimationFrame(()=>{
      const panel=document.getElementById('movimientos-mes-panel');
      if(panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  if(typeof renderResumen==='function'){
    const renderResumenBase=renderResumen;
    renderResumen=function(){renderResumenBase();actualizarHub();};
  }

  asegurarHubMensual();
  actualizarHub();
  if(typeof renderAll==='function') renderAll();
})();
