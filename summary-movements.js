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

  function importe(item){return Number(item.monto)||0;}
  function sumar(items){return items.reduce((total,item)=>total+importe(item),0);}
  function desplazarMes(mes,offset){const [year,month]=mes.split('-').map(Number);return new Date(Date.UTC(year,month-1+offset,1)).toISOString().slice(0,7);}
  function finanzasDelMes(mes){
    const proyectos=clientes.flatMap(c=>c.proyectos||[]);
    const pagos=colaboradores.flatMap(c=>c.pagos||[]);
    const cobrado=sumar(proyectos.filter(p=>estadoProyecto(p)==='pagado'&&mesDeFecha(fechaPago(p))===mes));
    const pagadoEquipo=sumar(pagos.filter(p=>p.estado==='pagado'&&mesDeFecha(fechaPago(p))===mes));
    const gear=sumar(equipo.filter(e=>mesDeFecha(e.fecha)===mes));
    const pendiente=sumar(proyectos.filter(p=>estadoProyecto(p)!=='pagado'));
    const facturado=sumar(proyectos.filter(p=>estadoProyecto(p)==='facturado'));
    return {mes,cobrado,pagadoEquipo,saldo:cobrado-pagadoEquipo,gear,pendiente,facturado};
  }
  function tarjetaAnalitica(label,value,note,kind){
    return '<article class="analytics-stat '+(kind||'')+'"><h3>'+esc(label)+'</h3><strong>'+fmt(value)+'</strong><p>'+esc(note)+'</p></article>';
  }
  function renderAnaliticas(mes){
    const actual=finanzasDelMes(mes),anterior=finanzasDelMes(desplazarMes(mes,-1));
    const diferencia=actual.cobrado-anterior.cobrado;
    const comparacion=anterior.cobrado===0
      ?(actual.cobrado===0?'No hay cobros registrados en este mes ni en el anterior.':'El mes anterior no registra cobros para calcular una variación porcentual.')
      :diferencia===0?'Cobraste el mismo importe que el mes anterior.'
      :'Cobraste '+fmt(Math.abs(diferencia))+' '+(diferencia>0?'más':'menos')+' que en '+nombreMes(anterior.mes)+' ('+(Math.abs(diferencia)/anterior.cobrado*100).toLocaleString('es-PE',{maximumFractionDigits:1})+'%).';
    const meses=Array.from({length:6},(_,i)=>finanzasDelMes(desplazarMes(mes,i-5)));
    const maximo=Math.max(1,...meses.flatMap(m=>[m.cobrado,m.pagadoEquipo]));
    const ranking=clientes.map(c=>({nombre:c.nombre,total:sumar((c.proyectos||[]).filter(p=>estadoProyecto(p)==='pagado'&&mesDeFecha(fechaPago(p))===mes))})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
    const opciones=document.getElementById('resumen-mes')?.innerHTML||'<option value="'+esc(mes)+'">'+esc(nombreMes(mes))+'</option>';
    return '<div class="financial-analytics">'+
      '<div class="analytics-heading"><div><div class="summary-kicker">FINANZAS DEL ESTUDIO</div><h2>Cómo va tu mes</h2><p>'+esc(nombreMes(mes))+' · según los registros de TiTo</p></div>'+
      '<label class="analytics-month">Mes de análisis<select id="movimientos-mes-selector">'+opciones+'</select></label></div>'+
      '<div class="analytics-stats">'+
      tarjetaAnalitica('Cobrado en el mes',actual.cobrado,'Cobros de clientes registrados como pagados.','incoming')+
      tarjetaAnalitica('Pagado al equipo',actual.pagadoEquipo,'Pagos a colaboradores realizados en el mes.','outgoing')+
      tarjetaAnalitica('Saldo de cobros y equipo',actual.saldo,'Cobrado menos lo pagado al equipo.',actual.saldo<0?'balance negative':'balance')+
      tarjetaAnalitica('Gear registrado en el mes',actual.gear,'Inversión registrada; se muestra por separado.','')+
      tarjetaAnalitica('Por cobrar actualmente',actual.pendiente,'Pendientes de todos los meses, según su estado actual.','')+
      tarjetaAnalitica('Facturado sin cobrar',actual.facturado,'Parte del total por cobrar; no se suma de nuevo.','')+
      '</div><p class="analytics-scope">El saldo compara únicamente cobros de clientes y pagos al equipo. Las compras de gear y otros gastos no están descontados de ese saldo. Los pendientes no son dinero recibido.</p>'+
      '<p class="analytics-comparison">'+esc(comparacion)+'</p>'+
      '<div class="analytics-panels"><article class="analytics-panel"><h3>Evolución de seis meses</h3>'+
      '<div class="analytics-legend"><span class="incoming">Cobrado</span><span class="outgoing">Pagado al equipo</span></div>'+
      '<div class="analytics-trend" role="img" aria-label="Comparación mensual de cobros y pagos al equipo. Las cifras se encuentran en la tabla siguiente.">'+
      meses.map(m=>'<div class="analytics-trend-month"><div class="analytics-bars"><span class="incoming" style="height:'+(m.cobrado/maximo*100)+'%" title="'+esc(nombreMes(m.mes)+' · cobrado '+fmt(m.cobrado))+'"></span><span class="outgoing" style="height:'+(m.pagadoEquipo/maximo*100)+'%" title="'+esc(nombreMes(m.mes)+' · equipo '+fmt(m.pagadoEquipo))+'"></span></div><span>'+esc(nombreMes(m.mes).split(' ')[0].slice(0,3))+'</span></div>').join('')+
      '</div><details class="analytics-details"><summary>Ver cifras por mes</summary><div class="analytics-table-wrap"><table><caption>Cobros y pagos registrados</caption><thead><tr><th>Mes</th><th>Cobrado</th><th>Equipo</th><th>Saldo</th></tr></thead><tbody>'+
      meses.map(m=>'<tr><th>'+esc(nombreMes(m.mes))+'</th><td>'+fmt(m.cobrado)+'</td><td>'+fmt(m.pagadoEquipo)+'</td><td>'+fmt(m.saldo)+'</td></tr>').join('')+
      '</tbody></table></div></details></article>'+
      '<article class="analytics-panel"><h3>Clientes con más cobros del mes</h3><p class="analytics-scope">Importes recibidos por cliente en el mes seleccionado.</p>'+
      (ranking.length?ranking.map(c=>'<div class="analytics-client"><div><span>'+esc(c.nombre)+'</span><strong>'+fmt(c.total)+'</strong></div><div class="analytics-client-track"><span style="width:'+(c.total/actual.cobrado*100)+'%"></span></div></div>').join(''):'<p class="empty">Todavía no hay cobros registrados en este mes.</p>')+
      '</article></div></div>';
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
    panel.innerHTML=renderAnaliticas(resumenMes)+`
      <div class="section-title">Movimientos · ${esc(nombreMes(resumenMes))}</div>
      <div style="font-size:12px;color:var(--paper-dim);margin:0 2px 12px">Actividad registrada durante el mes seleccionado.</div>
      ${items.length?items.map(x=>`<div class="cobro-row"><div class="cobro-left"><div class="cliente">${esc(x.tipo)}</div><div class="concepto">${esc(x.titulo)} · ${esc(x.detalle)}</div><div class="fecha" style="margin-top:4px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--paper-dim)">${esc(x.fecha)}</div></div><div class="cobro-right"><div class="cobro-monto ${x.clase}">${esc(x.signo)}${fmt(x.monto)}</div></div></div>`).join(''):'<div class="empty">No hay movimientos registrados en este mes.</div>'}
    `;
    const selector=document.getElementById('movimientos-mes-selector');
    if(selector){selector.value=resumenMes;selector.onchange=event=>{resumenMes=event.target.value;if(typeof renderAll==='function')renderAll();};}
  }

  function activarPestana(tab){
    const copper=document.querySelector('.copper-panel [data-copper="'+tab+'"]');
    if(copper){copper.click();return;}
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
    renderResumen=function(){renderResumenBase();actualizarHub();if(document.getElementById('movimientos-mes-panel'))renderPanel();};
  }

  asegurarHubMensual();
  actualizarHub();
  if(typeof renderAll==='function') renderAll();
})();