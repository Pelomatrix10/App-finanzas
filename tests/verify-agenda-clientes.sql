-- All fixture writes are rolled back. Run through a database administrator.
begin;
select set_config('request.jwt.claims',(
 select json_build_object('sub',p.id,'email',p.email,'role','authenticated')::text
 from public.profiles p join public.beta_users b on lower(b.email)=lower(p.email)
 where b.active and (b.expires_at is null or b.expires_at>now())
 and exists(select 1 from public.clientes c where c.user_id=p.id)
 limit 1
),true);
set local role authenticated;
do $test$
declare
 uid uuid:=auth.uid(); cid uuid; other_client uuid; jid uuid:=gen_random_uuid(); jid2 uuid:=gen_random_uuid();
 name text:='__TITO_TEST_'||gen_random_uuid()::text; before_count bigint;
 snap jsonb; before_hash text; after_hash text; linked public.agenda_trabajos;
begin
 assert uid is not null,'Test account unavailable';
 select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) into before_hash from public.proyectos t where user_id=uid;
 snap:=public.load_tito_snapshot();
 perform public.sync_tito_snapshot(snap);
 select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) into after_hash from public.proyectos t where user_id=uid;
 assert before_hash=after_hash,'Snapshot rewrote historical projects';
 select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) into before_hash from public.pagos t where user_id=uid;
 perform public.sync_tito_snapshot(snap);
 select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) into after_hash from public.pagos t where user_id=uid;
 assert before_hash=after_hash,'Snapshot rewrote historical payments';
 select id into cid from public.clientes where user_id=uid limit 1;
 select count(*) into before_count from public.clientes;
 linked:=public.save_agenda_with_client(jid,jsonb_build_object('tipo','Freelo','nombre','Test','fecha','2099-01-01','estado','Confirmado','tarifa',500),cid,false);
 assert linked.cliente_id=cid,'Existing client not linked';
 assert (select count(*) from public.clientes)=before_count,'Existing client duplicated';
 linked:=public.save_agenda_with_client(jid,jsonb_build_object('tipo','Freelo','nombre','Edited','fecha','2099-01-02','estado','Confirmado','tarifa',600),cid,false);
 assert (select count(*) from public.agenda_trabajos where id=jid)=1,'Retry duplicated job';
 perform public.sync_tito_snapshot(snap);
 assert (select cliente_id=cid from public.agenda_trabajos where id=jid),'Sync broke link';
 linked:=public.save_agenda_with_client(jid2,jsonb_build_object('tipo','Freelo','nombre','New client','cliente',name,'fecha','2099-01-01','estado','Confirmado','tarifa',900),null,true);
 cid:=linked.cliente_id;
 assert cid is not null,'New client missing';
 assert (select count(*) from public.clientes)=before_count+1,'New client not singular';
 linked:=public.save_agenda_with_client(gen_random_uuid(),jsonb_build_object('tipo','Freelo','nombre','Same client','cliente','  '||upper(name)||'  ','fecha','2099-01-01','estado','Confirmado'),null,true);
 assert linked.cliente_id=cid,'Normalized duplicate not reused';
 assert (select count(*) from public.clientes)=before_count+1,'Duplicate client created';
 perform public.sync_tito_snapshot(snap);
 assert exists(select 1 from public.clientes where id=cid),'Older snapshot deleted linked client';
 assert (select cliente_id=cid from public.agenda_trabajos where id=jid2),'Older snapshot broke new link';
 begin
  perform public.save_agenda_with_client(gen_random_uuid(),jsonb_build_object('tipo','Freelo','nombre','Invalid','cliente',name||' invalid','fecha','2099-01-01','inicio','18:00','fin','09:00','estado','Confirmado'),null,true);
  raise exception 'Invalid times were accepted';
 exception when raise_exception then
  if sqlerrm='Invalid times were accepted' then raise; end if;
 end;
 assert not exists(select 1 from public.clientes where nombre=name||' invalid'),'Failed job left orphan client';
 begin
  perform public.save_agenda_with_client(gen_random_uuid(),jsonb_build_object('tipo','Freelo','nombre','No client','fecha','2099-01-01','estado','Confirmado'),null,false);
  raise exception 'Unlinked confirmation accepted';
 exception when raise_exception then
  if sqlerrm='Unlinked confirmation accepted' then raise; end if;
 end;
 begin
  insert into public.clientes(user_id,nombre) values(uid,upper(name));
  raise exception 'Duplicate allowed';
 exception when unique_violation then null;
 end;
 linked:=public.save_agenda_with_client(jid2,jsonb_build_object('tipo','Freelo','nombre','Cancelled','fecha','2099-01-01','estado','Cancelado'),cid,false);
 assert linked.cliente_id=cid,'Cancellation lost link';
 delete from public.agenda_trabajos where id=jid2;
 assert exists(select 1 from public.clientes where id=cid),'Job deletion removed client';
 assert not exists(select 1 from public.proyectos where cliente_id=cid),'Agenda created debt';
 select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) into after_hash from public.pagos t where user_id=uid;
 assert before_hash=after_hash,'Agenda changed payments';
end;
$test$;
rollback;