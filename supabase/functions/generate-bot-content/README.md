# Smuppy Auto Content Generation

This Edge Function automatically generates AI-powered posts for bot accounts every 2 days.

## How It Works

1. **Selects 5 random bot profiles** (verified accounts)
2. **Detects their specialty** based on bio (yoga, running, nutrition, etc.)
3. **Generates unique content** using Claude AI (Haiku model)
4. **Posts with relevant images** from curated Unsplash collections
5. **Adds realistic engagement** (random likes/comments count)

## Deployment Steps

### 1. Install Supabase CLI (if not installed)

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
cd /Users/noussaier/smuppy-mobile
supabase link --project-ref wbgfaeytioxnkdsuvvlx
```

### 4. Set Environment Secrets

```bash
# Set the Anthropic API key
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...your-key...

# Verify secrets are set
supabase secrets list
```

### 5. Deploy the Function

```bash
supabase functions deploy generate-bot-content
```

### 6. Set Up Cron Job (Scheduled Execution)

Go to Supabase Dashboard:
1. Open your project: https://supabase.com/dashboard/project/wbgfaeytioxnkdsuvvlx
2. Go to **Database** → **Extensions** → Enable `pg_cron`
3. Go to **SQL Editor** and run:

```sql
-- Enable the extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the function to run every 2 days at 10:00 AM UTC
SELECT cron.schedule(
  'generate-bot-content',
  '0 10 */2 * *',
  $$
  SELECT net.http_post(
    url := 'https://wbgfaeytioxnkdsuvvlx.supabase.co/functions/v1/generate-bot-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Alternative: Use Supabase Dashboard Cron

1. Go to **Edge Functions** in your Supabase Dashboard
2. Click on `generate-bot-content`
3. Click **Schedule** tab
4. Set schedule: `0 10 */2 * *` (every 2 days at 10 AM UTC)

## Testing Manually

### Via CLI
```bash
supabase functions invoke generate-bot-content
```

### Via cURL
```bash
curl -X POST "https://wbgfaeytioxnkdsuvvlx.supabase.co/functions/v1/generate-bot-content" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Configuration

Edit the function to change:

- `POSTS_PER_RUN` - Number of posts per execution (default: 5)
- Cron schedule in SQL (default: every 2 days at 10 AM)
- Image collections in `CATEGORY_IMAGES`
- Fallback content in `generatePostContent()`

## Schedule Options

| Schedule | Cron Expression |
|----------|-----------------|
| Every day at 9 AM | `0 9 * * *` |
| Every 2 days at 10 AM | `0 10 */2 * *` |
| Every 3 days at 8 AM | `0 8 */3 * *` |
| Mon/Wed/Fri at 10 AM | `0 10 * * 1,3,5` |
| Twice daily (9 AM, 6 PM) | `0 9,18 * * *` |

## Monitoring

Check function logs in Supabase Dashboard:
1. Go to **Edge Functions**
2. Click on `generate-bot-content`
3. View **Logs** tab

## Cost Estimation

- **Claude Haiku API**: ~$0.00025 per post (very cheap)
- **5 posts every 2 days** = ~75 posts/month = ~$0.02/month
