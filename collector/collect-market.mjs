import { createClient } from '@supabase/supabase-js'

const SIMCOTOOLS_BASE_URL = 'https://api.simcotools.com'
const REALMS = [0, 1]
const RATE_LIMIT_DELAY_MS = 2500
const MAX_FETCH_ATTEMPTS = 5
const BASE_INDEX_VALUE = 1000
const QUALITY_LEVELS = Array.from({ length: 13 }, (_, quality) => quality)
const startedAt = Date.now()

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

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function workflowRunUrl() {
  const serverUrl = process.env.GITHUB_SERVER_URL
  const repository = process.env.GITHUB_REPOSITORY
  const runId = process.env.GITHUB_RUN_ID

  if (!serverUrl || !repository || !runId) {
    return null
  }

  return `${serverUrl}/${repository}/actions/runs/${runId}`
}

async function sendDiscordWebhook({ ok, results, error }) {
  const webhookUrl = process.env.DISCORD_WEBHOOK
  if (!webhookUrl) {
    return
  }

  const runUrl = workflowRunUrl()
  const duration = formatDuration(Date.now() - startedAt)
  const realmSummary = results
    ?.map(
      (result) =>
        `Realm ${result.realm}: ${result.marketRows} market rows, ${result.indexValues} index rows`,
    )
    .join('\n')

  const content = ok
    ? [
        'SimCo Indices updated successfully.',
        `Duration: ${duration}`,
        realmSummary,
        runUrl ? `Run: ${runUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : [
        'SimCo Indices update failed.',
        `Duration: ${duration}`,
        `Error: ${error?.message ?? String(error)}`,
        runUrl ? `Run: ${runUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n')

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })

    if (!response.ok) {
      console.warn(`Discord webhook failed with ${response.status}`)
    }
  } catch (webhookError) {
    console.warn(`Discord webhook failed: ${webhookError.message}`)
  }
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

async function fetchResourceMarket(realm, resourceId) {
  return fetchJson(`/v1/realms/${realm}/market/resources/${resourceId}`)
}

function toDateOnly(value) {
  return value.slice(0, 10)
}

function buildMarketRows(realm, market) {
  const resource = market.resource
  const summaries = resource.summariesByQuality ?? []

  return summaries.flatMap((summary) => {
    const candle = summary.lastDayCandlestick
    if (!candle?.date || !candle.vwap || !candle.volume) {
      return []
    }

    const vwap = Number(candle.vwap)
    const volume = Number(candle.volume)

    if (!Number.isFinite(vwap) || !Number.isFinite(volume) || vwap <= 0 || volume <= 0) {
      return []
    }

    return [
      {
        realm_id: realm,
        resource_id: resource.resourceId,
        resource_name: resource.resourceName,
        quality: summary.quality,
        date: toDateOnly(candle.date),
        close: candle.close ?? null,
        vwap,
        vwap_change_percent: candle.previousVWAPPercentageChange ?? null,
        volume,
        market_value: vwap * volume,
        raw: summary,
      },
    ]
  })
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

function isResearchRow(row) {
  return row.resource_name.toLowerCase().includes('research')
}

function isFoodRow(row) {
  return FOOD_RESOURCE_NAMES.has(row.resource_name.toLowerCase())
}

function isConstructionRow(row) {
  return CONSTRUCTION_RESOURCE_NAMES.has(row.resource_name.toLowerCase())
}

function qualityIndexSpecs(dateRows) {
  return [
    ['quality_0', dateRows.filter((row) => row.quality === 0 && !isResearchRow(row)), 'market_value'],
    ['quality_0_with_research', dateRows.filter((row) => row.quality === 0), 'market_value'],
    ...QUALITY_LEVELS.slice(1).map((quality) => [
      `quality_${quality}`,
      dateRows.filter((row) => row.quality === quality && !isResearchRow(row)),
      'market_value',
    ]),
  ]
}

async function getPreviousIndexValue(supabase, indexCode, realm, date) {
  const { data, error } = await supabase
    .from('index_values')
    .select('value')
    .eq('index_code', indexCode)
    .eq('realm_id', realm)
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`previous index lookup failed: ${error.message}`)
  }

  return Number(data?.value ?? BASE_INDEX_VALUE)
}

async function buildIndex(supabase, indexCode, realm, date, rows, weightField) {
  const dailyReturn = weightedReturn(rows, weightField)
  if (dailyReturn === null) {
    return null
  }

  const previousValue = await getPreviousIndexValue(supabase, indexCode, realm, date)
  const totalMarketValue = rows.reduce((sum, row) => sum + row.market_value, 0)
  const denominator = weightField === 'equal' ? rows.length : totalMarketValue

  return {
    value: {
      index_code: indexCode,
      realm_id: realm,
      date,
      value: previousValue * (1 + dailyReturn),
      component_count: rows.length,
      total_market_value: totalMarketValue,
    },
    components: rows.map((row) => ({
      index_code: indexCode,
      realm_id: realm,
      date,
      resource_id: row.resource_id,
      resource_name: row.resource_name,
      quality: row.quality,
      weight: weightField === 'equal' ? 1 / rows.length : row.market_value / denominator,
      vwap: row.vwap,
      volume: row.volume,
      market_value: row.market_value,
    })),
  }
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

async function collectRealm(supabase, realm) {
  const resources = await fetchResources(realm)
  console.log(`Realm ${realm}: fetched ${resources.length} resources`)

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

  const rows = []
  const skippedResources = []

  for (const [index, resource] of resources.entries()) {
    await sleep(RATE_LIMIT_DELAY_MS)
    try {
      const market = await fetchResourceMarket(realm, resource.id)
      rows.push(...buildMarketRows(realm, market))
    } catch (error) {
      if (error instanceof SimcotoolsError && (error.status === 404 || error.status === 422)) {
        skippedResources.push({
          resourceId: resource.id,
          name: resource.name,
          status: error.status,
        })
        continue
      }
      throw error
    }

    if ((index + 1) % 25 === 0) {
      console.log(`Realm ${realm}: processed ${index + 1}/${resources.length} resources`)
    }
  }

  await upsertInChunks(supabase, 'market_daily', rows, 'realm_id,resource_id,quality,date')

  const latestDate = rows
    .map((row) => row.date)
    .sort()
    .at(-1)
  const dates = latestDate ? [latestDate] : []
  const indexValues = []
  const indexComponents = []

  for (const date of dates) {
    const dayRows = rows.filter((row) => row.date === date)
    const rankedRows = [...dayRows].sort((a, b) => b.market_value - a.market_value)
    const indices = [
      await buildIndex(supabase, 'total_market', realm, date, dayRows, 'market_value'),
      await buildIndex(supabase, 'sc_10', realm, date, rankedRows.slice(0, 10), 'market_value'),
      await buildIndex(supabase, 'sc_30', realm, date, rankedRows.slice(0, 30), 'market_value'),
      await buildIndex(supabase, 'sc_50', realm, date, rankedRows.slice(0, 50), 'market_value'),
      await buildIndex(supabase, 'research_only', realm, date, dayRows.filter(isResearchRow), 'market_value'),
      await buildIndex(supabase, 'food_only', realm, date, dayRows.filter(isFoodRow), 'market_value'),
      await buildIndex(
        supabase,
        'construction_only',
        realm,
        date,
        dayRows.filter(isConstructionRow),
        'market_value',
      ),
      await buildIndex(supabase, 'equal_weight_market', realm, date, dayRows, 'equal'),
      ...(await Promise.all(
        qualityIndexSpecs(dayRows).map(([indexCode, selectedRows, weightField]) =>
          buildIndex(supabase, indexCode, realm, date, selectedRows, weightField),
        ),
      )),
    ].filter(Boolean)

    for (const index of indices) {
      indexValues.push(index.value)
      indexComponents.push(...index.components)
    }
  }

  await upsertInChunks(supabase, 'index_values', indexValues, 'index_code,realm_id,date')
  await upsertInChunks(
    supabase,
    'index_components',
    indexComponents,
    'index_code,realm_id,date,resource_id,quality',
  )

  return {
    realm,
    resources: resources.length,
    skippedResources,
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
    results.push(await collectRealm(supabase, realm))
  }

  const summary = { ok: true, collectedAt: new Date().toISOString(), results }
  console.log(JSON.stringify(summary, null, 2))
  await sendDiscordWebhook(summary)
}

main().catch(async (error) => {
  console.error(error)
  await sendDiscordWebhook({ ok: false, error })
  process.exitCode = 1
})
