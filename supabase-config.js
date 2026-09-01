// Esta clave es publicable y está diseñada para usarse en el navegador.
// Nunca añadas aquí una clave service_role ni secretos de proveedores OAuth.
window.TITO_SUPABASE_CONFIG = Object.freeze({
  url: 'https://tphnmrxjvgomlhcsmtxt.supabase.co',
  publishableKey: 'sb_publishable_o-GGRYIMiWRewRonhyZEsA_AIUuIyJh'
});

// TiTo Cloud Sync v1
// Mantiene la API actual de la app intacta: localStorage funciona como caché,
// mientras Supabase pasa a ser la fuente principal por usuario autenticado.
(function(){
  const LEGACY_KEY = 'estudio_app_completa_v1';
  const rawGet = Storage.prototype.getItem;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;

  function scopedKey(storage,key){
    if(storage !== localStorage || key !== LEGACY_KEY) return null;
    const access = window.titoAccess;
    const uid = access && access.user && access.user.id;
    return uid ? `${LEGACY_KEY}::${uid}` : null;
  }

  Storage.prototype.getItem = function(key){
    const scoped = scopedKey(this,key);
    if(!scoped) return rawGet.call(this,key);
    let value = rawGet.call(this,scoped);
    // Solo el administrador puede adoptar la antigua copia sin nombre de usuario.
    // Así evitamos que un tester nuevo herede datos locales de otra cuenta.
    if(value === null && window.titoAccess && window.titoAccess.isAdmin){
      const legacy = rawGet.call(this,LEGACY_KEY);
      if(legacy !== null){
        rawSet.call(this,scoped,legacy);
        value = legacy;
      }
    }
    return value;
  };

  Storage.prototype.setItem = function(key,value){
    const scoped = scopedKey(this,key);
    return rawSet.call(this,scoped || key,value);
  };

  Storage.prototype.removeItem = function(key){
    const scoped = scopedKey(this,key);
    return rawRemove.call(this,scoped || key);
  };

  let cloudReady = false;
  let syncTimer = null;
  let originalGuardar = null;

  function snapshotActual(){
    return {
      clientes: Array.isArray(clientes) ? clientes : [],
      colaboradores: Array.isArray(colaboradores) ? colaboradores : [],
      equipo: Array.isArray(equipo) ? equipo : []
    };
  }

  async function enviarSnapshot(){
    if(!cloudReady || !supabaseClient || !window.titoAccess || !window.titoAccess.user) return;
    const snapshot = snapshotActual();
    const {error} = await supabaseClient.rpc('sync_tito_snapshot',{snapshot});
    if(error){
      console.error('TiTo: no se pudo sincronizar con Supabase',error);
      window.dispatchEvent(new CustomEvent('tito-cloud-status',{detail:{status:'error',message:error.message}}));
      return;
    }
    window.dispatchEvent(new CustomEvent('tito-cloud-status',{detail:{status:'synced'}}));
  }

  function programarSync(){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(enviarSnapshot,350);
  }

  async function activarCloud(){
    if(window.__titoCloudSyncStarted) return;
    if(typeof supabaseClient === 'undefined' || !supabaseClient || !window.titoAccess || !window.titoAccess.user) return;
    if(typeof guardar !== 'function' || typeof renderAll !== 'function') return;
    window.__titoCloudSyncStarted = true;

    originalGuardar = guardar;
    guardar = function(){
      originalGuardar();
      if(cloudReady) programarSync();
    };

    try{
      const {data,error} = await supabaseClient.rpc('load_tito_snapshot');
      if(error) throw error;
      if(data && typeof data === 'object'){
        clientes = Array.isArray(data.clientes) ? data.clientes : [];
        colaboradores = Array.isArray(data.colaboradores) ? data.colaboradores : [];
        equipo = Array.isArray(data.equipo) ? data.equipo : [];
        if(typeof recalcularIds === 'function') recalcularIds();
        originalGuardar();
        renderAll();
      }
      cloudReady = true;
      window.__titoCloudReady = true;
      window.dispatchEvent(new CustomEvent('tito-cloud-status',{detail:{status:'ready'}}));
    }catch(error){
      // Sin conexión o fallo remoto: TiTo conserva y usa el caché local de este usuario.
      console.error('TiTo: usando caché local; Supabase no respondió',error);
      cloudReady = false;
      window.__titoCloudReady = false;
      window.dispatchEvent(new CustomEvent('tito-cloud-status',{detail:{status:'offline',message:error.message}}));
    }
  }

  window.addEventListener('load',()=>{
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(window.titoAccess && typeof supabaseClient !== 'undefined' && supabaseClient && typeof guardar === 'function'){
        clearInterval(timer);
        activarCloud();
      }else if(tries>150){
        clearInterval(timer);
      }
    },100);
  });
})();
