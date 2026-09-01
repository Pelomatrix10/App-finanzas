(function(){
  const VERSION='v1';

  function keyFor(access){
    const uid=access&&access.user&&access.user.id;
    return uid?`tito_beta_welcome_${VERSION}::${uid}`:null;
  }

  function alreadySeen(access){
    const key=keyFor(access);
    return key?localStorage.getItem(key)==='1':true;
  }

  function markSeen(access){
    const key=keyFor(access);
    if(key) localStorage.setItem(key,'1');
  }

  function showWelcome(){
    const access=window.titoAccess;
    if(!access||!access.user||access.isAdmin===true||alreadySeen(access)) return true;
    if(document.getElementById('tito-beta-welcome')) return true;

    const overlay=document.createElement('div');
    overlay.id='tito-beta-welcome';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','tito-beta-welcome-title');
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:radial-gradient(700px 420px at 50% 8%,rgba(110,128,81,.18),transparent 65%),#0B2036;color:#F4EFE5;display:flex;align-items:center;justify-content:center;padding:28px 22px;padding-top:max(28px,env(safe-area-inset-top));padding-bottom:max(28px,env(safe-area-inset-bottom));font-family:Inter,sans-serif;';

    overlay.innerHTML=`
      <div style="width:100%;max-width:390px;text-align:center;">
        <img src="./assets/tito-logo-master.webp" alt="TiTo" style="width:92px;height:74px;object-fit:cover;border-radius:13px;margin-bottom:28px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#927D6C;margin-bottom:10px;">Beta privada</div>
        <h1 id="tito-beta-welcome-title" style="font-family:Anton,sans-serif;font-size:40px;font-weight:400;line-height:1;margin:0 0 12px;">Bienvenido a TiTo</h1>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.04em;color:#CFC4B7;margin-bottom:24px;">Finanzas para creativos.</div>
        <p style="font-size:14px;line-height:1.65;color:#CFC4B7;margin:0 auto 28px;max-width:330px;">Estás entrando a una beta privada. Úsalo como usarías cualquier herramienta de trabajo. Si algo te confunde, te sobra o no entiendes para qué sirve, eso también cuenta como feedback.</p>
        <button id="tito-beta-enter" type="button" style="width:100%;border:0;border-radius:10px;padding:14px 18px;background:#927D6C;color:#0B2036;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:.04em;cursor:pointer;">Entrar a TiTo</button>
        <div style="margin-top:20px;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#927D6C;">Beta privada · versión en prueba</div>
      </div>`;

    document.body.appendChild(overlay);
    document.body.style.overflow='hidden';

    document.getElementById('tito-beta-enter').addEventListener('click',()=>{
      markSeen(access);
      overlay.remove();
      document.body.style.overflow='';
    });

    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(showWelcome()||tries>200) clearInterval(timer);
  },100);

  window.addEventListener('tito-cloud-status',showWelcome);
})();
