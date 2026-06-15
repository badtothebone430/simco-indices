# API Plan

Source docs: `../simcotools.yaml`

## Simcotools

Base URL:

```txt
https://api.simcotools.com
```

Known constraints:

- All dates are UTC.
- Global rate limit is 2 requests per second.

Core endpoints:

```txt
GET /v1/realms
GET /v1/realms/{realm}
GET /v1/realms/{realm}/resources?type=all&disable_pagination=true
GET /v1/realms/{realm}/market/prices
GET /v1/realms/{realm}/market/vwaps
GET /v1/realms/{realm}/market/resources/{resource}
```

## First Indices

- `total_market`
- `sc_10`
- `sc_30`
- `sc_50`
- `research_only`
- `food_only`
- `construction_only`
- `equal_weight_market`
- `quality_0`
- `quality_0_with_research`
- `quality_1` through `quality_12`

Each index exists once per realm.

## Weighting

Preferred weighting for activity indices:

```txt
market_value = lastDayCandlestick.vwap * lastDayCandlestick.volume
```

## History Policy

The daily collector should only generate index values for the latest completed
market date in each realm. Older `lastDayCandlestick` dates can appear on
illiquid resources, but those are stale per-resource observations rather than a
complete historical market snapshot.

Historical charts build naturally as the daily collector runs. The manual
`Backfill 30 days` workflow uses the candlesticks endpoint so each historical
date is computed from a deliberate daily basket.
