grant select,insert,update,delete on public.clientes,public.proyectos,public.colaboradores,public.pagos,public.gear to authenticated;
-- Agenda links never create projects or payments. No historical data rewrite.
create or replace function public.tito_client_key(value text) returns text
language sql immutable strict security invoker set search_path='' as $$
 select lower(regexp_replace(btrim(value), '\s+', ' ', 'g'));
$$;
create unique index clientes_owner_name_key on public.clientes(user_id,public.tito_client_key(nombre));

create or replace function public.tito_agenda_owner_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.cliente_id is not null and not exists(select 1 from public.clientes c where c.id=new.cliente_id and c.user_id=new.user_id) then
  raise exception 'El cliente no pertenece a esta cuenta.';
 end if;
 return new;
end; $$;
create trigger agenda_client_owner before insert or update of cliente_id,user_id on public.agenda_trabajos for each row execute function public.tito_agenda_owner_guard();

create or replace function public.save_agenda_with_client(job_id uuid, job jsonb, selected_client uuid default null, create_client boolean default false)
returns public.agenda_trabajos language plpgsql security invoker set search_path='' as $$
declare
 uid uuid:=auth.uid(); cid uuid:=selected_client; cname text; result public.agenda_trabajos; next_legacy bigint;
begin
 if uid is null or not public.has_beta_access() then raise exception 'Acceso denegado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if exists(select 1 from public.agenda_trabajos where id=job_id and user_id<>uid) then raise exception 'Rodaje no disponible.'; end if;
 cname:=btrim(coalesce(job->>'cliente',''));
 if cid is not null then
  select nombre into cname from public.clientes where id=cid and user_id=uid;
  if not found then raise exception 'Selecciona un cliente de tu cuenta.'; end if;
 elsif create_client then
  if job->>'estado'<>'Confirmado' then raise exception 'Confirma el rodaje antes de crear un cliente.'; end if;
  if length(cname)<1 or length(cname)>120 then raise exception 'El nombre del cliente debe tener entre 1 y 120 caracteres.'; end if;
  select id,nombre into cid,cname from public.clientes where user_id=uid and public.tito_client_key(nombre)=public.tito_client_key(job->>'cliente');
  if not found then
   cname:=btrim(job->>'cliente');
   select least(coalesce(min(legacy_id),0),0)-1 into next_legacy from public.clientes where user_id=uid;
   insert into public.clientes(user_id,legacy_id,nombre) values(uid,next_legacy,cname) returning id into cid;
  end if;
 end if;
 if job->>'estado'='Confirmado' and cid is null then raise exception 'Selecciona un cliente existente o autoriza crear uno nuevo.'; end if;
 insert into public.agenda_trabajos(id,user_id,tipo,nombre,cliente,cliente_id,rol,fecha,inicio,fin,lugar,estado,tarifa,notas)
 values(job_id,uid,job->>'tipo',btrim(job->>'nombre'),coalesce(cname,''),cid,coalesce(job->>'rol',''),(job->>'fecha')::date,nullif(job->>'inicio','')::time,nullif(job->>'fin','')::time,coalesce(job->>'lugar',''),job->>'estado',coalesce((job->>'tarifa')::numeric,0),coalesce(job->>'notas',''))
 on conflict(id) do update set tipo=excluded.tipo,nombre=excluded.nombre,cliente=excluded.cliente,cliente_id=excluded.cliente_id,rol=excluded.rol,fecha=excluded.fecha,inicio=excluded.inicio,fin=excluded.fin,lugar=excluded.lugar,estado=excluded.estado,tarifa=excluded.tarifa,notas=excluded.notas,updated_at=now()
 where agenda_trabajos.user_id=uid returning * into result;
 if result.id is null then raise exception 'No se pudo guardar el rodaje.'; end if;
 if result.inicio is not null and result.fin is not null and result.inicio>=result.fin then raise exception 'La hora final debe ser posterior a la inicial.'; end if;
 return result;
end; $$;
revoke all on function public.save_agenda_with_client(uuid,jsonb,uuid,boolean) from public,anon;
grant execute on function public.save_agenda_with_client(uuid,jsonb,uuid,boolean) to authenticated;

-- Preserve UUIDs and unchanged rows during legacy snapshot synchronization.
create or replace function public.sync_tito_snapshot(snapshot jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); c jsonb; p jsonb; g jsonb; client_uuid uuid; collab_uuid uuid;
begin
 if uid is null or not public.has_beta_access() then raise exception 'Acceso denegado.'; end if;
 if jsonb_typeof(snapshot->'clientes') is distinct from 'array' or jsonb_typeof(snapshot->'colaboradores') is distinct from 'array' or jsonb_typeof(snapshot->'equipo') is distinct from 'array' then raise exception 'Snapshot incompleto.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
for c in select value from jsonb_array_elements(snapshot->'clientes') loop
insert into public.clientes as dest(user_id,legacy_id,nombre,nota) values(uid,(c->>'id')::bigint,coalesce(c->>'nombre','Sin nombre'),nullif(c->>'nota','')) on conflict(user_id,legacy_id) where legacy_id is not null do update set nombre=excluded.nombre,nota=excluded.nota where (dest.nombre,dest.nota) is distinct from (excluded.nombre,excluded.nota);
select id into strict client_uuid from public.clientes where user_id=uid and legacy_id=(c->>'id')::bigint;
for p in select value from jsonb_array_elements(coalesce(c->'proyectos','[]')) loop
insert into public.proyectos as dest(user_id,legacy_id,cliente_id,concepto,monto,estado,fecha) values(uid,(p->>'id')::bigint,client_uuid,coalesce(p->>'concepto','Sin concepto'),greatest(coalesce((p->>'monto')::numeric,0),0),case when p->>'estado' in ('realizado','facturado','pagado') then p->>'estado' else 'pendiente' end,coalesce((p->>'fecha')::date,current_date)) on conflict(user_id,legacy_id) where legacy_id is not null do update set cliente_id=excluded.cliente_id,concepto=excluded.concepto,monto=excluded.monto,estado=excluded.estado,fecha=excluded.fecha where (dest.cliente_id,dest.concepto,dest.monto,dest.estado,dest.fecha) is distinct from (excluded.cliente_id,excluded.concepto,excluded.monto,excluded.estado,excluded.fecha);
end loop; end loop;
for c in select value from jsonb_array_elements(snapshot->'colaboradores') loop
insert into public.colaboradores as dest(user_id,legacy_id,nombre,rol) values(uid,(c->>'id')::bigint,coalesce(c->>'nombre','Sin nombre'),nullif(c->>'rol','')) on conflict(user_id,legacy_id) where legacy_id is not null do update set nombre=excluded.nombre,rol=excluded.rol where (dest.nombre,dest.rol) is distinct from (excluded.nombre,excluded.rol);
select id into strict collab_uuid from public.colaboradores where user_id=uid and legacy_id=(c->>'id')::bigint;
for p in select value from jsonb_array_elements(coalesce(c->'pagos','[]')) loop
insert into public.pagos as dest(user_id,legacy_id,colaborador_id,concepto,monto,estado,fecha) values(uid,(p->>'id')::bigint,collab_uuid,coalesce(p->>'concepto','Sin concepto'),greatest(coalesce((p->>'monto')::numeric,0),0),case when p->>'estado'='pagado' then 'pagado' else 'pendiente' end,coalesce((p->>'fecha')::date,current_date)) on conflict(user_id,legacy_id) where legacy_id is not null do update set colaborador_id=excluded.colaborador_id,concepto=excluded.concepto,monto=excluded.monto,estado=excluded.estado,fecha=excluded.fecha where (dest.colaborador_id,dest.concepto,dest.monto,dest.estado,dest.fecha) is distinct from (excluded.colaborador_id,excluded.concepto,excluded.monto,excluded.estado,excluded.fecha);
end loop; end loop;
for g in select value from jsonb_array_elements(snapshot->'equipo') loop
insert into public.gear as dest(user_id,legacy_id,nombre,categoria,monto,fecha) values(uid,(g->>'id')::bigint,coalesce(g->>'nombre','Sin nombre'),nullif(g->>'categoria',''),greatest(coalesce((g->>'monto')::numeric,0),0),coalesce((g->>'fecha')::date,current_date)) on conflict(user_id,legacy_id) where legacy_id is not null do update set nombre=excluded.nombre,categoria=excluded.categoria,monto=excluded.monto,fecha=excluded.fecha where (dest.nombre,dest.categoria,dest.monto,dest.fecha) is distinct from (excluded.nombre,excluded.categoria,excluded.monto,excluded.fecha);
end loop;
delete from public.proyectos t where user_id=uid and not exists(select 1 from jsonb_array_elements(snapshot->'clientes') sc cross join lateral jsonb_array_elements(coalesce(sc->'proyectos','[]')) sp where (sp->>'id')::bigint=t.legacy_id)
 and not exists(select 1 from public.agenda_trabajos a join public.clientes cl on cl.id=a.cliente_id where cl.id=t.cliente_id and a.user_id=uid and not exists(select 1 from jsonb_array_elements(snapshot->'clientes') sc where (sc->>'id')::bigint=cl.legacy_id));
delete from public.pagos t where user_id=uid and not exists(select 1 from jsonb_array_elements(snapshot->'colaboradores') sc cross join lateral jsonb_array_elements(coalesce(sc->'pagos','[]')) sp where (sp->>'id')::bigint=t.legacy_id);
delete from public.clientes t where user_id=uid and not exists(select 1 from jsonb_array_elements(snapshot->'clientes') sc where (sc->>'id')::bigint=t.legacy_id) and not exists(select 1 from public.agenda_trabajos a where a.cliente_id=t.id);
delete from public.colaboradores t where user_id=uid and not exists(select 1 from jsonb_array_elements(snapshot->'colaboradores') sc where (sc->>'id')::bigint=t.legacy_id);
delete from public.gear t where user_id=uid and not exists(select 1 from jsonb_array_elements(snapshot->'equipo') sg where (sg->>'id')::bigint=t.legacy_id);
end; $$;
revoke all on function public.sync_tito_snapshot(jsonb) from public,anon;
grant execute on function public.sync_tito_snapshot(jsonb) to authenticated;