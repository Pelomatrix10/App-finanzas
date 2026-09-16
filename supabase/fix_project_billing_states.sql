-- Preserve project billing states; keep legacy pendiente and payment behavior.
-- Apply atomically. No existing rows are updated or deleted by this script.
BEGIN;

ALTER TABLE public.proyectos DROP CONSTRAINT proyectos_estado_check;
ALTER TABLE public.proyectos ADD CONSTRAINT proyectos_estado_check
  CHECK (estado IN ('pendiente', 'realizado', 'facturado', 'pagado'));

CREATE OR REPLACE FUNCTION public.sync_tito_snapshot(snapshot jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  mail text := auth.jwt() ->> 'email';
  allowed boolean;
  c jsonb;
  p jsonb;
  g jsonb;
  client_uuid uuid;
  collab_uuid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select exists (
    select 1 from public.beta_users b
    where lower(b.email)=lower(mail)
      and b.active=true
      and (b.expires_at is null or b.expires_at > now())
  ) into allowed;

  if not allowed then raise exception 'beta access denied'; end if;

  delete from public.proyectos where user_id=uid;
  delete from public.pagos where user_id=uid;
  delete from public.clientes where user_id=uid;
  delete from public.colaboradores where user_id=uid;
  delete from public.gear where user_id=uid;

  for c in select value from jsonb_array_elements(coalesce(snapshot->'clientes','[]'::jsonb)) loop
    insert into public.clientes(user_id,legacy_id,nombre,nota)
    values(uid,(c->>'id')::bigint,coalesce(c->>'nombre','Sin nombre'),nullif(c->>'nota',''))
    returning id into client_uuid;
    for p in select value from jsonb_array_elements(coalesce(c->'proyectos','[]'::jsonb)) loop
      insert into public.proyectos(user_id,cliente_id,legacy_id,concepto,monto,estado,fecha)
      values(uid,client_uuid,(p->>'id')::bigint,coalesce(p->>'concepto','Sin concepto'),greatest(coalesce((p->>'monto')::numeric,0),0),case when p->>'estado' in ('realizado','facturado','pagado') then p->>'estado' else 'pendiente' end,coalesce((p->>'fecha')::date,current_date));
    end loop;
  end loop;

  for c in select value from jsonb_array_elements(coalesce(snapshot->'colaboradores','[]'::jsonb)) loop
    insert into public.colaboradores(user_id,legacy_id,nombre,rol)
    values(uid,(c->>'id')::bigint,coalesce(c->>'nombre','Sin nombre'),nullif(c->>'rol',''))
    returning id into collab_uuid;
    for p in select value from jsonb_array_elements(coalesce(c->'pagos','[]'::jsonb)) loop
      insert into public.pagos(user_id,colaborador_id,legacy_id,concepto,monto,estado,fecha)
      values(uid,collab_uuid,(p->>'id')::bigint,coalesce(p->>'concepto','Sin concepto'),greatest(coalesce((p->>'monto')::numeric,0),0),case when p->>'estado'='pagado' then 'pagado' else 'pendiente' end,coalesce((p->>'fecha')::date,current_date));
    end loop;
  end loop;

  for g in select value from jsonb_array_elements(coalesce(snapshot->'equipo','[]'::jsonb)) loop
    insert into public.gear(user_id,legacy_id,nombre,categoria,monto,fecha)
    values(uid,(g->>'id')::bigint,coalesce(g->>'nombre','Sin nombre'),nullif(g->>'categoria',''),greatest(coalesce((g->>'monto')::numeric,0),0),coalesce((g->>'fecha')::date,current_date));
  end loop;
end;
$function$;

COMMIT;
