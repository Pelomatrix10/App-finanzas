-- Run only after tito-reminders is deployed and its authenticated bootstrap succeeds.
select cron.schedule('tito-agenda-reminders','* * * * *','select tito_private.dispatch_reminders();');