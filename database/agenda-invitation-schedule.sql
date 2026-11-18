select cron.schedule('tito-job-invitations', '* * * * *', $schedule$
  select net.http_post(
    url := 'https://tphnmrxjvgomlhcsmtxt.supabase.co/functions/v1/tito-invitations',
    headers := jsonb_build_object('Content-Type','application/json','x-tito-worker-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='tito_push_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 25000
  )
  where exists(select 1 from public.tito_job_invitations
    where channel='app' and delivery='queued' and next_attempt <= now() and attempts < 4);
$schedule$);