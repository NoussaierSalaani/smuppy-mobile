-- ===========================================
-- CRON JOB: Auto Content Generation
-- Runs every 2 days at 10:00 AM UTC
-- ===========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the content generation function
SELECT cron.schedule(
  'generate-bot-content-job',
  '0 10 */2 * *',  -- Every 2 days at 10:00 AM UTC
  $$
  SELECT net.http_post(
    url := 'https://wbgfaeytioxnkdsuvvlx.supabase.co/functions/v1/generate-bot-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify the job was created
SELECT * FROM cron.job WHERE jobname = 'generate-bot-content-job';
