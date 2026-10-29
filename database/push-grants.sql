grant select on public.agenda_trabajos,public.profiles,public.beta_users to service_role;
revoke all on public.tito_push_public_config,public.tito_push_subscriptions,public.tito_push_deliveries from anon,authenticated;
grant select on public.tito_push_public_config to authenticated;
grant select,delete on public.tito_push_subscriptions to authenticated;
create policy push_delivery_server_only on public.tito_push_deliveries for all to service_role using(true) with check(true);