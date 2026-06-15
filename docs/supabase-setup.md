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
SIMCO_SUPABASE_URL
SIMCO_SUPABASE_SECRET_KEY
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

## 3. Configure GitHub Collector

The full collector is too long-running for Supabase Edge Function resource limits, so run it as a GitHub Actions scheduled workflow.

In GitHub, open repository settings:

```txt
Settings -> Secrets and variables -> Actions -> New repository secret
```

Add:

```txt
SIMCO_SUPABASE_URL=https://<project-ref>.supabase.co
SIMCO_SUPABASE_SECRET_KEY=<secret-key>
```

The workflow is:

```txt
.github/workflows/collect-market.yml
```

It runs daily at:

```txt
30 1 * * *
```

That is 01:30 UTC.

## 4. Manual Test

After pushing to GitHub, open:

```txt
Actions -> Collect market data -> Run workflow
```

The first run should take several minutes because Simcotools has a 2 requests/second global rate limit and the collector fetches per-resource market summaries for both realms.

## 5. Optional Local Test

From `collector/`:

```powershell
npm install
$env:SIMCO_SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SIMCO_SUPABASE_SECRET_KEY="<secret-key>"
npm run collect
```
