(function(){
  if(typeof renderResumen !== 'function') return;

  renderResumen = function(){
    const proyectos=clientes.flatMap(c=>c.proyectos||[]),pagosEquipo=colaboradores.flatMap(c=>c.pagos||[]),meses=new Set([mesActual()]);
    const addMes=(f)=>{if(f){const m=String(f).slice(0,7);if(/^\d{4}-\d{2}$/.test(m))meses.add(m)}};

    proyectos.forEach(p=>{addMes(fechaCreacion(p));addMes(fechaPago(p));});
    pagosEquipo.forEach(p=>{addMes(fechaCreacion(p));addMes(fechaPago(p));});
    equipo.forEach(e=>addMes(e.fecha));

    const selector=document.getElementById('resumen-mes'),opciones=[...meses].filter(Boolean).sort().reverse();if(!opciones.includes(resumenMes))resumenMes=opciones[0]||mesActual();
    selector.innerHTML=opciones.map(m=>`<option value="${m}" ${m===resumenMes?'selected':''}>${esc(nombreMes(m))}${m===mesActual()?' · actual':''}</option>`).join('');selector.onchange=()=>{resumenMes=selector.value;renderResumen()};

    const cobradosMes=proyectos.filter(p=>p.estado==='pagado'&&String(fechaPago(p)||'').startsWith(resumenMes)),cobrado=cobradosMes.reduce((s,p)=>s+Number(p.monto||0),0),pagadoEquipoMes=pagosEquipo.filter(p=>p.estado==='pagado'&&String(fechaPago(p)||'').startsWith(resumenMes)).reduce((s,p)=>s+Number(p.monto||0),0),resultado=cobrado-pagadoEquipoMes,pend=clientes.reduce((s,c)=>s+totalPendiente(c),0),etiquetaMes=nombreMes(resumenMes);
    document.getElementById('st-cobrado').textContent=fmt(cobrado);document.getElementById('st-proyectos').textContent=String(cobradosMes.length);document.getElementById('st-pagado-equipo').textContent=fmt(pagadoEquipoMes);document.getElementById('st-pendiente').textContent=fmt(pend);document.getElementById('st-balance').textContent=fmt(resultado);
    document.getElementById('st-label-balance').textContent='Resultado · '+etiquetaMes;document.getElementById('st-label-cobrado').textContent='Cobrado · '+etiquetaMes;document.getElementById('st-note-balance').textContent='Ingresos cobrados menos pagos realizados al equipo durante el mes seleccionado.';
    document.getElementById('narrativa-resumen').textContent=cobradosMes.length?`En ${etiquetaMes} cobraste ${fmt(cobrado)} en ${cobradosMes.length} proyecto${cobradosMes.length===1?'':'s'}.`:`En ${etiquetaMes} todavía no hay cobros registrados.`;

    const facturado=proyectos.reduce((s,p)=>s+Number(p.monto||0),0),cobradoTotal=proyectos.filter(p=>p.estado==='pagado').reduce((s,p)=>s+Number(p.monto||0),0),porcentaje=facturado?Math.round(cobradoTotal/facturado*100):0;
    const estado=porcentaje>=100?'100':porcentaje>=75?'75':porcentaje>=50?'50':porcentaje>=25?'25':'00',estadoTexto={"00":"Inicio","25":"En curso","50":"A la mitad","75":"Casi listo","100":"Cobrado"}[estado];
    const gato=document.getElementById('gato-image');gato.src=`./assets/tito-gato-cobro-${estado}.webp`;gato.alt=`Gato de Cobro al ${porcentaje}%`;
    document.getElementById('gato-percent').textContent=porcentaje+'%';document.getElementById('gato-title').textContent=estadoTexto;document.getElementById('gato-progress-bar').style.width=porcentaje+'%';
    document.getElementById('gato-copy').textContent=!proyectos.length?'Registra proyectos para empezar.':porcentaje>=100?'Todos los proyectos registrados están cobrados.':`Has cobrado ${fmt(cobradoTotal)} de ${fmt(facturado)}.`;

    const ranking=clientes.slice().sort((a,b)=>totalFacturado(b)-totalFacturado(a)).slice(0,5),maxTotal=Math.max(1,...ranking.map(totalFacturado)),chart=document.getElementById('client-chart');
    chart.innerHTML=ranking.length?ranking.map(c=>`<div class="chart-col" title="${esc(c.nombre)}: ${fmt(totalFacturado(c))}"><div class="chart-bar" style="height:${Math.max(6,totalFacturado(c)/maxTotal*88)}px"></div><div class="chart-label">${esc(c.nombre)}</div></div>`).join(''):'<div class="empty" style="margin:auto">Agrega clientes y proyectos para ver el gráfico.</div>';
    const cont=document.getElementById('lista-breakdown');cont.innerHTML=clientes.length?'':'<div class="empty">Sin datos todavía.</div>';
    clientes.slice().sort((a,b)=>totalFacturado(b)-totalFacturado(a)).forEach(c=>{const p=totalPendiente(c);cont.insertAdjacentHTML('beforeend',`<div class="cobro-row"><div class="cobro-left"><div class="cliente">${esc(c.nombre)}</div><div class="concepto">${(c.proyectos||[]).length} proyecto${(c.proyectos||[]).length===1?'':'s'}</div></div><div class="cobro-right"><div class="cobro-monto">${fmt(totalFacturado(c))}</div><span class="estado-pill ${p?'estado-pendiente':'estado-al-dia'}">${p?'debe '+fmt(p):'al día'}</span></div></div>`)});
  };

  if(typeof renderAll === 'function') renderAll();
})();
