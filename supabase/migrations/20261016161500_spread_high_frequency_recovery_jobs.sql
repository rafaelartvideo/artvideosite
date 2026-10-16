-- Distribui rotinas de recuperação que antes iniciavam no mesmo minuto.
-- Idempotente por nome, sem substituir os comandos das rotinas.
do $$
declare
  v_job record;
begin
  for v_job in select jobid,jobname from cron.job
    where jobname in (
      'sac-digital-projection-recovery',
      'sac-digital-worker-recovery',
      'sac-digital-external-reconciliation',
      'work-items-reminders-5min'
    )
  loop
    perform cron.alter_job(job_id := v_job.jobid,
      schedule := case v_job.jobname
        when 'sac-digital-projection-recovery' then '*/2 * * * *'
        when 'sac-digital-worker-recovery' then '1-59/2 * * * *'
        when 'sac-digital-external-reconciliation' then '1-59/5 * * * *'
        when 'work-items-reminders-5min' then '3-59/5 * * * *'
      end);
  end loop;
end
$$;
