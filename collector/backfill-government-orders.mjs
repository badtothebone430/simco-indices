import { createClient } from '@supabase/supabase-js'

const SIMCOTOOLS_BASE_URL = 'https://api.simcotools.com'
const REALMS = [0, 1]
const RATE_LIMIT_DELAY_MS = 2500
const MAX_FETCH_ATTEMPTS = 5

const BACKFILL_START_DATE = process.env.BACKFILL_START_DATE ?? ''
const BACKFILL_END_DATE = process.env.BACKFILL_END_DATE ?? new Date().toISOString().slice(0, 10)
const BACKFILL_REALM = process.env.BACKFILL_REALM ?? 'all'

class SimcotoolsError extends Error {
  constructor(path, status) {
    super(`Simcotools ${path} failed with ${status}`)
    this.status = status
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
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

function validateDates() {
  if (!isDateOnly(BACKFILL_START_DATE) || !isDateOnly(BACKFILL_END_DATE)) {
    throw new Error('BACKFILL_START_DATE and BACKFILL_END_DATE must be YYYY-MM-DD')
  }

  if (BACKFILL_START_DATE > BACKFILL_END_DATE) {
    throw new Error('BACKFILL_START_DATE must be before or equal to BACKFILL_END_DATE')
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

async function fetchGovernmentOrders(realm) {
  const orders = []
  let page = 1
  let lastPage = 1

  do {
    const data = await fetchJson(`/v1/realms/${realm}/government-orders?sort=-created&page=${page}`)
    const pageOrders = data.orders ?? []
    orders.push(...pageOrders)

    const oldestDate = pageOrders
      .map((order) => String(order.created ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()[0]

    lastPage = Number(data.metadata?.lastPage ?? page)
    page += 1

    if (oldestDate && oldestDate < BACKFILL_START_DATE) {
      break
    }

    if (page <= lastPage) {
      await sleep(RATE_LIMIT_DELAY_MS)
    }
  } while (page <= lastPage)

  return orders.filter((order) => {
    const createdDate = String(order.created ?? '').slice(0, 10)
    return createdDate >= BACKFILL_START_DATE && createdDate <= BACKFILL_END_DATE
  })
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

async function backfillRealm(supabase, realm) {
  const orders = await fetchGovernmentOrders(realm)
  const rows = governmentOrderRows(realm, orders)

  await upsertInChunks(
    supabase,
    'realm_government_orders',
    rows,
    'realm_id,order_id,resource_id,quality',
  )

  return {
    realm,
    orders: orders.length,
    rows: rows.length,
  }
}

async function main() {
  validateDates()

  const supabaseUrl = process.env.SIMCO_SUPABASE_URL
  const secretKey = process.env.SIMCO_SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing SIMCO_SUPABASE_URL or SIMCO_SUPABASE_SECRET_KEY')
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  })

  const realms = configuredRealms()
  console.log(`Backfilling government orders ${BACKFILL_START_DATE} to ${BACKFILL_END_DATE} for realms ${realms.join(', ')}`)

  const results = []
  for (const realm of realms) {
    results.push(await backfillRealm(supabase, realm))
  }

  console.log(JSON.stringify({
    ok: true,
    startDate: BACKFILL_START_DATE,
    endDate: BACKFILL_END_DATE,
    realms,
    results,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
