# Collector

Scheduled collector for Simcotools market data.

Responsibilities:

1. Loop over realms `0` and `1`.
2. Fetch resource metadata.
3. Fetch market summaries with throttling.
4. Store daily resource/quality market rows.
5. Compute index values and index components.
6. Compute quality-specific indices for Q0-Q12. Q0 has a separate
   `quality_0_with_research` index for the frontend toggle.

The Simcotools API has a global rate limit of 2 requests per second, so any per-resource collector must throttle requests.

The production collector lives in `collect-market.mjs` and runs through GitHub Actions.

## Local Run

```powershell
npm install
$env:SIMCO_SUPABASE_URL="https://<project-ref>.supabase.co"
$env:SIMCO_SUPABASE_SECRET_KEY="<secret-key>"
npm run collect
```

## GitHub Actions

Set these repository secrets:

```txt
SIMCO_SUPABASE_URL
SIMCO_SUPABASE_SECRET_KEY
```

The workflow is `.github/workflows/collect-market.yml`.

## 30-Day Backfill

Use the manual GitHub workflow:

```txt
Actions -> Backfill 30 days -> Run workflow
```

This uses Simcotools candlestick history and should only be run on demand.
