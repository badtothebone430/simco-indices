# Collector

Scheduled collector for Simcotools market data.

Responsibilities:

1. Loop over realms `0` and `1`.
2. Fetch resource metadata.
3. Fetch market summaries with throttling.
4. Store daily resource/quality market rows.
5. Compute index values and index components.

The Simcotools API has a global rate limit of 2 requests per second, so any per-resource collector must throttle requests.

The first implementation lives in `../supabase/functions/collect-market`.
