# Supabase Setup

## 1. Create Project

Create a Supabase project and keep these values handy:

```txt
Project URL
anon public key
service_role key
```

The frontend only gets:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The collector gets:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
COLLECTOR_SECRET
```

## 2. Apply Schema

In the Supabase SQL editor, run:

```txt
supabase/migrations/202606150001_initial_schema.sql
```

Or use the Supabase CLI from this directory:

```powershell
supabase link --project-ref <project-ref>
supabase db push
```

## 3. Deploy Collector

From `simco-indices/`:

```powershell
supabase functions deploy collect-market
```

Set secrets:

```powershell
supabase secrets set SUPABASE_URL="<project-url>"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
supabase secrets set COLLECTOR_SECRET="<random-long-secret>"
```

## 4. Test Collector

```powershell
supabase functions invoke collect-market --no-verify-jwt --headers "x-collector-secret: <random-long-secret>"
```

The first run should take a few minutes because Simcotools has a 2 requests/second global rate limit and the collector fetches per-resource market summaries for both realms.

## 5. Schedule Daily Run

Use Supabase scheduled functions / cron to call:

```txt
https://<project-ref>.functions.supabase.co/collect-market
```

Include this header:

```txt
x-collector-secret: <random-long-secret>
```

Recommended schedule:

```txt
30 1 * * *
```

That runs at 01:30 UTC daily.

