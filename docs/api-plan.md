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

Each index exists once per realm.

## Weighting

Preferred weighting for activity indices:

```txt
market_value = lastDayCandlestick.vwap * lastDayCandlestick.volume
```
