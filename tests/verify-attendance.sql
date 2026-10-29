begin;
select set_config('request.jwt.claims',(select json_build_object('sub',p.id,'email',p.email,'role','authenticated')::text from public.profiles p join public.beta_users b on lower(b.email)=lower(p.email) where b.active and (b.expires_at is null or b.expires_at>now()) and exists(select 1 from public.clientes c where c.user_id=p.id) limit 1),true);
set local role authenticated;
do $test$
declare uid uuid:=auth.uid(); cid uuid; jid uuid:=gen_random_uuid(); future_id uuid:=gen_random_uuid(); canceled_id uuid:=gen_random_uuid(); result jsonb; again jsonb; snap jsonb; count_before bigint;
begin
 select id into cid from public.clientes where user_id=uid limit 1;
 snap:=public.load_tito_snapshot();select count(*) into count_before from public.proyectos;
 perform public.save_agenda_with_client(jid,jsonb_build_object('tipo','Freelo','nombre','Attendance fixture','estado','Confirmado','fecha',(now() at time zone 'America/Lima')::date,'tarifa',100),cid,false);
 result:=public.attend_agenda_job(jid,125.50);
 again:=public.attend_agenda_job(jid,999);
 assert result->>'id'=again->>'id','Repeated attendance duplicated charge';
 assert (select count(*) from public.proyectos)=count_before+1,'Charge count incorrect';
 assert (result->'project'->>'monto')::numeric=125.50,'Adjusted amount not used';
 assert (select estado='Realizado' and cobro_generado_id=(result->>'id')::uuid and asistio_at is not null from public.agenda_trabajos where id=jid),'Attendance not persisted';
 assert (select estado='realizado' from public.proyectos where id=(result->>'id')::uuid),'Charge not pending realized work';
 -- A stale snapshot cannot delete a generated charge; its whole transaction fails safely.
 begin perform public.sync_tito_snapshot(snap);raise exception 'Stale snapshot accepted';
 exception when foreign_key_violation then null;end;
 assert exists(select 1 from public.proyectos where id=(result->>'id')::uuid),'Stale sync deleted new charge';
 begin
  update public.agenda_trabajos set estado='Cancelado' where id=jid;
  raise exception 'Attendance reverted';
 exception when raise_exception then if sqlerrm='Attendance reverted' then raise;end if;end;
 begin
  delete from public.proyectos where id=(result->>'id')::uuid;
  raise exception 'Linked charge deleted';
 exception when foreign_key_violation then null;end;
 perform public.save_agenda_with_client(future_id,jsonb_build_object('tipo','Freelo','nombre','Future fixture','estado','Confirmado','fecha',(now() at time zone 'America/Lima')::date+10),cid,false);
 begin perform public.attend_agenda_job(future_id,100);raise exception 'Future attendance accepted';
 exception when raise_exception then if sqlerrm='Future attendance accepted' then raise;end if;end;
 perform public.save_agenda_with_client(canceled_id,jsonb_build_object('tipo','Freelo','nombre','Canceled fixture','estado','Cancelado','fecha',(now() at time zone 'America/Lima')::date),cid,false);
 begin perform public.attend_agenda_job(canceled_id,100);raise exception 'Canceled attendance accepted';
 exception when raise_exception then if sqlerrm='Canceled attendance accepted' then raise;end if;end;
 assert not has_function_privilege('anon','public.attend_agenda_job(uuid,numeric)','EXECUTE'),'Anon can attend';
end; $test$;
rollback;