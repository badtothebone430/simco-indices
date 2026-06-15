import { createClient } from '@supabase/supabase-js'

const SIMCOTOOLS_BASE_URL = 'https://api.simcotools.com'
const REALMS = [0, 1]
const RATE_LIMIT_DELAY_MS = 2500
const MAX_FETCH_ATTEMPTS = 5
const BASE_INDEX_VALUE = 1000
const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS ?? 30)
const QUALITY_LEVELS = Array.from({ length: 13 }, (_, quality) => quality)

const FOOD_RESOURCE_NAMES = new Set([
  'apple cider',
  'apple icecream',
  'apple pie',
  'apples',
  'bread',
  'butter',
  'cheese',
  'chocolate',
  'chocolate icecream',
  'cocktails',
  'cocoa',
  'coffee beans',
  'coffee powder',
  'cream egg',
  'dough',
  'easter bunny',
  'eggs',
  'flour',
  'fodder',
  'ginger beer',
  'grain',
  'milk',
  'orange juice',
  'oranges',
  'sausages',
  'steak',
  'sugar',
  'sugarcane',
  'vegetable oil',
  'vegetables',
])

const CONSTRUCTION_RESOURCE_NAMES = new Set([
  'beams',
  'bricks',
  'bulldozer',
  'cement',
  'clay',
  'construction units',
  'glass',
  'limestone',
  'planks',
  'sand',
  'tools',
  'windows',
  'wood',
])

class SimcotoolsError extends Error {
  constructor(path, status) {
    super(`Simcotools ${path} failed with ${status}`)
    this.status = status
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelayMs(response, attempt) {
  const retryAfterHeader = response.headers.get('retry-after')
  const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader)

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000
  }

  return RATE_LIMIT_DELAY_MS * attempt * 3 + Math.floor(Math.random() * 1000)
}

async function fetchJson(path) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${SIMCOTOOLS_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    })

    if (response.ok) {
      return response.json()
    }

    if (response.status === 429 && attempt < MAX_FETCH_ATTEMPTS) {
      const retryDelay = retryDelayMs(response, attempt)
      console.log(`429 from ${path}; retrying in ${Math.round(retryDelay / 1000)}s`)
      await sleep(retryDelay)
      continue
    }

    throw new SimcotoolsError(path, response.status)
  }

  throw new SimcotoolsError(path, 0)
}

async function fetchResources(realm) {
  const data = await fetchJson(`/v1/realms/${realm}/resources?type=all&disable_pagination=true`)
  return data.resources ?? []
}

async function fetchPrices(realm) {
  const data = await fetchJson(`/v1/realms/${realm}/market/prices`)
  return data.prices ?? []
}

async function fetchCandlesticks(realm, resourceId, quality) {
  return fetchJson(`/v1/realms/${realm}/market/resources/${resourceId}/${quality}/candlesticks`)
}

function toDateOnly(value) {
  return value.slice(0, 10)
}

function isResearchRow(row) {
  return row.resource_name.toLowerCase().includes('research')
}

function isFoodRow(row) {
  return FOOD_RESOURCE_NAMES.has(row.resource_name.toLowerCase())
}

function isConstructionRow(row) {
  return CONSTRUCTION_RESOURCE_NAMES.has(row.resource_name.toLowerCase())
}

function weightedReturn(rows, weightField) {
  if (rows.length === 0) {
    return null
  }

  const rowsWithReturn = rows.filter((row) => row.vwap_change_percent !== null)
  const activeRows = rowsWithReturn.length > 0 ? rowsWithReturn : rows
  const totalWeight = activeRows.reduce(
    (sum, row) => sum + (weightField === 'equal' ? 1 : row.market_value),
    0,
  )

  if (totalWeight <= 0) {
    return null
  }

  return activeRows.reduce((sum, row) => {
    const weight = weightField === 'equal' ? 1 : row.market_value
    return sum + (row.vwap_change_percent ?? 0) * weight
  }, 0) / totalWeight
}

function indexSpecRows(dateRows) {
  const rankedRows = [...dateRows].sort((a, b) => b.market_value - a.market_value)
  return [
    ['total_market', dateRows, 'market_value'],
    ['sc_10', rankedRows.slice(0, 10), 'market_value'],
    ['sc_30', rankedRows.slice(0, 30), 'market_value'],
    ['sc_50', rankedRows.slice(0, 50), 'market_value'],
    ['research_only', dateRows.filter(isResearchRow), 'market_value'],
    ['food_only', dateRows.filter(isFoodRow), 'market_value'],
    ['construction_only', dateRows.filter(isConstructionRow), 'market_value'],
    ['equal_weight_market', dateRows, 'equal'],
    ['quality_0', dateRows.filter((row) => row.quality === 0 && !isResearchRow(row)), 'market_value'],
    ['quality_0_with_research', dateRows.filter((row) => row.quality === 0), 'market_value'],
    ...QUALITY_LEVELS.slice(1).map((quality) => [
      `quality_${quality}`,
      dateRows.filter((row) => row.quality === quality && !isResearchRow(row)),
      'market_value',
    ]),
  ]
}

function buildBackfillIndices(realm, rows, dates) {
  const previousValues = new Map()
  const indexValues = []
  const indexComponents = []

  for (const date of dates) {
    const dateRows = rows.filter((row) => row.date === date)

    for (const [indexCode, selectedRows, weightField] of indexSpecRows(dateRows)) {
      if (selectedRows.length === 0) {
        continue
      }

      const previousValue = previousValues.get(indexCode) ?? BASE_INDEX_VALUE
      const dailyReturn = previousValues.has(indexCode) ? weightedReturn(selectedRows, weightField) ?? 0 : 0
      const value = previousValue * (1 + dailyReturn)
      previousValues.set(indexCode, value)

      const totalMarketValue = selectedRows.reduce((sum, row) => sum + row.market_value, 0)
      const denominator = weightField === 'equal' ? selectedRows.length : totalMarketValue

      indexValues.push({
        index_code: indexCode,
        realm_id: realm,
        date,
        value,
        component_count: selectedRows.length,
        total_market_value: totalMarketValue,
      })

      indexComponents.push(
        ...selectedRows.map((row) => ({
          index_code: indexCode,
          realm_id: realm,
          date,
          resource_id: row.resource_id,
          resource_name: row.resource_name,
          quality: row.quality,
          weight: weightField === 'equal' ? 1 / selectedRows.length : row.market_value / denominator,
          vwap: row.vwap,
          volume: row.volume,
          market_value: row.market_value,
        })),
      )
    }
  }

  return { indexValues, indexComponents }
}

async function upsertInChunks(supabase, table, rows, onConflict) {
  const chunkSize = 500
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) {
      throw new Error(`${table} upsert failed: ${error.message}`)
    }
  }
}

function buildRowsFromCandles(realm, resource, quality, candlesticks) {
  const sorted = [...candlesticks].sort((a, b) => a.date.localeCompare(b.date))

  return sorted.flatMap((candle, index) => {
    const vwap = Number(candle.vwap)
    const volume = Number(candle.volume)
    if (!candle.date || !Number.isFinite(vwap) || !Number.isFinite(volume) || vwap <= 0 || volume <= 0) {
      return []
    }

    const previous = sorted[index - 1]
    const previousVwap = previous ? Number(previous.vwap) : null
    const vwapChange =
      previousVwap && Number.isFinite(previousVwap) && previousVwap > 0 ? vwap / previousVwap - 1 : null

    return [
      {
        realm_id: realm,
        resource_id: resource.id,
        resource_name: resource.name,
        quality,
        date: toDateOnly(candle.date),
        close: candle.close ?? null,
        vwap,
        vwap_change_percent: vwapChange,
        volume,
        market_value: vwap * volume,
        raw: candle,
      },
    ]
  })
}

async function backfillRealm(supabase, realm) {
  const resources = await fetchResources(realm)
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]))
  const prices = await fetchPrices(realm)
  const pairs = Array.from(new Set(prices.map((price) => `${price.resourceId}:${price.quality}`)))
  const allRows = []
  const skippedPairs = []

  console.log(`Realm ${realm}: ${resources.length} resources, ${pairs.length} resource-quality pairs`)

  await upsertInChunks(
    supabase,
    'resources',
    resources.map((resource) => ({
      realm_id: realm,
      resource_id: resource.id,
      name: resource.name,
      is_research: resource.isResearch ?? null,
      transportation: resource.transportation ?? null,
      produced_an_hour: resource.producedAnHour ?? null,
      inputs: resource.inputs ?? {},
      retail_info: resource.retailInfo ?? null,
      raw: resource,
      updated_at: new Date().toISOString(),
    })),
    'realm_id,resource_id',
  )

  for (const [index, pair] of pairs.entries()) {
    const [resourceIdRaw, qualityRaw] = pair.split(':')
    const resourceId = Number(resourceIdRaw)
    const quality = Number(qualityRaw)
    const resource = resourceById.get(resourceId)

    if (!resource) {
      continue
    }

    await sleep(RATE_LIMIT_DELAY_MS)

    try {
      const data = await fetchCandlesticks(realm, resourceId, quality)
      allRows.push(...buildRowsFromCandles(realm, resource, quality, data.candlesticks ?? []))
    } catch (error) {
      if (error instanceof SimcotoolsError && (error.status === 404 || error.status === 422)) {
        skippedPairs.push({ resourceId, quality, status: error.status })
        continue
      }
      throw error
    }

    if ((index + 1) % 50 === 0) {
      console.log(`Realm ${realm}: fetched ${index + 1}/${pairs.length} candlestick series`)
    }
  }

  const targetDates = Array.from(new Set(allRows.map((row) => row.date))).sort().slice(-BACKFILL_DAYS)
  const targetDateSet = new Set(targetDates)
  const rows = allRows.filter((row) => targetDateSet.has(row.date))
  const { indexValues, indexComponents } = buildBackfillIndices(realm, rows, targetDates)

  await upsertInChunks(supabase, 'market_daily', rows, 'realm_id,resource_id,quality,date')
  await upsertInChunks(supabase, 'index_values', indexValues, 'index_code,realm_id,date')
  await upsertInChunks(
    supabase,
    'index_components',
    indexComponents,
    'index_code,realm_id,date,resource_id,quality',
  )

  return {
    realm,
    pairs: pairs.length,
    skippedPairs,
    dates: targetDates.length,
    marketRows: rows.length,
    indexValues: indexValues.length,
    indexComponents: indexComponents.length,
  }
}

async function main() {
  const supabaseUrl = process.env.SIMCO_SUPABASE_URL
  const secretKey = process.env.SIMCO_SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing SIMCO_SUPABASE_URL or SIMCO_SUPABASE_SECRET_KEY')
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  })

  const results = []
  for (const realm of REALMS) {
    results.push(await backfillRealm(supabase, realm))
  }

  console.log(JSON.stringify({ ok: true, backfillDays: BACKFILL_DAYS, results }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
