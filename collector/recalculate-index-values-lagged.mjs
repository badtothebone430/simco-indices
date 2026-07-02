import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const REALMS = [0, 1]
const BASE_INDEX_VALUE = 1000
const DATA_RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 90)
const QUALITY_LEVELS = Array.from({ length: 13 }, (_, quality) => quality)
const MODE = process.argv[2] ?? 'apply'
const BACKUP_PATH = resolve(process.env.INDEX_RECALC_BACKUP_PATH ?? 'index-values-backup.json')

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
  const value = process.env.INDEX_RECALC_REALM
  if (value === '0' || value === '1') return [Number(value)]
  return REALMS
}

function retentionCutoffDate(days = DATA_RETENTION_DAYS) {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(0, days - 1))
  return cutoff.toISOString().slice(0, 10)
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

function rowKey(row) {
  return `${row.resource_id}:${row.quality}`
}

function laggedReturn(previousRows, currentRows, weightField) {
  if (!previousRows.length || !currentRows.length) return null

  const currentByKey = new Map(currentRows.map((row) => [rowKey(row), row]))
  const activeRows = previousRows
    .map((previous) => ({ previous, current: currentByKey.get(rowKey(previous)) }))
    .filter((row) => row.current && row.previous.vwap > 0)

  if (!activeRows.length) return null

  const totalWeight = activeRows.reduce(
    (sum, row) => sum + (weightField === 'equal' ? 1 : row.previous.market_value),
    0,
  )

  if (totalWeight <= 0) return null

  return activeRows.reduce((sum, row) => {
    const weight = weightField === 'equal' ? 1 : row.previous.market_value
    return sum + (row.current.vwap / row.previous.vwap - 1) * weight
  }, 0) / totalWeight
}

function rowsByDate(rows) {
  const byDate = new Map()
  for (const row of rows) {
    byDate.set(row.date, [...(byDate.get(row.date) ?? []), row])
  }
  return byDate
}

function specsByCode(dateRows) {
  return new Map(indexSpecRows(dateRows).map(([indexCode, rows, weightField]) => [indexCode, { rows, weightField }]))
}

function buildLaggedIndexValues(realm, marketRows, existingValues) {
  const byDate = rowsByDate(marketRows)
  const dates = Array.from(byDate.keys()).sort()
  const existingByCodeDate = new Map(existingValues.map((row) => [`${row.index_code}:${row.date}`, row]))
  const previousValues = new Map()
  const rebuilt = []

  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index]
    const currentRows = byDate.get(date) ?? []
    const currentSpecs = specsByCode(currentRows)
    const previousSpecs = index > 0 ? specsByCode(byDate.get(dates[index - 1]) ?? []) : new Map()

    for (const [indexCode, currentSpec] of currentSpecs.entries()) {
      if (!currentSpec.rows.length) continue

      const existing = existingByCodeDate.get(`${indexCode}:${date}`)
      const previousValue = previousValues.get(indexCode) ?? existing?.value ?? BASE_INDEX_VALUE
      const previousSpec = previousSpecs.get(indexCode)
      const dailyReturn = previousSpec ? laggedReturn(previousSpec.rows, currentRows, previousSpec.weightField) ?? 0 : 0
      const value = index === 0 && existing ? existing.value : previousValue * (1 + dailyReturn)
      const totalMarketValue = currentSpec.rows.reduce((sum, row) => sum + row.market_value, 0)

      previousValues.set(indexCode, value)
      rebuilt.push({
        index_code: indexCode,
        realm_id: realm,
        date,
        value,
        component_count: currentSpec.rows.length,
        total_market_value: totalMarketValue,
      })
    }
  }

  return rebuilt
}

async function loadPaged(supabase, table, select, queryBuilder) {
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    query = queryBuilder(query)
    const { data, error } = await query
    if (error) throw new Error(`${table} fetch failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function upsertInChunks(supabase, table, rows, onConflict) {
  const chunkSize = 500
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict })
    if (error) throw new Error(`${table} upsert failed: ${error.message}`)
  }
}

async function pruneOldIndexValues(supabase, cutoffDate) {
  for (const realm of configuredRealms()) {
    const { error } = await supabase
      .from('index_values')
      .delete()
      .eq('realm_id', realm)
      .lt('date', cutoffDate)

    if (error) throw new Error(`index_values prune failed: ${error.message}`)
  }
}

async function backupCurrentIndexValues(supabase, realms) {
  const rows = []
  for (const realm of realms) {
    rows.push(
      ...(await loadPaged(
        supabase,
        'index_values',
        'index_code,realm_id,date,value,component_count,total_market_value',
        (query) => query.eq('realm_id', realm).order('date', { ascending: true }),
      )),
    )
  }

  await mkdir(dirname(BACKUP_PATH), { recursive: true })
  await writeFile(BACKUP_PATH, JSON.stringify({ backedUpAt: new Date().toISOString(), rows }, null, 2))
  return rows
}

async function applyLaggedRecalc(supabase) {
  const realms = configuredRealms()
  const cutoffDate = retentionCutoffDate()
  const existingValues = await backupCurrentIndexValues(supabase, realms)
  const rebuilt = []

  for (const realm of realms) {
    const marketRows = await loadPaged(
      supabase,
      'market_daily',
      'realm_id,resource_id,resource_name,quality,date,vwap,volume,market_value',
      (query) => query.eq('realm_id', realm).gte('date', cutoffDate).order('date', { ascending: true }),
    )
    const realmExisting = existingValues.filter((row) => row.realm_id === realm)
    const realmRebuilt = buildLaggedIndexValues(realm, marketRows, realmExisting)
    rebuilt.push(...realmRebuilt)
    console.log(`Realm ${realm}: rebuilt ${realmRebuilt.length} index_values from ${marketRows.length} market_daily rows`)
  }

  await upsertInChunks(supabase, 'index_values', rebuilt, 'index_code,realm_id,date')
  await pruneOldIndexValues(supabase, cutoffDate)
  console.log(`Applied ${rebuilt.length} lagged-weight index_values`)
  console.log(`Pruned index_values before ${cutoffDate}`)
  console.log(`Backup written to ${BACKUP_PATH}`)
}

async function restoreBackup(supabase) {
  const raw = await readFile(BACKUP_PATH, 'utf8')
  const backup = JSON.parse(raw)
  if (!Array.isArray(backup.rows) || backup.rows.length === 0) {
    throw new Error(`Backup ${BACKUP_PATH} has no rows`)
  }
  await upsertInChunks(supabase, 'index_values', backup.rows, 'index_code,realm_id,date')
  console.log(`Restored ${backup.rows.length} index_values from ${BACKUP_PATH}`)
}

async function main() {
  const supabaseUrl = process.env.SIMCO_SUPABASE_URL
  const secretKey = process.env.SIMCO_SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing SIMCO_SUPABASE_URL or SIMCO_SUPABASE_SECRET_KEY')
  }

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (MODE === 'apply') {
    await applyLaggedRecalc(supabase)
    return
  }

  if (MODE === 'restore') {
    await restoreBackup(supabase)
    return
  }

  throw new Error(`Unknown mode "${MODE}". Use "apply" or "restore".`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
