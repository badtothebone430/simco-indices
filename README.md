# Simco Indices

Static dashboard and scheduled data collector for SimCompanies market indices.

## Structure

- `frontend/` - Netlify-hosted web app.
- `collector/` - scheduled job for fetching Simcotools data and computing indices.
- `docs/` - project notes, API decisions, and setup instructions.

## Initial Architecture

- Frontend: Netlify static site.
- Data source: Simcotools API.
- Storage: Supabase Postgres.
- Scheduler: Supabase Edge Function/Cron or another scheduled worker platform.

Every index is calculated separately for both realms:

- `0` - Magnates
- `1` - Entrepreneurs

