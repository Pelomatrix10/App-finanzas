(function(){
  function applyRoleUI(){
    const access = window.titoAccess;
    const section = document.getElementById('tab-config');
    if(!access || !section) return false;

    const isAdmin = access.isAdmin === true;
    const children = Array.from(section.children);
    let insideBackup = false;

    for(const el of children){
      const text = (el.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();

      if(text.includes('aquí puedes guardar una copia completa de tus datos')){
        insideBackup = true;
      }

      if(insideBackup){
        el.style.display = isAdmin ? '' : 'none';
      }

      if(text.includes('recomendación: exporta una copia antes de cambios grandes en la app')){
        insideBackup = false;
      }
    }

    return true;
  }

  let tries = 0;
  const timer = setInterval(()=>{
    tries++;
    if(applyRoleUI() || tries > 150){
      clearInterval(timer);
    }
  },100);

  window.addEventListener('tito-cloud-status', applyRoleUI);
})();
