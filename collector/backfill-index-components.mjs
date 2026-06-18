import { createClient } from '@supabase/supabase-js'

const REALMS = [0, 1]
const BACKFILL_DAYS = Number(process.env.COMPONENT_BACKFILL_DAYS ?? 30)
const BACKFILL_REALM = process.env.BACKFILL_REALM ?? 'all'
const QUALITY_LEVELS = Array.from({ length: 13 }, (_, quality) => quality)
const PAGE_SIZE = 1000

const CATEGORY_INDEXES = [
  ['agriculture_only', ['seeds', 'apples', 'oranges', 'grapes', 'grain', 'sugarcane', 'cotton', 'cows', 'pigs', 'coffee beans', 'cocoa', 'vegetables', 'fodder']],
  ['food_only', ['dough', 'sauce', 'steak', 'sausages', 'eggs', 'milk', 'coffee powder', 'flour', 'bread', 'apple pie', 'orange juice', 'apple cider', 'ginger beer', 'frozen pizza', 'pasta', 'butter', 'cheese', 'chocolate', 'sugar', 'hamburger', 'lasagna', 'meat balls', 'cocktails', 'vegetable oil', 'salad', 'samosa', 'pumpkin soup']],
  ['construction_only', ['wood', 'reinforced concrete', 'bricks', 'cement', 'clay', 'limestone', 'beams', 'planks', 'windows', 'tools', 'construction units']],
  ['fashion_only', ['fabric', 'leather', 'underwear', 'gloves', 'dress', 'stiletto heel', 'handbags', 'sneakers', 'luxury watch', 'necklace']],
  ['energy_only', ['crude oil', 'petrol', 'diesel', 'power', 'ethanol', 'methane', 'rocket fuel']],
  ['electronics_only', ['processors', 'electronic components', 'batteries', 'displays', 'smart phones', 'tablets', 'laptops', 'monitors', 'televisions', 'high grade e-comps', 'quadcopter', 'robots']],
  ['automotive_only', ['on-board computer', 'electric motor', 'luxury car interior', 'basic interior', 'car body', 'combustion engine', 'economy e-car', 'luxury e-car', 'economy car', 'luxury car', 'truck', 'bulldozer']],
  ['aerospace_only', ['fuselage', 'wing', 'flight computer', 'cockpit', 'attitude control', 'propellant tank', 'solid fuel booster', 'rocket engine', 'heat shield', 'ion drive', 'jet engine']],
  ['resources_only', ['water', 'transport', 'minerals', 'bauxite', 'silicon', 'chemicals', 'aluminium', 'plastic', 'iron ore', 'steel', 'sand', 'glass', 'gold ore', 'golden bars', 'carbon fibers', 'carbon composite']],
  ['research_only', ['plant research', 'energy research', 'mining research', 'electronics research', 'breeding research', 'chemistry research', 'software', 'automotive research', 'fashion research', 'aerospace research', 'materials research', 'recipes']],
  ['seasonal_only', ['pumpkin', 'xmas crackers', 'xmas ornament', "jack o'lantern", 'witch costume', 'tree', 'easter bunny', 'ramadan sweets', 'chocolate icecream', 'apple icecream', 'cream egg']],
].map(([code, names]) => [code, new Set(names)])

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

function dateDaysBefore(date, days) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function isResearchRow(row) {
  return row.resource_name.toLowerCase().includes('research')
}

function categoryIndexSpecs(dateRows) {
  return CATEGORY_INDEXES.map(([indexCode, names]) => [
    indexCode,
    dateRows.filter((row) => names.has(row.resource_name.toLowerCase())),
    'market_value',
  ])
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

async function loadMarketRows(supabase, realm, startDate) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('market_daily')
      .select('realm_id,resource_id,resource_name,quality,date,vwap,volume,market_value')
      .eq('realm_id', realm)
      .gte('date', startDate)
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`market_daily lookup failed: ${error.message}`)
    }

    rows.push(...(data ?? []))

    if (!data || data.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

async function latestMarketDate(supabase) {
  const { data, error } = await supabase
    .from('market_daily')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`latest market date lookup failed: ${error.message}`)
  }

  if (!data?.date) {
    throw new Error('No market_daily rows found')
  }

  return data.date
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

function buildComponents(realm, rows) {
  const components = []
  const dates = Array.from(new Set(rows.map((row) => row.date))).sort()

  for (const date of dates) {
    const dateRows = rows.filter((row) => row.date === date)

    for (const [indexCode, selectedRows, weightField] of indexSpecRows(dateRows)) {
      if (!selectedRows.length) {
        continue
      }

      const totalMarketValue = selectedRows.reduce((sum, row) => sum + row.market_value, 0)
      const denominator = weightField === 'equal' ? selectedRows.length : totalMarketValue
      if (denominator <= 0) {
        continue
      }

      components.push(
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

  return components
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
  const latestDate = await latestMarketDate(supabase)
  const startDate = dateDaysBefore(latestDate, BACKFILL_DAYS - 1)
  const results = []

  console.log(`Backfilling index_components ${startDate} to ${latestDate} for realms ${configuredRealms().join(', ')}`)

  for (const realm of configuredRealms()) {
    const rows = await loadMarketRows(supabase, realm, startDate)
    const components = buildComponents(realm, rows)
    await upsertInChunks(
      supabase,
      'index_components',
      components,
      'index_code,realm_id,date,resource_id,quality',
    )
    results.push({ realm, marketRows: rows.length, indexComponents: components.length })
    console.log(`Realm ${realm}: wrote ${components.length} component rows from ${rows.length} market rows`)
  }

  console.log(JSON.stringify({ ok: true, startDate, latestDate, results }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
