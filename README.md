# Simco Indices

Simco Indices is an unofficial SimCompanies market dashboard. It builds market-style indices from Simcotools market data, stores the calculated history in Supabase, and serves a static React frontend through Netlify.

The important architecture choice is that the website itself is static. Users load HTML, CSS, and JavaScript from Netlify, then the browser reads public market data from Supabase. The expensive work, fetching Simcotools data and calculating indices, runs on a schedule instead of happening per page view.

## What The Site Does

- Tracks both SimCompanies realms:
  - `0` - Magnates
  - `1` - Entrepreneurs
- Builds index histories for broad market, top-market-value baskets, quality groups, research, food, construction, and sector groups.
- Shows dashboard picks, market summaries, technical signals, events, contests, phases, government orders, and resource comparisons.
- Lets users compare indices and individual resource-quality pairs across realms.
- Stores comparison presets and display preferences in browser storage.
- Keeps the app cheap to host by updating the database on a schedule instead of running a live backend for every visitor.

## Repository Structure

```text
.
+-- .github/workflows/          GitHub Actions jobs for collection and backfills
+-- collector/                  Node scripts that fetch Simcotools data and write Supabase rows
+-- docs/                       Project notes and setup references
+-- frontend/                   Vite + React static web app deployed by Netlify
+-- supabase/                   Supabase config, migrations, and older Edge Function work
+-- netlify.toml                Netlify build, redirect, and scheduled function config
+-- README.md                   This file
```

## High-Level Architecture

```text
Simcotools API
    |
    | scheduled fetches
    v
GitHub Actions / Netlify scheduled trigger
    |
    | runs collector/*.mjs
    v
Supabase Postgres
    |
    | public read queries from browser
    v
Netlify static React frontend
```

There are three main parts:

1. Frontend: a static Vite React app in `frontend/`.
2. Backend collector: Node scripts in `collector/` run by GitHub Actions.
3. Database: Supabase Postgres tables created by SQL migrations in `supabase/migrations/`.

The frontend does not call Simcotools directly. That keeps user traffic from multiplying API usage. Simcotools is only hit by scheduled collector jobs and manual backfills.

## Frontend

The frontend lives in `frontend/` and is built with:

- React 19
- TypeScript
- Vite
- Recharts
- Supabase JS client
- Lucide React icons

Key files:

```text
frontend/src/App.tsx       Main application logic and UI
frontend/src/App.css       Component styling, layout, responsive behavior, dark mode
frontend/src/main.tsx      React entry point
frontend/public/           Static public assets
frontend/package.json      Frontend scripts and dependencies
```

### Frontend Build And Deploy

Netlify is configured from `netlify.toml`:

```toml
[build]
  base = "frontend"
  command = "npm run build"
  publish = "dist"
```

That means Netlify:

1. Enters the `frontend/` directory.
2. Runs `npm run build`.
3. Publishes `frontend/dist`.

The build command is:

```bash
npm run build
```

Which runs:

```bash
tsc -b && vite build
```

So TypeScript is checked first, then Vite bundles the app into static files.

### Why The Frontend Is Static

The site does not need a traditional always-running backend because market data only updates once per day. The deployed app is just static files:

- `index.html`
- bundled JavaScript
- bundled CSS
- icons/assets

When someone visits the site, their browser loads those files and reads data from Supabase. The app does not calculate the whole market on demand. It displays data already collected and calculated by the scheduled backend jobs.

This is why Netlify works well here: Netlify hosts the static app, while Supabase stores the dynamic data.

### Frontend Data Access

The frontend uses the Supabase public anon/publishable key to read public tables. Row level security is enabled in Supabase, and read policies allow public selects on the market data tables.

The frontend reads data such as:

- `index_definitions`
- `index_values`
- `index_components`
- `market_daily`
- `realm_phases`
- `realm_events`
- `realm_contests`
- `realm_government_orders`

The secret Supabase service role key is never used in frontend code. It belongs only in GitHub Actions secrets or trusted backend environments.

### Frontend Views

The app currently has these major views:

- Dashboard: realm summaries, daily signals, resources to watch, technical analysis, and mini charts.
- Overview: index chart, current basket table, index descriptions, and realm/index filters.
- Comparisons: multi-line charting for indices and resources across realms.
- Tools: external SimCompanies tooling links.
- Changelog: user-facing update history.

The frontend keeps several user preferences in `localStorage`, including:

- selected comparison setup
- saved comparison presets
- chart filters
- whether the guided tour was dismissed
- cached market data for faster repeat visits

### Charting

Charts use Recharts. The app uses:

- `LineChart` / `ComposedChart`
- `Line`
- `Bar`
- `Tooltip`
- `Legend`
- `Brush`
- custom overlays for phases, events, contests, orders, and technical levels

Comparison charts support:

- percent change mode
- absolute value mode
- VWAP or market value for resource lines
- optional volume bars
- brush-based timeline control
- timeframe presets such as `7D`, `14D`, `1M`, `2M`, `5M`, `1Y`, and `All`

### Responsive UI

The frontend is designed to work on desktop and mobile:

- desktop uses tab-style navigation and wider chart panels
- mobile uses a hamburger navigation pattern
- controls stack on smaller screens
- charts and tables use constrained layouts to avoid overflow

Dark mode is supported through CSS variables and a theme toggle. The selected theme is stored in browser storage.

## Backend Collector

The backend lives in `collector/`. It is not a long-running web server. It is a set of Node scripts that run, collect data, write to Supabase, then exit.

Key files:

```text
collector/collect-market.mjs              Daily collection job
collector/backfill-30d.mjs                Historical market backfill job
collector/backfill-government-orders.mjs  Government-order-only backfill job
collector/package.json                    Collector scripts and dependencies
collector/.env.example                    Environment variable reference
```

Collector scripts use:

- Node.js
- native `fetch`
- `@supabase/supabase-js`
- Simcotools API endpoints
- Supabase service role key for writes

### Daily Collector

The daily collector script is:

```bash
npm run collect
```

Which runs:

```bash
node collect-market.mjs
```

It does the daily update:

1. Fetches resource metadata for each realm.
2. Fetches daily market data for tracked resources and qualities.
3. Fetches context data such as phases, events, contests, and government orders.
4. Calculates index values.
5. Writes/upserts rows into Supabase.
6. Optionally posts a Discord webhook notification when configured.

The collector writes both realms every run:

- Magnates, realm `0`
- Entrepreneurs, realm `1`

### Historical Backfill

Historical price and volume data is handled by:

```bash
npm run backfill:30d
```

Despite the script name, it now supports more than only 30 days. It can be controlled with environment variables:

- `BACKFILL_DAYS`
- `BACKFILL_START_DATE`
- `BACKFILL_END_DATE`
- `BACKFILL_REALM`

Examples:

```bash
BACKFILL_DAYS=30 npm run backfill:30d
```

```bash
BACKFILL_START_DATE=2026-05-01 BACKFILL_END_DATE=2026-06-15 BACKFILL_REALM=0 npm run backfill:30d
```

The backfill job exists because the daily collector only adds new daily snapshots going forward. If the database needs older history, a backfill pulls historical candles from Simcotools and calculates index values for those older dates.

### Government Orders Backfill

Government orders have their own faster backfill script:

```bash
npm run backfill:orders
```

It is separate from market price backfills because orders are lighter and do not require recalculating every market index.

It uses the same date-style environment variables:

- `BACKFILL_START_DATE`
- `BACKFILL_END_DATE`
- `BACKFILL_REALM`

### Rate Limiting

The collector intentionally avoids being a live request proxy. That matters because the Simcotools API should not be hit for every user visit.

The collector handles rate limits by:

- running on a fixed schedule
- fetching data once for everyone
- storing results in Supabase
- using backfills only when needed
- spacing/retrying API requests where the scripts support it

If Simcotools returns `429`, the collector may retry, but the safest operational approach is still to keep scheduled collection predictable and avoid unnecessary manual reruns.

## GitHub Actions

GitHub Actions are used for the trusted backend jobs because they can safely access repository secrets.

Workflows:

```text
.github/workflows/collect-market.yml              Manual daily collector job
.github/workflows/backfill-30d.yml                Backfill latest N days
.github/workflows/backfill-range.yml              Backfill an exact date range
.github/workflows/backfill-government-orders.yml  Backfill government orders only
```

### `collect-market.yml`

Runs the daily collector:

```bash
npm run collect
```

Required secrets:

- `SIMCO_SUPABASE_URL`
- `SIMCO_SUPABASE_SECRET_KEY`

Optional secret:

- `DISCORD_WEBHOOK`

### `backfill-30d.yml`

Manual workflow for backfilling a latest-day range.

Inputs:

- `days`
- `realm`

The realm input accepts:

- `all`
- `0`
- `1`

### `backfill-range.yml`

Manual workflow for backfilling an exact historical date range.

Inputs:

- `start_date`
- `end_date`
- `realm`

This is the safest way to fill a specific historical period without guessing how many days to request.

### `backfill-government-orders.yml`

Manual workflow for order-only historical backfills.

Inputs:

- `start_date`
- `end_date`
- `realm`

This exists so order data can be backfilled quickly without running the full market history collector.

## Netlify

Netlify hosts the frontend and also contains a scheduled function trigger.

`netlify.toml` contains:

```toml
[functions."trigger-collect"]
  schedule = "20 1 * * *"
```

That schedule is `01:20 UTC`. The user-facing site says the market update is around `01:30 UTC`, because the collection job needs time to run and visible changes may arrive a little later.

The scheduled Netlify function is in:

```text
frontend/netlify/functions/trigger-collect.cjs
```

Its job is to trigger the GitHub workflow rather than directly doing the whole data collection itself. This keeps the heavier collector work in GitHub Actions and avoids Netlify function runtime limits.

### Netlify Redirects

The app is a single-page React app, so `netlify.toml` also contains:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

That makes direct links and browser refreshes work even though React handles the routing/view state client-side.

## Supabase Database

Supabase is used as the persistent database. It stores:

- resource metadata
- daily market rows
- index definitions
- calculated index values
- index component weights
- realm phase/event/contest context
- government orders

Migrations live in:

```text
supabase/migrations/
```

Important tables include:

| Table | Purpose |
| --- | --- |
| `realms` | Realm lookup table for Magnates and Entrepreneurs. |
| `resources` | Resource metadata from Simcotools. |
| `market_daily` | Daily per-resource, per-quality VWAP, volume, and market value. |
| `index_definitions` | Metadata for each index code. |
| `index_values` | Daily calculated index values. |
| `index_components` | Daily component weights for each index. |
| `realm_phases` | Market phase periods. |
| `realm_events` | Speed modifier/event context. |
| `realm_contests` | Contest periods. |
| `realm_government_orders` | Government order demand context. |

### Read/Write Model

The browser uses public read access. The collector uses private write access.

Frontend:

- uses Supabase publishable/anon key
- can only read public data
- never writes market data

Collector:

- uses Supabase service role/secret key
- can upsert collected and calculated rows
- only runs in trusted environments such as GitHub Actions

### Row Level Security

Tables have row level security enabled. Public read policies allow the frontend to select market data, but the frontend does not receive a secret key.

This is the core security boundary:

- public browser key: safe for read-only data
- service role key: private, write-capable, never shipped to users

## Indices

Every index is calculated independently for both realms.

Current index groups include:

- `total_market`
- `equal_weight_market`
- `sc_10`
- `sc_30`
- `sc_50`
- `research_only`
- `food_only`
- `construction_only`
- quality indices from `quality_0` through `quality_12`
- `quality_0_with_research`
- sector indices such as agriculture, energy, electronics, automotive, aerospace, fashion, resources, seasonal, and others

### Weighting

Most indices are weighted by market value:

```text
market_value = vwap * volume
```

That means a price move in a high-volume resource matters more than the same percentage move in a resource that barely trades.

For example, a small move in Power can be more important to the dashboard than a huge move in a low-volume seasonal item, because Power has much larger traded volume and market value.

### Component Rows

`index_components` stores the rows that make up each index on each date. This powers the current basket table in the frontend.

For sector indices, all matching resource-quality pairs should be included in calculation and display. The frontend fetches component rows from Supabase and sorts them by weight so users can inspect what is driving the index.

## Environment Variables

### Frontend

Frontend environment variables are safe browser-readable values:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

These go in `frontend/.env.local` for local development and Netlify environment variables for production.

### Collector / GitHub Actions

Collector environment variables are private:

```text
SIMCO_SUPABASE_URL=
SIMCO_SUPABASE_SECRET_KEY=
DISCORD_WEBHOOK=
```

Backfill controls:

```text
BACKFILL_DAYS=
BACKFILL_START_DATE=
BACKFILL_END_DATE=
BACKFILL_REALM=
```

`SIMCO_SUPABASE_SECRET_KEY` should be treated like a password. Do not put it in frontend code and do not commit it.

## Local Development

### Run The Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server will print a local URL, usually:

```text
http://localhost:5173
```

Create `frontend/.env.local` with:

```text
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
```

### Build The Frontend

```bash
cd frontend
npm run build
```

This verifies TypeScript and produces the static `dist/` output.

### Run Collector Scripts Locally

```bash
cd collector
npm install
npm run collect
```

For local collector runs, create a collector env file or set environment variables in the shell:

```text
SIMCO_SUPABASE_URL=your_supabase_project_url
SIMCO_SUPABASE_SECRET_KEY=your_supabase_secret_key
```

Be careful with local collector runs because they hit the Simcotools API and write real rows to Supabase.

## Deployment Flow

Typical production flow:

1. Push frontend or collector code to GitHub.
2. Netlify builds and deploys the static frontend from `frontend/`.
3. Netlify scheduled function triggers the GitHub collector workflow around `01:20 UTC`.
4. GitHub Actions runs the collector.
5. Collector fetches Simcotools data, calculates rows, and writes Supabase.
6. Users refresh or revisit the site and see the latest database data.

Manual backfills are run from GitHub Actions when older history needs to be added.

## Cost Model

The site is designed to be cheap to run:

- Netlify serves static files.
- Supabase stores and serves database reads.
- GitHub Actions performs scheduled collection.
- Simcotools is queried by scheduled jobs, not by every visitor.

The custom domain is separate from Netlify hosting. Netlify can host the static site, but the domain itself was purchased separately.

## Operational Notes

- The displayed update time is user-facing and approximate. The backend starts earlier so the new data has time to collect and write.
- If a backfill fails halfway through, existing rows remain in Supabase because writes are upserts rather than a database wipe.
- Backfills can be slow because they intentionally fetch a lot of historical data.
- Avoid running overlapping heavy backfills unless there is a clear reason.
- The service role key should only exist in trusted backend environments.

## Useful Commands

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run lint
```

Collector:

```bash
cd collector
npm run collect
npm run backfill:30d
npm run backfill:orders
```

## Credits

Made by Loki Clarke, DevTech Industries Ltd.

This is an unofficial fan-made tool. It is not affiliated with SimCompanies or Simcotools. Market data is sourced from Simcotools.
