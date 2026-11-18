create table public.tito_job_invitations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.agenda_trabajos(id) on delete cascade,
  organizer uuid not null references auth.users(id) on delete cascade,
  email text not null,
  assignment text not null check (char_length(assignment) between 1 and 80),
  channel text not null check (channel in ('app', 'email')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  delivery text not null check (delivery in ('queued', 'sent', 'manual', 'inbox', 'failed')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  attempts int not null default 0,
  next_attempt timestamptz not null default now(),
  unique (job_id, email)
);
alter table public.tito_job_invitations enable row level security;
revoke all on public.tito_job_invitations from public, anon, authenticated;
grant select, update on public.tito_job_invitations to service_role;
create index tito_invitation_inbox on public.tito_job_invitations (email, created_at desc) where channel = 'app';
create index tito_invitation_organizer on public.tito_job_invitations (organizer, created_at desc);
create index tito_invitation_queue on public.tito_job_invitations (next_attempt) where delivery = 'queued';

create function tito_private.invite_to_job(job uuid, recipient text, task_role text) returns uuid
language plpgsql security definer set search_path = '' as $
declare
  caller uuid := auth.uid();
  address text := lower(btrim(recipient));
  assignment_name text := btrim(task_role);
  invite_channel text;
  invite_delivery text;
  result uuid;
begin
  if caller is null or not public.has_beta_access() then raise exception 'Acceso denegado'; end if;
  if address is null or length(address) > 254 or address !~ '^[a-z0-9._+%-]+@[a-z0-9.-]+[.][a-z]{2,63}create function tito_private.my_job_invitations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(invites) order by invites.fecha, invites.inicio nulls last), '[]')
  from (
    select i.id, i.job_id, i.assignment, i.channel, i.status, i.delivery,
      i.organizer = auth.uid() as outgoing,
      case when i.organizer = auth.uid() then i.email end as email,
      coalesce(nullif(p.full_name,''), 'Organizador de TiTo') as organizer_name,
      a.nombre, a.fecha, a.inicio, a.fin, a.lugar,
      a.estado = 'Cancelado' as cancelled,
      a.estado in ('Tentativo','Confirmado') and a.fecha >= (now() at time zone 'America/Lima')::date as actionable
    from public.tito_job_invitations i
    join public.agenda_trabajos a on a.id = i.job_id
    left join public.profiles p on p.id = i.organizer
    where auth.uid() is not null and public.has_beta_access() and (
      i.organizer = auth.uid() or
      (i.channel = 'app' and i.email = lower(auth.jwt()->>'email') and exists(
        select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = i.email and u.email_confirmed_at is not null))
    )
  ) invites;
$$;

create function tito_private.respond_to_job_invitation(invitation uuid, answer text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_beta_access() or answer is null or answer not in ('accepted','declined') then
    raise exception 'Respuesta no permitida';
  end if;
  perform 1 from public.agenda_trabajos a join public.tito_job_invitations i on i.job_id = a.id
  where i.id = invitation and a.estado in ('Tentativo','Confirmado')
    and a.fecha >= (now() at time zone 'America/Lima')::date for share of a;
  if not found then raise exception 'La invitación ya no está disponible'; end if;
  update public.tito_job_invitations i set status = answer, responded_at = now()
    where i.id = invitation and i.channel = 'app' and i.status = 'pending'
      and i.email = lower(auth.jwt()->>'email') and exists(
        select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = i.email and u.email_confirmed_at is not null);
  if not found then raise exception 'La invitación ya fue respondida o no está disponible'; end if;
end;
$$;

create function tito_private.job_invitation_testers() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', lower(b.email), 'name', coalesce(nullif(p.full_name,''), b.email)) order by coalesce(p.full_name,b.email)), '[]')
  from public.beta_users b left join public.profiles p on lower(p.email) = lower(b.email)
  where auth.uid() is not null and public.is_beta_admin()
    and b.role = 'tester' and b.active and (b.expires_at is null or b.expires_at > now())
    and lower(b.email) <> lower(auth.jwt()->>'email');
$$;

create function public.invite_to_job(job uuid, recipient text, task_role text) returns uuid
language sql security invoker set search_path = '' as $$ select tito_private.invite_to_job(job,recipient,task_role); $$;
create function public.my_job_invitations() returns jsonb
language sql stable security invoker set search_path = '' as $$ select tito_private.my_job_invitations(); $$;
create function public.respond_to_job_invitation(invitation uuid, answer text) returns void
language sql security invoker set search_path = '' as $$ select tito_private.respond_to_job_invitation(invitation,answer); $$;
create function public.job_invitation_testers() returns jsonb
language sql stable security invoker set search_path = '' as $$ select tito_private.job_invitation_testers(); $$;

revoke all on function tito_private.invite_to_job(uuid,text,text), tito_private.my_job_invitations(),
  tito_private.respond_to_job_invitation(uuid,text), tito_private.job_invitation_testers()
  from public, anon;
grant usage on schema tito_private to authenticated;
grant execute on function tito_private.invite_to_job(uuid,text,text), tito_private.my_job_invitations(),
  tito_private.respond_to_job_invitation(uuid,text), tito_private.job_invitation_testers() to authenticated;
revoke all on function public.invite_to_job(uuid,text,text), public.my_job_invitations(),
  public.respond_to_job_invitation(uuid,text), public.job_invitation_testers() from public, anon;
grant execute on function public.invite_to_job(uuid,text,text), public.my_job_invitations(),
  public.respond_to_job_invitation(uuid,text), public.job_invitation_testers() to authenticated;


    or address = lower(coalesce(auth.jwt()->>'email','')) then raise exception 'Ingresa un correo válido que no sea el tuyo'; end if;
  if assignment_name is null or length(assignment_name) not between 1 and 80 then raise exception 'Indica el rol del invitado'; end if;
  perform 1 from public.agenda_trabajos a where a.id = job and a.user_id = caller and a.estado in ('Tentativo','Confirmado')
    and a.fecha >= (now() at time zone 'America/Lima')::date for share;
  if not found then raise exception 'Elige un trabajo vigente de tu agenda'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 92));
  select i.id into result from public.tito_job_invitations i where i.job_id = job and i.email = address;
  if found then return result; end if;
  if (select count(*) from public.tito_job_invitations i where i.organizer = caller and i.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'Alcanzaste el límite diario de invitaciones';
  end if;
  select case when exists(select 1 from public.beta_users b where lower(b.email) = address and b.active
     and (b.expires_at is null or b.expires_at > now())) then 'app' else 'email' end into invite_channel;
  invite_delivery := case when invite_channel = 'app' then 'queued' else 'manual' end;
  insert into public.tito_job_invitations(job_id,organizer,email,assignment,channel,delivery)
  values(job,caller,address,assignment_name,invite_channel,invite_delivery) returning id into result;
  return result;
end;
$;

create function tito_private.my_job_invitations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(invites) order by invites.fecha, invites.inicio nulls last), '[]')
  from (
    select i.id, i.job_id, i.assignment, i.channel, i.status, i.delivery,
      i.organizer = auth.uid() as outgoing,
      case when i.organizer = auth.uid() then i.email end as email,
      coalesce(nullif(p.full_name,''), 'Organizador de TiTo') as organizer_name,
      a.nombre, a.fecha, a.inicio, a.fin, a.lugar,
      a.estado = 'Cancelado' as cancelled,
      a.estado in ('Tentativo','Confirmado') and a.fecha >= (now() at time zone 'America/Lima')::date as actionable
    from public.tito_job_invitations i
    join public.agenda_trabajos a on a.id = i.job_id
    left join public.profiles p on p.id = i.organizer
    where auth.uid() is not null and public.has_beta_access() and (
      i.organizer = auth.uid() or
      (i.channel = 'app' and i.email = lower(auth.jwt()->>'email') and exists(
        select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = i.email and u.email_confirmed_at is not null))
    )
  ) invites;
$$;

create function tito_private.respond_to_job_invitation(invitation uuid, answer text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_beta_access() or answer is null or answer not in ('accepted','declined') then
    raise exception 'Respuesta no permitida';
  end if;
  perform 1 from public.agenda_trabajos a join public.tito_job_invitations i on i.job_id = a.id
  where i.id = invitation and a.estado in ('Tentativo','Confirmado')
    and a.fecha >= (now() at time zone 'America/Lima')::date for share of a;
  if not found then raise exception 'La invitación ya no está disponible'; end if;
  update public.tito_job_invitations i set status = answer, responded_at = now()
    where i.id = invitation and i.channel = 'app' and i.status = 'pending'
      and i.email = lower(auth.jwt()->>'email') and exists(
        select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = i.email and u.email_confirmed_at is not null);
  if not found then raise exception 'La invitación ya fue respondida o no está disponible'; end if;
end;
$$;

create function tito_private.job_invitation_testers() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', lower(b.email), 'name', coalesce(nullif(p.full_name,''), b.email)) order by coalesce(p.full_name,b.email)), '[]')
  from public.beta_users b left join public.profiles p on lower(p.email) = lower(b.email)
  where auth.uid() is not null and public.is_beta_admin()
    and b.role = 'tester' and b.active and (b.expires_at is null or b.expires_at > now())
    and lower(b.email) <> lower(auth.jwt()->>'email');
$$;

create function public.invite_to_job(job uuid, recipient text, task_role text) returns uuid
language sql security invoker set search_path = '' as $$ select tito_private.invite_to_job(job,recipient,task_role); $$;
create function public.my_job_invitations() returns jsonb
language sql stable security invoker set search_path = '' as $$ select tito_private.my_job_invitations(); $$;
create function public.respond_to_job_invitation(invitation uuid, answer text) returns void
language sql security invoker set search_path = '' as $$ select tito_private.respond_to_job_invitation(invitation,answer); $$;
create function public.job_invitation_testers() returns jsonb
language sql stable security invoker set search_path = '' as $$ select tito_private.job_invitation_testers(); $$;

revoke all on function tito_private.invite_to_job(uuid,text,text), tito_private.my_job_invitations(),
  tito_private.respond_to_job_invitation(uuid,text), tito_private.job_invitation_testers()
  from public, anon;
grant usage on schema tito_private to authenticated;
grant execute on function tito_private.invite_to_job(uuid,text,text), tito_private.my_job_invitations(),
  tito_private.respond_to_job_invitation(uuid,text), tito_private.job_invitation_testers() to authenticated;
revoke all on function public.invite_to_job(uuid,text,text), public.my_job_invitations(),
  public.respond_to_job_invitation(uuid,text), public.job_invitation_testers() from public, anon;
grant execute on function public.invite_to_job(uuid,text,text), public.my_job_invitations(),
  public.respond_to_job_invitation(uuid,text), public.job_invitation_testers() to authenticated;

create function public.claim_job_invitation_deliveries() returns jsonb
language sql security invoker set search_path = '' as $$
  with claimed as (
    update public.tito_job_invitations i
    set attempts = i.attempts + 1, next_attempt = now() + interval '3 minutes'
    where i.id in (
      select q.id from public.tito_job_invitations q
      where q.channel = 'app' and q.delivery = 'queued' and q.next_attempt <= now() and q.attempts < 4
      order by q.created_at limit 10 for update skip locked
    )
    returning i.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'attempts', i.attempts,
    'eligible', a.estado in ('Tentativo','Confirmado') and i.status = 'pending'
      and a.fecha >= (now() at time zone 'America/Lima')::date and exists(
        select 1 from public.beta_users b where lower(b.email) = i.email and b.active
          and (b.expires_at is null or b.expires_at > now())),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint',s.endpoint,
      'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))
      from public.tito_push_subscriptions s join public.profiles r on r.id = s.user_id
      where lower(r.email) = i.email and s.disabled_at is null), '[]')
  )), '[]')
  from claimed i join public.agenda_trabajos a on a.id = i.job_id;
$$;
create policy tito_invitation_worker on public.tito_job_invitations for all to service_role using (true) with check (true);
revoke all on function public.claim_job_invitation_deliveries() from public, anon, authenticated;
grant execute on function public.claim_job_invitation_deliveries() to service_role;
