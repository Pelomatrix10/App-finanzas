-- No attendance or financial records are created by installing this schema.
alter table public.agenda_trabajos drop constraint agenda_trabajos_estado_check;
alter table public.agenda_trabajos add constraint agenda_trabajos_estado_check check(estado in('Tentativo','Confirmado','Cancelado','Realizado'));
alter table public.agenda_trabajos add column asistio_at timestamptz;
alter table public.agenda_trabajos add column cobro_generado_id uuid references public.proyectos(id) on delete restrict;
alter table public.agenda_trabajos add constraint agenda_attendance_complete check((estado='Realizado')=(cobro_generado_id is not null and asistio_at is not null));
alter table public.proyectos add column agenda_trabajo_id uuid unique references public.agenda_trabajos(id) on delete restrict;
create index agenda_cobro_generado_idx on public.agenda_trabajos(cobro_generado_id) where cobro_generado_id is not null;

create or replace function public.tito_attended_job_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.cobro_generado_id is not null and
 (new.cobro_generado_id is distinct from old.cobro_generado_id or new.cliente_id is distinct from old.cliente_id
 or new.estado<>'Realizado' or new.asistio_at is distinct from old.asistio_at) then
  raise exception 'La asistencia ya tiene un cobro. Gestiona sus cambios desde Cobros.';
 end if;
 if new.cobro_generado_id is not null and not exists(select 1 from public.proyectos p where p.id=new.cobro_generado_id and p.user_id=new.user_id and p.agenda_trabajo_id=new.id and p.cliente_id=new.cliente_id) then
  raise exception 'El cobro no corresponde a este rodaje.';
 end if;
 if new.estado='Realizado' and (new.cobro_generado_id is null or new.asistio_at is null) then
  raise exception 'Registra la asistencia con el botón Asistí.';
 end if;
 return new;
end; $$;
-- UPDATE only: OLD is always a valid existing row; inserts use the CHECK above.
create trigger agenda_attended_guard before update on public.agenda_trabajos for each row execute function public.tito_attended_job_guard();

create or replace function public.tito_project_agenda_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.agenda_trabajo_id is not null and new.agenda_trabajo_id is distinct from old.agenda_trabajo_id then
   raise exception 'No se puede cambiar el rodaje de origen del cobro.';
  end if;
 end if;
 if new.agenda_trabajo_id is not null and not exists(select 1 from public.agenda_trabajos a where a.id=new.agenda_trabajo_id and a.user_id=new.user_id and a.cliente_id=new.cliente_id and a.estado in('Confirmado','Realizado')) then
  raise exception 'El rodaje no está confirmado o no pertenece a este cliente.';
 end if;
 return new;
end; $$;
create trigger proyecto_agenda_owner before insert or update on public.proyectos for each row execute function public.tito_project_agenda_guard();

create or replace function public.attend_agenda_job(job_id uuid, amount numeric) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); a public.agenda_trabajos; p public.proyectos; client_legacy bigint; project_legacy bigint;
begin
 if uid is null or not public.has_beta_access() then raise exception 'Acceso denegado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into a from public.agenda_trabajos where id=job_id and user_id=uid for update;
 if not found then raise exception 'Rodaje no disponible.'; end if;
 if a.cobro_generado_id is not null then
  select * into strict p from public.proyectos where id=a.cobro_generado_id and user_id=uid;
 else
  if a.estado<>'Confirmado' then raise exception 'Solo puedes registrar asistencia de un rodaje confirmado.'; end if;
  if a.fecha>(now() at time zone 'America/Lima')::date then raise exception 'Podrás registrar la asistencia desde la fecha del rodaje.'; end if;
  if amount is null or amount<=0 or amount::text in('NaN','Infinity','-Infinity') or amount<>round(amount,2) then raise exception 'Ingresa un monto mayor a cero, con hasta dos decimales.'; end if;
  if a.cliente_id is null then raise exception 'Vincula el rodaje a un cliente antes de registrar asistencia.'; end if;
  select legacy_id into strict client_legacy from public.clientes where id=a.cliente_id and user_id=uid;
  select least(coalesce(min(legacy_id),0),0)-1 into project_legacy from public.proyectos where user_id=uid;
  insert into public.proyectos(user_id,cliente_id,legacy_id,concepto,monto,estado,fecha,agenda_trabajo_id)
  values(uid,a.cliente_id,project_legacy,a.nombre,amount,'realizado',a.fecha,a.id)
  returning * into p;
  update public.agenda_trabajos set estado='Realizado',asistio_at=now(),cobro_generado_id=p.id,updated_at=now() where id=a.id;
 end if;
 select legacy_id into strict client_legacy from public.clientes where id=p.cliente_id and user_id=uid;
 return jsonb_build_object('id',p.id,'cliente_legacy_id',client_legacy,'project',jsonb_build_object('id',p.legacy_id,'concepto',p.concepto,'monto',p.monto,'estado',p.estado,'fecha',p.fecha));
end; $$;
revoke all on function public.attend_agenda_job(uuid,numeric) from public,anon;
grant execute on function public.attend_agenda_job(uuid,numeric) to authenticated;