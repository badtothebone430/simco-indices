import { createClient } from '@supabase/supabase-js'

const SIMCOTOOLS_BASE_URL = 'https://api.simcotools.com'
const REALMS = [0, 1]
const RATE_LIMIT_DELAY_MS = 2500
const MAX_FETCH_ATTEMPTS = 5
const BASE_INDEX_VALUE = 1000
const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 90)
const INDEX_COMPONENT_RETENTION_DAYS = Number(process.env.INDEX_COMPONENT_RETENTION_DAYS ?? 30)
const PRUNE_CHUNK_DAYS = Number(process.env.PRUNE_CHUNK_DAYS ?? 7)
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

const CATEGORY_INDEXES = [
  [
    'agriculture_only',
    [
      'seeds',
      'apples',
      'oranges',
      'grapes',
      'grain',
      'sugarcane',
      'cotton',
      'cows',
      'pigs',
      'coffee beans',
      'cocoa',
      'vegetables',
      'fodder',
    ],
  ],
  [
    'food_only',
    [
      'dough',
      'sauce',
      'steak',
      'sausages',
      'eggs',
      'milk',
      'coffee powder',
      'flour',
      'bread',
      'apple pie',
      'orange juice',
      'apple cider',
      'ginger beer',
      'frozen pizza',
      'pasta',
      'butter',
      'cheese',
      'chocolate',
      'sugar',
      'hamburger',
      'lasagna',
      'meat balls',
      'cocktails',
      'vegetable oil',
      'salad',
      'samosa',
      'pumpkin soup',
    ],
  ],
  [
    'construction_only',
    [
      'wood',
      'reinforced concrete',
      'bricks',
      'cement',
      'clay',
      'limestone',
      'beams',
      'planks',
      'windows',
      'tools',
      'construction units',
    ],
  ],
  [
    'fashion_only',
    [
      'fabric',
      'leather',
      'underwear',
      'gloves',
      'dress',
      'stiletto heel',
      'handbags',
      'sneakers',
      'luxury watch',
      'necklace',
    ],
  ],
  ['energy_only', ['crude oil', 'petrol', 'diesel', 'power', 'ethanol', 'methane', 'rocket fuel']],
  [
    'electronics_only',
    [
      'processors',
      'electronic components',
      'batteries',
      'displays',
      'smart phones',
      'tablets',
      'laptops',
      'monitors',
      'televisions',
      'high grade e-comps',
      'quadcopter',
      'robots',
    ],
  ],
  [
    'automotive_only',
    [
      'on-board computer',
      'electric motor',
      'luxury car interior',
      'basic interior',
      'car body',
      'combustion engine',
      'economy e-car',
      'luxury e-car',
      'economy car',
      'luxury car',
      'truck',
      'bulldozer',
    ],
  ],
  [
    'aerospace_only',
    [
      'fuselage',
      'wing',
      'flight computer',
      'cockpit',
      'attitude control',
      'propellant tank',
      'solid fuel booster',
      'rocket engine',
      'heat shield',
      'ion drive',
      'jet engine',
    ],
  ],
  [
    'resources_only',
    [
      'water',
      'transport',
      'minerals',
      'bauxite',
      'silicon',
      'chemicals',
      'aluminium',
      'plastic',
      'iron ore',
      'steel',
      'sand',
      'glass',
      'gold ore',
      'golden bars',
      'carbon fibers',
      'carbon composite',
    ],
  ],
  [
    'research_only',
    [
      'plant research',
      'energy research',
      'mining research',
      'electronics research',
      'breeding research',
      'chemistry research',
      'software',
      'automotive research',
      'fashion research',
      'aerospace research',
      'materials research',
      'recipes',
    ],
  ],
  [
    'seasonal_only',
    [
      'pumpkin',
      'xmas crackers',
      'xmas ornament',
      "jack o'lantern",
      'witch costume',
      'tree',
      'easter bunny',
      'ramadan sweets',
      'chocolate icecream',
      'apple icecream',
      'cream egg',
    ],
  ],
].map(([code, names]) => [code, new Set(names)])

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

async function sendDiscordWebhook({ ok, results, pruned, error }) {
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
  const cleanupSummary = Array.isArray(pruned)
    ? pruned
        .map((result) => `${result.table}: ${result.deletedRows} old rows removed`)
        .join('\n')
    : null

  const content = ok
    ? [
        'SimCo Indices updated successfully.',
        `Duration: ${duration}`,
        cleanupSummary,
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

async function fetchPaged(path, key) {
  const rows = []
  let page = 1
  let lastPage = 1

  do {
    const separator = path.includes('?') ? '&' : '?'
    const data = await fetchJson(`${path}${separator}page=${page}`)
    rows.push(...(data[key] ?? []))
    lastPage = Number(data.metadata?.lastPage ?? page)
    page += 1
    if (page <= lastPage) {
      await sleep(RATE_LIMIT_DELAY_MS)
    }
  } while (page <= lastPage)

  return rows
}

async function fetchResources(realm) {
  const data = await fetchJson(`/v1/realms/${realm}/resources?type=all&disable_pagination=true`)
  return data.resources ?? []
}

async function fetchResourceMarket(realm, resourceId) {
  return fetchJson(`/v1/realms/${realm}/market/resources/${resourceId}`)
}

function governmentOrderRows(realm, orders) {
  return orders.flatMap((order) => {
    const createdAt = order.created
    const daysToFulfill = Number(order.daysToFulfill ?? order.days_to_fulfill)
    const dueAt =
      createdAt && Number.isFinite(daysToFulfill)
        ? new Date(new Date(createdAt).getTime() + daysToFulfill * 86_400_000).toISOString()
        : null

    return (order.resources ?? []).map((resource) => ({
      realm_id: realm,
      order_id: order.id,
      project_name: order.projectName ?? order.project_name ?? 'Government order',
      resource_id: resource.resourceId,
      resource_name: resource.resourceName,
      quality: resource.quality ?? 0,
      days_to_fulfill: Number.isFinite(daysToFulfill) ? daysToFulfill : null,
      created_at: createdAt,
      due_at: dueAt,
      raw: order,
      updated_at: new Date().toISOString(),
    }))
  })
}

async function collectRealmContext(supabase, realm) {
  const phases = await fetchPaged(`/v1/realms/${realm}/phases`, 'ranges')
  await sleep(RATE_LIMIT_DELAY_MS)
  const events = await fetchPaged(`/v1/realms/${realm}/events`, 'events')
  await sleep(RATE_LIMIT_DELAY_MS)
  const contests = await fetchPaged(`/v1/realms/${realm}/contests`, 'contests')
  await sleep(RATE_LIMIT_DELAY_MS)
  const governmentOrders = await fetchPaged(`/v1/realms/${realm}/government-orders`, 'orders')

  await upsertInChunks(
    supabase,
    'realm_phases',
    phases.map((phase) => ({
      realm_id: realm,
      phase: phase.phase,
      start_at: phase.start,
      end_at: phase.end,
      days: phase.days ?? null,
      weeks: phase.weeks ?? null,
      raw: phase,
      updated_at: new Date().toISOString(),
    })),
    'realm_id,start_at,end_at',
  )

  await upsertInChunks(
    supabase,
    'realm_events',
    events.map((event) => ({
      realm_id: realm,
      event_id: event.id,
      resource_id: event.resource,
      resource_name: event.resourceName ?? event.resource_name,
      speed_modifier: event.speedModifier ?? event.speed_modifier,
      since: event.since,
      until: event.until,
      produced_at: event.producedAt ?? event.produced_at ?? null,
      produced_at_name: event.producedAtName ?? event.produced_at_name ?? null,
      raw: event,
      updated_at: new Date().toISOString(),
    })),
    'realm_id,event_id',
  )

  await upsertInChunks(
    supabase,
    'realm_contests',
    contests.map((contest) => ({
      realm_id: realm,
      contest_id: contest.id,
      name: contest.name,
      resource_id: contest.resourceId ?? null,
      resource_name: contest.resourceName ?? null,
      building_id: contest.buildingId ?? null,
      building_name: contest.buildingName ?? null,
      start_at: contest.startDate,
      end_at: contest.endDate,
      raw: contest,
      updated_at: new Date().toISOString(),
    })),
    'realm_id,contest_id',
  )

  await upsertInChunks(
    supabase,
    'realm_government_orders',
    governmentOrderRows(realm, governmentOrders),
    'realm_id,order_id,resource_id,quality',
  )

  return {
    phases: phases.length,
    events: events.length,
    contests: contests.length,
    governmentOrders: governmentOrders.length,
  }
}

function toDateOnly(value) {
  return value.slice(0, 10)
}

function retentionCutoffDate(days = DATA_RETENTION_DAYS) {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, days - 1))
  return cutoff.toISOString().slice(0, 10)
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function oldestDateBeforeCutoff(supabase, table, realm, cutoffDate) {
  const { data, error } = await supabase
    .from(table)
    .select('date')
    .eq('realm_id', realm)
    .lt('date', cutoffDate)
    .order('date', { ascending: true })
    .limit(1)

  if (error) {
    throw new Error(`${table} oldest date lookup failed: ${error.message}`)
  }

  return data?.[0]?.date ?? null
}

async function pruneTableByDateChunks(supabase, table, cutoffDate) {
  const safeChunkDays = Number.isFinite(PRUNE_CHUNK_DAYS) && PRUNE_CHUNK_DAYS > 0 ? PRUNE_CHUNK_DAYS : 7
  let chunks = 0

  for (const realm of REALMS) {
    let startDate = await oldestDateBeforeCutoff(supabase, table, realm, cutoffDate)
    while (startDate && startDate < cutoffDate) {
      const endDate = addDays(startDate, safeChunkDays) < cutoffDate
        ? addDays(startDate, safeChunkDays)
        : cutoffDate

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('realm_id', realm)
        .gte('date', startDate)
        .lt('date', endDate)

      if (error) {
        throw new Error(`${table} prune failed for realm ${realm}, ${startDate} to ${endDate}: ${error.message}`)
      }

      chunks += 1
      startDate = endDate
    }
  }

  return chunks
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
  return CATEGORY_INDEXES.find(([code]) => code === 'food_only')?.[1].has(row.resource_name.toLowerCase()) ?? false
}

function isConstructionRow(row) {
  return CATEGORY_INDEXES.find(([code]) => code === 'construction_only')?.[1].has(row.resource_name.toLowerCase()) ?? false
}

function categoryIndexSpecs(dateRows) {
  return CATEGORY_INDEXES.map(([indexCode, names]) => [
    indexCode,
    dateRows.filter((row) => names.has(row.resource_name.toLowerCase())),
    'market_value',
  ])
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

async function pruneOldMarketData(supabase) {
  if (!Number.isFinite(DATA_RETENTION_DAYS) || DATA_RETENTION_DAYS <= 0) {
    return []
  }

  const cutoffDate = retentionCutoffDate()
  const componentCutoffDate = retentionCutoffDate(INDEX_COMPONENT_RETENTION_DAYS)
  const tables = [
    ['index_components', componentCutoffDate],
    ['index_values', cutoffDate],
    ['market_daily', cutoffDate],
  ]
  const results = []

  for (const [table, tableCutoffDate] of tables) {
    const chunks = await pruneTableByDateChunks(supabase, table, tableCutoffDate)
    results.push({ table, cutoffDate: tableCutoffDate, chunks })
  }

  console.log(`Pruned dated market data: ${JSON.stringify(results)}`)
  return results
}

async function collectRealm(supabase, realm) {
  const context = await collectRealmContext(supabase, realm)
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
      await buildIndex(supabase, 'equal_weight_market', realm, date, dayRows, 'equal'),
      ...(await Promise.all(
        categoryIndexSpecs(dayRows).map(([indexCode, selectedRows, weightField]) =>
          buildIndex(supabase, indexCode, realm, date, selectedRows, weightField),
        ),
      )),
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
    context,
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
  const pruned = await pruneOldMarketData(supabase)
  for (const realm of REALMS) {
    results.push(await collectRealm(supabase, realm))
  }

  const summary = { ok: true, collectedAt: new Date().toISOString(), pruned, results }
  console.log(JSON.stringify(summary, null, 2))
  await sendDiscordWebhook(summary)
}

main().catch(async (error) => {
  console.error(error)
  await sendDiscordWebhook({ ok: false, error })
  process.exitCode = 1
})
