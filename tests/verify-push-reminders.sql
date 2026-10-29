begin;
select set_config('request.jwt.claims',(select json_build_object('sub',p.id,'email',p.email,'role','authenticated')::text from public.profiles p join public.beta_users b on lower(b.email)=lower(p.email) where b.active and (b.expires_at is null or b.expires_at>now()+interval '3 days') and exists(select 1 from public.clientes c where c.user_id=p.id) limit 1),true);
do $test$
declare uid uuid:=auth.uid(); cid uuid; jid uuid:=gen_random_uuid(); jid2 uuid:=gen_random_uuid(); sid uuid; jobs jsonb; at_time timestamptz; delivery uuid; local_now timestamp:=now() at time zone 'America/Lima';
begin
 assert uid is not null,'No test account';
 select id into cid from public.clientes where user_id=uid limit 1;
 sid:=public.register_tito_push(jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/__TITO_TEST_'||gen_random_uuid()::text,'keys',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('b',22))));
 update public.tito_push_subscriptions set enabled_at=now()-interval '3 days' where id=sid;
 perform public.save_agenda_with_client(jid,jsonb_build_object('tipo','Freelo','nombre','Reminder fixture','estado','Confirmado','fecha',local_now::date+1,'inicio','09:00'),cid,false);
 at_time:=((local_now::date)+time '18:05') at time zone 'America/Lima';
 jobs:=public.tito_claim_reminders(at_time);
 assert exists(select 1 from jsonb_array_elements(jobs) j where j->'payload'->>'jobId'=jid::text and j->'payload'->>'title'='Mañana tienes rodaje'),'18:00 reminder not queued';
 assert not exists(select 1 from jsonb_array_elements(public.tito_claim_reminders(at_time)) j where j->'payload'->>'jobId'=jid::text),'Lease duplicated reminder';
 update public.tito_push_deliveries set sent_at=at_time where job_id=jid;
 jobs:=public.tito_claim_reminders(((local_now::date+1)+time '08:05') at time zone 'America/Lima');
 assert exists(select 1 from jsonb_array_elements(jobs) j where j->'payload'->>'jobId'=jid::text and j->'payload'->>'title'='Tu rodaje empieza en una hora'),'One-hour reminder not queued';
 update public.agenda_trabajos set fecha=fecha+1 where id=jid;
 update public.tito_push_deliveries set locked_until=null where job_id=jid;
 assert not exists(select 1 from jsonb_array_elements(public.tito_claim_reminders(((local_now::date+1)+time '08:10') at time zone 'America/Lima')) j where j->'payload'->>'jobId'=jid::text),'Old-date reminder sent';
 perform public.save_agenda_with_client(jid2,jsonb_build_object('tipo','Freelo','nombre','Cancel reminder fixture','estado','Confirmado','fecha',(local_now+interval '59 minutes')::date,'inicio',(local_now+interval '59 minutes')::time),cid,false);
 jobs:=public.tito_claim_reminders(now());
 select (j->>'id')::uuid into delivery from jsonb_array_elements(jobs) j where j->'payload'->>'jobId'=jid2::text;
 assert delivery is not null,'Current reminder missing';
 assert public.tito_reminder_is_current(delivery),'Current reminder invalid';
 update public.agenda_trabajos set estado='Cancelado' where id=jid2;
 assert not public.tito_reminder_is_current(delivery),'Cancelled reminder still deliverable';
 begin
  perform public.register_tito_push(jsonb_build_object('endpoint','https://example.com/private','keys',jsonb_build_object('p256dh',repeat('a',87),'auth',repeat('b',22))));
  raise exception 'Unsafe endpoint accepted';
 exception when raise_exception then if sqlerrm='Unsafe endpoint accepted' then raise;end if;end;
 assert not has_function_privilege('authenticated','public.tito_push_server_config()','EXECUTE'),'Private config exposed';
 assert not has_function_privilege('anon','public.register_tito_push(jsonb)','EXECUTE'),'Anon registration allowed';
 assert not has_function_privilege('authenticated','public.tito_claim_reminders(timestamptz)','EXECUTE'),'User can claim other accounts reminders';
end; $test$;
rollback;