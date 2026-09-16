
-- Synthetic account only; ROLLBACK removes the account and all test data.
BEGIN;
DO $test$
DECLARE
  test_uid uuid := gen_random_uuid();
  test_email text;
  input jsonb;
  output jsonb;
  expected text[];
  actual text[];
BEGIN
  test_email := 'tito-regression-' || test_uid || '@example.invalid';
  INSERT INTO auth.users(id,email) VALUES(test_uid,test_email);
  INSERT INTO public.beta_users(email,active,role) VALUES(test_email,true,'tester');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',test_uid,'email',test_email,'role','authenticated')::text,true);

  input := '{"clientes":[{"id":1,"nombre":"Regression","proyectos":[
    {"id":1,"concepto":"Invoice","monto":100,"estado":"facturado","fecha":"2026-09-01"},
    {"id":2,"concepto":"Done","monto":200,"estado":"realizado","fecha":"2026-09-02"},
    {"id":3,"concepto":"Paid","monto":300,"estado":"pagado","fecha":"2026-09-03"},
    {"id":4,"concepto":"Legacy","monto":400,"estado":"pendiente","fecha":"2026-09-04"},
    {"id":5,"concepto":"Missing","monto":500,"fecha":"2026-09-05"},
    {"id":6,"concepto":"Invalid","monto":600,"estado":"unknown","fecha":"2026-09-06"}]}],
    "colaboradores":[{"id":1,"nombre":"Team","pagos":[
    {"id":1,"concepto":"Paid team","monto":50,"estado":"pagado","fecha":"2026-09-03"},
    {"id":2,"concepto":"Pending team","monto":60,"estado":"pendiente","fecha":"2026-09-04"}]}],
    "equipo":[{"id":1,"nombre":"Camera","categoria":"video","monto":700,"fecha":"2026-09-01"}]}'::jsonb;
  PERFORM public.sync_tito_snapshot(input);
  output := public.load_tito_snapshot();
  SELECT array_agg(p->>'estado' ORDER BY (p->>'id')::int) INTO actual
    FROM jsonb_array_elements(output->'clientes'->0->'proyectos') p;
  expected := ARRAY['facturado','realizado','pagado','pendiente','pendiente','pendiente'];
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Project states: expected %, got %', expected, actual;
  END IF;
  IF output->'colaboradores'->0->'pagos' IS DISTINCT FROM input->'colaboradores'->0->'pagos' THEN
    RAISE EXCEPTION 'Team payments changed';
  END IF;
  IF output->'equipo' IS DISTINCT FROM input->'equipo' THEN
    RAISE EXCEPTION 'Gear changed';
  END IF;
  IF output->'clientes'->0->'proyectos'->2 IS DISTINCT FROM input->'clientes'->0->'proyectos'->2 THEN
    RAISE EXCEPTION 'Paid project changed';
  END IF;
  PERFORM public.sync_tito_snapshot(output);
  IF public.load_tito_snapshot() IS DISTINCT FROM output THEN
    RAISE EXCEPTION 'Second round trip changed snapshot';
  END IF;
END;
$test$;
ROLLBACK;
