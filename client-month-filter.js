(function(){
  if(typeof renderClientes!=='function') return;
  const renderBase=renderClientes;
  let selected=typeof mesActual==='function'?mesActual():'all';
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
    [[now,nombreMes(now).split(' ')[0]],[prev,nombreMes(prev).split(' ')[0]],['all','Todos']].forEach(([month,label])=>{
      const btn=document.createElement('button');
      btn.type='button';btn.dataset.month=month;btn.textContent=label;
      btn.style.cssText='min-width:0;border:0;border-radius:9px;padding:12px 3px;background:transparent;color:var(--paper-dim);font-size:12px;font-weight:650;cursor:pointer;';
      btn.addEventListener('click',()=>{selected=month;renderClientes();});
      bar.appendChild(btn);
    });
    anchor.insertAdjacentElement('beforebegin',bar);
    return bar;
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
    if(selected==='all')return;
    let visible=0, total=0, projectCount=0;
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
      frame.style.display=count?'':'none';
      if(count){
        visible++;projectCount+=count;total+=sum;
        const meta=frame.querySelector('.frame-meta');
        if(meta)meta.textContent=count+' proyecto'+(count===1?'':'s')+' · total del mes '+fmt(sum);
      }
    });
    const nar=document.getElementById('narrativa-clientes');
    if(nar)nar.textContent=visible
      ?nombreMes(selected)+': '+projectCount+' proyecto'+(projectCount===1?'':'s')+' en '+visible+' cliente'+(visible===1?'':'s')+' · '+fmt(total)+'. Las deudas indican el total pendiente, incluso de otros meses.'
      :'No hay proyectos registrados en '+nombreMes(selected)+'. Puedes consultar otro mes en Todos.';
  }
  renderClientes=function(){
    renderBase();
    applyMonth();
  };
  renderClientes();
})();