create function public.tito_reminder_is_current(delivery_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 select exists(
 select 1 from public.tito_push_deliveries d join public.agenda_trabajos a on a.id=d.job_id
 join public.tito_push_subscriptions s on s.id=d.subscription_id and s.user_id=a.user_id
 where d.id=delivery_id and d.sent_at is null and a.estado='Confirmado' and a.asistio_at is null
 and s.disabled_at is null and d.scheduled_at<=now() and d.scheduled_at>now()-interval '30 minutes'
 and d.scheduled_at=case when d.kind='day_before' then ((a.fecha-1)+time '18:00') at time zone 'America/Lima' else ((a.fecha+coalesce(a.inicio,time '09:00'))-interval '1 hour') at time zone 'America/Lima' end
 and exists(select 1 from public.profiles p join public.beta_users b on lower(b.email)=lower(p.email) where p.id=a.user_id and b.active and (b.expires_at is null or b.expires_at>now()))
 );
$$;
revoke all on function public.tito_reminder_is_current(uuid) from public,anon,authenticated;
grant execute on function public.tito_reminder_is_current(uuid) to service_role;