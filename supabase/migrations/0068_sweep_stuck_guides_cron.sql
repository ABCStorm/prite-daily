-- Invoke sweep-stuck-guides every 10 minutes so a study-guide isolate that
-- dies mid-slides/narration cannot leave a shared link with no audio.
-- Reuses the same CRON_SECRET already stored on the daily-reminders job.

do $$
declare
  sec text;
begin
  select substring(command from 'x-cron-secret'',''([^'']+)')
    into sec
  from cron.job
  where jobname = 'prite-daily-reminders';

  if sec is null or length(sec) < 16 then
    raise exception 'could not read cron secret from prite-daily-reminders job';
  end if;

  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'prite-sweep-stuck-guides';

  perform cron.schedule(
    'prite-sweep-stuck-guides',
    '*/10 * * * *',
    format(
      $c$
      select net.http_post(
        url     := 'https://wehgcawkkqzpfkwkvltq.functions.supabase.co/sweep-stuck-guides',
        headers := jsonb_build_object('content-type','application/json','x-cron-secret', %L),
        body    := '{}'::jsonb
      );
      $c$,
      sec
    )
  );
end $$;
