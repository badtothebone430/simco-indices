import { createClient } from '@supabase/supabase-js'

const SIMCOTOOLS_BASE_URL = 'https://api.simcotools.com'
const REALMS = [0, 1]
const RATE_LIMIT_DELAY_MS = 2500
const MAX_FETCH_ATTEMPTS = 5
const BASE_INDEX_VALUE = 1000
const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS ?? 30)
const BACKFILL_START_DATE = process.env.BACKFILL_START_DATE ?? ''
const BACKFILL_END_DATE = process.env.BACKFILL_END_DATE ?? ''
const BACKFILL_REALM = process.env.BACKFILL_REALM ?? 'all'
const BACKFILL_MAX_DAYS = Number(process.env.BACKFILL_MAX_DAYS ?? 366)
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
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function etaFromProgress(completed, total, started = startedAt) {
  if (completed <= 0 || total <= 0 || completed >= total) {
    return '0s'
  }

  const elapsed = Date.now() - started
  const remaining = (elapsed / completed) * (total - completed)
  return formatDuration(remaining)
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

async function sendDiscordWebhook(content) {
  const webhookUrl = process.env.DISCORD_WEBHOOK
  if (!webhookUrl) {
    return
  }

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

async function sendBackfillWebhook({ status, message, results, error }) {
  const runUrl = workflowRunUrl()
  const duration = formatDuration(Date.now() - startedAt)
  const resultSummary = results
    ?.map(
      (result) =>
        `Realm ${result.realm}: ${result.marketRows} market rows, ${result.indexValues} index rows, ${result.dates} dates`,
    )
    .join('\n')

  await sendDiscordWebhook(
    [
      `Historical backfill ${status}.`,
      message,
      `Elapsed: ${duration}`,
      resultSummary,
      error ? `Error: ${error.message ?? String(error)}` : null,
      runUrl ? `Run: ${runUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  )
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

async function fetchPrices(realm) {
  const data = await fetchJson(`/v1/realms/${realm}/market/prices`)
  return data.prices ?? []
}

function rangeTimestampQuery() {
  if (!BACKFILL_START_DATE || !BACKFILL_END_DATE) {
    return ''
  }

  if (!isDateOnly(BACKFILL_START_DATE) || !isDateOnly(BACKFILL_END_DATE)) {
    return ''
  }

  const clampedStartDate = clampStartDateToMaxDays(BACKFILL_START_DATE, BACKFILL_END_DATE, BACKFILL_MAX_DAYS)
  const start = Date.parse(`${clampedStartDate}T00:00:00Z`)
  const end = Date.parse(`${BACKFILL_END_DATE}T00:00:00Z`) + 86_400_000

  return `?start=${start}&end=${end}`
}

async function fetchCandlesticks(realm, resourceId, quality) {
  return fetchJson(`/v1/realms/${realm}/market/resources/${resourceId}/${quality}/candlesticks${rangeTimestampQuery()}`)
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

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
}

function dateDaysBefore(date, days) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function clampStartDateToMaxDays(startDate, endDate, maxDays) {
  if (!Number.isFinite(maxDays) || maxDays <= 0) {
    return startDate
  }

  const earliestAllowed = dateDaysBefore(endDate, maxDays - 1)
  return startDate < earliestAllowed ? earliestAllowed : startDate
}

function configuredRealms() {
  if (BACKFILL_REALM === 'all') {
    return REALMS
  }

  const realm = Number(BACKFILL_REALM)
  if (!REALMS.includes(realm)) {
    throw new Error(`BACKFILL_REALM must be 0, 1, or all. Received: ${BACKFILL_REALM}`)
  }

  return [realm]
}

function targetDatesFromRows(allRows) {
  const allDates = Array.from(new Set(allRows.map((row) => row.date))).sort()
  const hasRange = Boolean(BACKFILL_START_DATE || BACKFILL_END_DATE)

  if (!hasRange) {
    return allDates.slice(-Math.min(BACKFILL_DAYS, BACKFILL_MAX_DAYS))
  }

  if (!isDateOnly(BACKFILL_START_DATE) || !isDateOnly(BACKFILL_END_DATE)) {
    throw new Error('BACKFILL_START_DATE and BACKFILL_END_DATE must both be set as YYYY-MM-DD for range backfills')
  }

  if (BACKFILL_START_DATE > BACKFILL_END_DATE) {
    throw new Error('BACKFILL_START_DATE must be before or equal to BACKFILL_END_DATE')
  }

  const clampedStartDate = clampStartDateToMaxDays(BACKFILL_START_DATE, BACKFILL_END_DATE, BACKFILL_MAX_DAYS)
  return allDates.filter((date) => date >= clampedStartDate && date <= BACKFILL_END_DATE)
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
    ['equal_weight_market', dateRows, 'equal'],
    ...categoryIndexSpecs(dateRows),
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
  const realmStartedAt = Date.now()
  const context = await collectRealmContext(supabase, realm)
  const resources = await fetchResources(realm)
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]))
  const prices = await fetchPrices(realm)
  const pairs = Array.from(new Set(prices.map((price) => `${price.resourceId}:${price.quality}`)))
  const allRows = []
  const skippedPairs = []

  const realmStartMessage = `Realm ${realm}: ${resources.length} resources, ${pairs.length} resource-quality pairs`
  console.log(`${realmStartMessage} | elapsed ${formatDuration(Date.now() - startedAt)}`)
  await sendBackfillWebhook({
    status: 'started',
    message: `${realmStartMessage}.`,
  })

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

    const completed = index + 1
    if (completed % 50 === 0 || completed === pairs.length) {
      const progressMessage = `Realm ${realm}: fetched ${completed}/${pairs.length} candlestick series | elapsed ${formatDuration(
        Date.now() - realmStartedAt,
      )} | ETA ${etaFromProgress(completed, pairs.length, realmStartedAt)}`
      console.log(progressMessage)
      await sendBackfillWebhook({
        status: 'progress',
        message: progressMessage,
      })
    }
  }

  const targetDates = targetDatesFromRows(allRows)
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

  const result = {
    realm,
    pairs: pairs.length,
    skippedPairs,
    dates: targetDates.length,
    marketRows: rows.length,
    indexValues: indexValues.length,
    indexComponents: indexComponents.length,
    context,
  }

  await sendBackfillWebhook({
    status: 'realm complete',
    message: `Realm ${realm}: wrote ${rows.length} market rows across ${targetDates.length} dates.`,
    results: [result],
  })

  return result
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
  const realms = configuredRealms()
  const runMessage =
    BACKFILL_START_DATE || BACKFILL_END_DATE
      ? `Backfilling range ${BACKFILL_START_DATE} to ${BACKFILL_END_DATE} for realms ${realms.join(', ')}`
      : `Backfilling latest ${BACKFILL_DAYS} market days for realms ${realms.join(', ')}`
  console.log(`${runMessage} | elapsed ${formatDuration(Date.now() - startedAt)}`)
  await sendBackfillWebhook({
    status: 'started',
    message: runMessage,
  })

  for (const realm of realms) {
    results.push(await backfillRealm(supabase, realm))
  }

  await sendBackfillWebhook({
    status: 'completed',
    message: `Finished historical backfill for realms ${realms.join(', ')}.`,
    results,
  })

  console.log(JSON.stringify({
    ok: true,
    backfillDays: BACKFILL_DAYS,
    startDate: BACKFILL_START_DATE || null,
    endDate: BACKFILL_END_DATE || null,
    realms,
    results,
  }, null, 2))
}

main().catch(async (error) => {
  await sendBackfillWebhook({
    status: 'failed',
    message: 'Historical backfill failed before completion.',
    error,
  })
  console.error(error)
  process.exitCode = 1
})
