-- New reminder infrastructure only; no historical financial rows are changed.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create schema if not exists tito_private;
revoke all on schema tito_private from public,anon;
grant usage on schema tito_private to authenticated,service_role;

create table public.tito_push_public_config(id boolean primary key default true check(id),public_key text not null);
alter table public.tito_push_public_config enable row level security;
create policy push_config_beta_read on public.tito_push_public_config for select to authenticated using(public.has_beta_access());
grant select on public.tito_push_public_config to authenticated;
grant all on public.tito_push_public_config to service_role;

create table public.tito_push_subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,p256dh text not null,auth text not null,enabled_at timestamptz not null default now(),disabled_at timestamptz
);
alter table public.tito_push_subscriptions enable row level security;
create policy push_subscription_read_own on public.tito_push_subscriptions for select to authenticated using(user_id=(select auth.uid()) and public.has_beta_access());
create policy push_subscription_delete_own on public.tito_push_subscriptions for delete to authenticated using(user_id=(select auth.uid()) and public.has_beta_access());
grant select,delete on public.tito_push_subscriptions to authenticated;
grant all on public.tito_push_subscriptions to service_role;
create index push_subscription_user_idx on public.tito_push_subscriptions(user_id);

create table public.tito_push_deliveries(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.agenda_trabajos(id) on delete cascade,
 subscription_id uuid not null references public.tito_push_subscriptions(id) on delete cascade,
 kind text not null check(kind in('day_before','one_hour')),scheduled_at timestamptz not null,
 sent_at timestamptz,locked_until timestamptz,attempts integer not null default 0,last_error text,
 unique(job_id,subscription_id,kind,scheduled_at)
);
alter table public.tito_push_deliveries enable row level security;
revoke all on public.tito_push_deliveries from anon,authenticated;
grant all on public.tito_push_deliveries to service_role;
create index push_delivery_subscription_idx on public.tito_push_deliveries(subscription_id);

-- A subscription endpoint and its encryption keys are a device capability.
-- A device switching account transfers its endpoint; it never receives two accounts' reminders.
create function tito_private.register_current_subscription(subscription jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); ep text:=subscription->>'endpoint'; pkey text:=subscription->'keys'->>'p256dh'; akey text:=subscription->'keys'->>'auth'; result uuid;
begin
 if uid is null or not public.has_beta_access() then raise exception 'Acceso denegado.';end if;
 if ep is null or length(ep)>3000 or ep !~ '^https://' or
 (split_part(split_part(ep,'://',2),'/',1) not in('fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com')
 and split_part(split_part(ep,'://',2),'/',1) !~ '^[a-zA-Z0-9-]+[.]notify[.]windows[.]com$') then raise exception 'Servicio de notificaciones no compatible.';end if;
 if pkey is null or pkey !~ '^[A-Za-z0-9_-]{80,100}$' or akey is null or akey !~ '^[A-Za-z0-9_-]{20,30}$' then raise exception 'Suscripción inválida.';end if;
 insert into public.tito_push_subscriptions(user_id,endpoint,p256dh,auth)
 values(uid,ep,pkey,akey)
 on conflict(endpoint) do update set user_id=uid,p256dh=excluded.p256dh,auth=excluded.auth,enabled_at=case when tito_push_subscriptions.user_id=uid and tito_push_subscriptions.disabled_at is null then tito_push_subscriptions.enabled_at else now() end,disabled_at=null returning id into result;
 return result;
end; $$;
revoke all on function tito_private.register_current_subscription(jsonb) from public,anon;
grant execute on function tito_private.register_current_subscription(jsonb) to authenticated;
create function public.register_tito_push(subscription jsonb) returns uuid language sql security invoker set search_path='' as $$
 select tito_private.register_current_subscription(subscription);
$$;
revoke all on function public.register_tito_push(jsonb) from public,anon;
grant execute on function public.register_tito_push(jsonb) to authenticated;

-- Server-only vault access. No private VAPID key or worker secret is sent to the app.
do $$ begin
 if not exists(select 1 from vault.secrets where name='tito_push_worker_secret') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'tito_push_worker_secret');
 end if;
end; $$;
create function public.tito_push_server_config() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'workerSecret',(select decrypted_secret from vault.decrypted_secrets where name='tito_push_worker_secret'),
 'vapid',(select decrypted_secret::jsonb from vault.decrypted_secrets where name='tito_push_vapid'));
$$;
revoke all on function public.tito_push_server_config() from public,anon,authenticated;
grant execute on function public.tito_push_server_config() to service_role;
create function public.tito_initialize_push_vapid(keys jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('tito_push_vapid',0));
 if not exists(select 1 from vault.secrets where name='tito_push_vapid') then
  if length(keys->>'publicKey')<>87 or length(keys->>'privateKey')<>43 then raise exception 'Invalid VAPID keys';end if;
  perform vault.create_secret(keys::text,'tito_push_vapid');
  insert into public.tito_push_public_config(id,public_key) values(true,keys->>'publicKey');
 end if;
end; $$;
revoke all on function public.tito_initialize_push_vapid(jsonb) from public,anon,authenticated;
grant execute on function public.tito_initialize_push_vapid(jsonb) to service_role;

create function public.tito_claim_reminders(at_time timestamptz default now()) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 insert into public.tito_push_deliveries(job_id,subscription_id,kind,scheduled_at)
 select a.id,s.id,r.kind,r.due from public.agenda_trabajos a
 join public.tito_push_subscriptions s on s.user_id=a.user_id and s.disabled_at is null
 cross join lateral(values
 ('day_before',((a.fecha-1)+time '18:00') at time zone 'America/Lima'),
 ('one_hour',((a.fecha+coalesce(a.inicio,time '09:00'))-interval '1 hour') at time zone 'America/Lima')
 ) r(kind,due)
 where a.estado='Confirmado' and a.asistio_at is null and r.due<=at_time and r.due>at_time-interval '30 minutes'
 and s.enabled_at<=r.due
 and exists(select 1 from public.profiles p join public.beta_users b on lower(b.email)=lower(p.email) where p.id=a.user_id and b.active and b.role in('admin','tester') and (b.expires_at is null or b.expires_at>at_time))
 on conflict(job_id,subscription_id,kind,scheduled_at) do nothing;
 with claimed as(
 update public.tito_push_deliveries d set locked_until=at_time+interval '2 minutes',attempts=d.attempts+1
 where d.id in(
 select q.id from public.tito_push_deliveries q
 join public.agenda_trabajos a on a.id=q.job_id
 join public.tito_push_subscriptions s on s.id=q.subscription_id and s.user_id=a.user_id
 where a.estado='Confirmado' and a.asistio_at is null and s.disabled_at is null
 and q.sent_at is null and q.attempts<5 and (q.locked_until is null or q.locked_until<=at_time)
 and q.scheduled_at<=at_time and q.scheduled_at>at_time-interval '30 minutes'
 and q.scheduled_at=case when q.kind='day_before' then ((a.fecha-1)+time '18:00') at time zone 'America/Lima' else ((a.fecha+coalesce(a.inicio,time '09:00'))-interval '1 hour') at time zone 'America/Lima' end
 and exists(select 1 from public.profiles p join public.beta_users b on lower(b.email)=lower(p.email) where p.id=a.user_id and b.active and (b.expires_at is null or b.expires_at>at_time))
 order by q.scheduled_at limit 20 for update of q skip locked
 ) returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',d.id,'subscriptionId',s.id,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)),
 'payload',jsonb_build_object('title',case when d.kind='day_before' then 'Mañana tienes rodaje' else 'Tu rodaje empieza en una hora' end,
 'body',a.nombre||' · '||coalesce(nullif(a.cliente,''),'TiTo')||' · '||to_char(a.fecha,'DD/MM')||' '||to_char(coalesce(a.inicio,time '09:00'),'HH24:MI')||case when a.lugar<>'' then ' · '||a.lugar else '' end,
 'tag','tito-'||a.id::text||'-'||d.kind||'-'||extract(epoch from d.scheduled_at)::bigint::text,
 'jobId',a.id,'userId',a.user_id,'url','https://pelomatrix10.github.io/App-finanzas/?agenda='||a.id::text)
 )), '[]'::jsonb) into result from claimed d join public.agenda_trabajos a on a.id=d.job_id join public.tito_push_subscriptions s on s.id=d.subscription_id;
 return result;
end; $$;
revoke all on function public.tito_claim_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.tito_claim_reminders(timestamptz) to service_role;

create function tito_private.dispatch_reminders() returns bigint
language plpgsql security invoker set search_path='' as $$
declare result bigint;
begin
 -- Skip network calls when no enabled devices or no confirmed jobs are near.
 if exists(select 1 from public.tito_push_subscriptions where disabled_at is null)
 and exists(select 1 from public.agenda_trabajos where estado='Confirmado' and fecha between (now() at time zone 'America/Lima')::date and (now() at time zone 'America/Lima')::date+1) then
  select net.http_post(url:='https://tphnmrxjvgomlhcsmtxt.supabase.co/functions/v1/tito-reminders',
   headers:=jsonb_build_object('Content-Type','application/json','x-tito-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='tito_push_worker_secret')),
   body:='{}'::jsonb,timeout_milliseconds:=30000) into result;
 end if;
 return result;
end; $$;
revoke all on function tito_private.dispatch_reminders() from public,anon,authenticated;
-- Scheduling is installed only after the worker has been deployed and verified.