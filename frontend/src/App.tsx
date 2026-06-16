import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Car,
  Cpu,
  Database,
  FlaskConical,
  Globe2,
  Hammer,
  LineChart as LineChartIcon,
  Moon,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Soup,
  Sparkles,
  Sprout,
  Sun,
  Pickaxe,
  Shirt,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { createClient } from '@supabase/supabase-js'
import './App.css'

type RealmId = 0 | 1
type IndexCode = string
type Theme = 'light' | 'dark'
type AppView = 'dashboard' | 'overview' | 'compare'
type CompareMode = 'absolute' | 'percent'
type CompareMetric = 'vwap' | 'market_value'
type ComparisonKind = 'index' | 'resource'
type Timeframe = '7d' | '30d' | '90d' | 'all'

type IndexDefinition = {
  code: IndexCode
  name: string
  description: string
  method: string
}

type IndexPoint = {
  date: string
  value: number
  realm_id: RealmId
  index_code: IndexCode
  component_count: number
  total_market_value: number
}

type ComponentRow = {
  resource_id: number
  resource_name: string
  quality: number
  weight: number
  vwap: number
  volume: number
  market_value: number
}

type PhaseRange = {
  realm_id: RealmId
  phase: 'boom' | 'normal' | 'recession' | string
  start_at: string
  end_at: string
}

type RealmEvent = {
  realm_id: RealmId
  event_id: number
  resource_id: number
  resource_name: string
  speed_modifier: number
  since: string
  until: string
  produced_at_name: string | null
}

type RealmContest = {
  realm_id: RealmId
  contest_id: number
  name: string
  resource_id: number | null
  resource_name: string | null
  start_at: string
  end_at: string
}

type ChartContext = {
  phases: PhaseRange[]
  events: RealmEvent[]
  contests: RealmContest[]
}

type DashboardMarket = {
  realm: RealmId
  latest: IndexPoint
  dailyChange: number
  periodChange: number
  series: MiniPoint[]
}

type MiniPoint = {
  date: string
  value: number
}

type DashboardTarget =
  | {
      kind: 'index'
      realm: RealmId
      indexCode: IndexCode
    }
  | {
      kind: 'resource'
      realm: RealmId
      resourceId: number
      resourceName: string
      quality: number
    }

type DashboardSignal = {
  title: string
  name: string
  realm: RealmId
  detail: string
  tone: 'positive' | 'negative' | 'neutral'
  series: MiniPoint[]
  target?: DashboardTarget
}

type DashboardTechnical = DashboardSignal & {
  technical: TechnicalSignal
}

type ResourceOption = {
  resource_id: number
  name: string
}

type MarketPoint = {
  date: string
  vwap: number
  market_value: number
  volume: number
}

type MarketDailyRow = {
  date: string
  resource_id: number
  resource_name: string
  quality: number
  vwap: number
  volume: number
  market_value: number
}

type ComparisonPoint = {
  date: string
  value: number
}

type ResourceComparisonSelection = {
  key: string
  kind: 'resource'
  realm: RealmId
  resourceId: number
  resourceName: string
  quality: number
}

type IndexComparisonSelection = {
  key: string
  kind: 'index'
  realm: RealmId
  indexCode: IndexCode
  indexName: string
}

type ComparisonSelection = ResourceComparisonSelection | IndexComparisonSelection

type ComparisonDatum = {
  date: string
  label: string
  [key: string]: string | number
}

type TechnicalPoint = {
  date: string
  value: number
}

type TechnicalSignal = {
  type: 'demand' | 'supply' | 'ascending-channel' | 'descending-channel' | 'range'
  title: string
  detail: string
  tone: 'positive' | 'negative' | 'neutral'
  strength: number
  demandZone?: [number, number]
  supplyZone?: [number, number]
  channel?: {
    upper: [number, number]
    lower: [number, number]
  }
}

type ComparisonState = {
  kind: ComparisonKind
  selectedRealm: RealmId
  selectedIndex: IndexCode
  selectedResourceId: string
  selectedQuality: number
  selections: ComparisonSelection[]
  mode: CompareMode
  metric: CompareMetric
  timeframe: Timeframe
  height: number
}

type ComparisonPreset = ComparisonState & {
  id: string
  name: string
}

type ChartFilters = {
  showPhases: boolean
  showEvents: boolean
  showContests: boolean
  showTechnicals: boolean
}

const comparisonStateKey = 'simco-comparison-state'
const comparisonPresetsKey = 'simco-comparison-presets'
const chartFiltersKey = 'simco-chart-filters'

const realms: Record<RealmId, string> = {
  0: 'Magnates',
  1: 'Entrepreneurs',
}

const qualityLevels = Array.from({ length: 13 }, (_, quality) => quality)
const comparisonColors = ['#247a7b', '#b85b31', '#5b6ee1', '#21834f', '#9b4eb5', '#a98918']

const indexDefinitions: IndexDefinition[] = [
  {
    code: 'total_market',
    name: 'Total Market',
    description: 'All tracked resources and qualities weighted by daily activity.',
    method: 'VWAP x volume',
  },
  {
    code: 'sc_10',
    name: 'SC-10',
    description: 'The 10 largest resource-quality pairs by daily market value.',
    method: 'Top 10',
  },
  {
    code: 'sc_30',
    name: 'SC-30',
    description: 'The 30 largest resource-quality pairs by daily market value.',
    method: 'Top 30',
  },
  {
    code: 'sc_50',
    name: 'SC-50',
    description: 'The 50 largest resource-quality pairs by daily market value.',
    method: 'Top 50',
  },
  {
    code: 'research_only',
    name: 'Research',
    description: 'Research resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'food_only',
    name: 'Food',
    description: 'Food and beverage resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'construction_only',
    name: 'Construction',
    description: 'Construction-chain resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'agriculture_only',
    name: 'Agriculture',
    description: 'Agriculture resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'fashion_only',
    name: 'Fashion',
    description: 'Fashion resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'energy_only',
    name: 'Energy',
    description: 'Energy resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'electronics_only',
    name: 'Electronics',
    description: 'Electronics resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'automotive_only',
    name: 'Automotive',
    description: 'Automotive resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'aerospace_only',
    name: 'Aerospace',
    description: 'Aerospace resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'resources_only',
    name: 'Resources',
    description: 'Raw and industrial resource inputs weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'seasonal_only',
    name: 'Seasonal',
    description: 'Seasonal resources weighted by daily market activity.',
    method: 'Category',
  },
  {
    code: 'equal_weight_market',
    name: 'Equal Weight',
    description: 'Broad market direction with each component carrying the same weight.',
    method: 'Equal weight',
  },
]

function qualityIndexCode(quality: number, includeResearch: boolean) {
  return quality === 0 && includeResearch ? 'quality_0_with_research' : `quality_${quality}`
}

function qualityIndexDefinition(quality: number, includeResearch: boolean): IndexDefinition {
  const includesResearch = quality === 0 && includeResearch
  return {
    code: qualityIndexCode(quality, includeResearch),
    name: includesResearch ? 'Q0 + Research' : `Q${quality}`,
    description: includesResearch
      ? 'Quality 0 resources including research, weighted by daily market activity.'
      : `Quality ${quality} resources weighted by daily market activity.`,
    method: includesResearch ? 'Quality + research' : 'Quality',
  }
}

function comparisonLabel(selection: ComparisonSelection) {
  const realmName = realms[selection.realm] ?? realms[0]
  return selection.kind === 'index'
    ? `${realmName}: ${selection.indexName}`
    : `${realmName}: ${selection.resourceName} Q${selection.quality}`
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function comparisonStateFromPreset(preset: ComparisonPreset): ComparisonState {
  return {
    kind: preset.kind,
    selectedRealm: preset.selectedRealm ?? 0,
    selectedIndex: preset.selectedIndex,
    selectedResourceId: preset.selectedResourceId,
    selectedQuality: preset.selectedQuality,
    selections: preset.selections,
    mode: preset.mode,
    metric: preset.metric,
    timeframe: preset.timeframe,
    height: preset.height,
  }
}

const demoSeries: IndexPoint[] = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 4, 17 + index))
  const wave = Math.sin(index / 3.4) * 18
  const drift = index * 2.1
  return {
    date: date.toISOString().slice(0, 10),
    value: Math.round((1000 + wave + drift) * 100) / 100,
    realm_id: 0,
    index_code: 'total_market',
    component_count: 946,
    total_market_value: 18_940_000_000 + index * 76_000_000,
  }
})

const demoComponents: ComponentRow[] = [
  {
    resource_id: 1,
    resource_name: 'Power',
    quality: 2,
    weight: 0.082,
    vwap: 0.2688,
    volume: 747_940_411,
    market_value: 201_100_000,
  },
  {
    resource_id: 2,
    resource_name: 'Water',
    quality: 1,
    weight: 0.067,
    vwap: 0.3812,
    volume: 508_400_000,
    market_value: 193_800_000,
  },
  {
    resource_id: 43,
    resource_name: 'Steel',
    quality: 0,
    weight: 0.051,
    vwap: 21.84,
    volume: 8_700_000,
    market_value: 190_000_000,
  },
  {
    resource_id: 17,
    resource_name: 'Chemicals',
    quality: 0,
    weight: 0.047,
    vwap: 15.47,
    volume: 10_840_000,
    market_value: 167_700_000,
  },
  {
    resource_id: 18,
    resource_name: 'Aluminium',
    quality: 1,
    weight: 0.041,
    vwap: 22.14,
    volume: 6_980_000,
    market_value: 154_500_000,
  },
]

const demoComparisonData: ComparisonDatum[] = demoSeries.map((point, index) => ({
  date: point.date,
  label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }),
  power: 0.24 + index * 0.002 + Math.sin(index / 2.8) * 0.01,
  steel: 18.5 + index * 0.12 + Math.cos(index / 3.2) * 0.9,
}))

function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  return createClient(url, key)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value)
}

function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`
}

function ordinalSuffix(day: number) {
  if (day >= 11 && day <= 13) return 'th'
  const lastDigit = day % 10
  if (lastDigit === 1) return 'st'
  if (lastDigit === 2) return 'nd'
  if (lastDigit === 3) return 'rd'
  return 'th'
}

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`)
  const day = parsed.getUTCDate()
  const month = parsed.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })
  const year = parsed.getUTCFullYear()
  return `${day}${ordinalSuffix(day)} ${month}, ${year}`
}

function toDateOnly(value: string) {
  return value.slice(0, 10)
}

function nextUpdateDate(now = new Date()) {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 30, 0),
  )

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1)
  }

  return next
}

function formatCountdown(target: Date, now = new Date()) {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`
}

function timeframeDays(timeframe: Timeframe) {
  if (timeframe === '7d') return 7
  if (timeframe === '30d') return 30
  if (timeframe === '90d') return 90
  return null
}

function filterByTimeframe<T extends { date: string }>(rows: T[], timeframe: Timeframe) {
  const days = timeframeDays(timeframe)
  if (!days || rows.length === 0) {
    return rows
  }

  const latestDate = rows.at(-1)?.date
  if (!latestDate) {
    return rows
  }

  const start = new Date(`${latestDate}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  const startDate = start.toISOString().slice(0, 10)
  return rows.filter((row) => row.date >= startDate)
}

async function loadIndexSeries(realm: RealmId, indexCode: IndexCode) {
  const supabase = getSupabase()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('index_values')
    .select('date,value,realm_id,index_code,component_count,total_market_value')
    .eq('realm_id', realm)
    .eq('index_code', indexCode)
    .order('date', { ascending: true })

  if (error || !data?.length) {
    return null
  }

  return data as IndexPoint[]
}

async function loadIndexComponents(realm: RealmId, indexCode: IndexCode, date: string) {
  const supabase = getSupabase()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('index_components')
    .select('resource_id,resource_name,quality,weight,vwap,volume,market_value')
    .eq('realm_id', realm)
    .eq('index_code', indexCode)
    .eq('date', date)
    .order('weight', { ascending: false })
    .limit(12)

  if (error || !data?.length) {
    return null
  }

  return data as ComponentRow[]
}

async function loadChartContext(realmIds: RealmId[], startDate: string, endDate: string) {
  const supabase = getSupabase()
  if (!supabase || !realmIds.length || !startDate || !endDate) {
    return { phases: [], events: [], contests: [] }
  }

  const [phases, events, contests] = await Promise.all([
    supabase
      .from('realm_phases')
      .select('realm_id,phase,start_at,end_at')
      .in('realm_id', realmIds)
      .lte('start_at', `${endDate}T23:59:59Z`)
      .gte('end_at', `${startDate}T00:00:00Z`),
    supabase
      .from('realm_events')
      .select('realm_id,event_id,resource_id,resource_name,speed_modifier,since,until,produced_at_name')
      .in('realm_id', realmIds)
      .lte('since', `${endDate}T23:59:59Z`)
      .gte('until', `${startDate}T00:00:00Z`),
    supabase
      .from('realm_contests')
      .select('realm_id,contest_id,name,resource_id,resource_name,start_at,end_at')
      .in('realm_id', realmIds)
      .lte('start_at', `${endDate}T23:59:59Z`)
      .gte('end_at', `${startDate}T00:00:00Z`)
      .order('start_at', { ascending: false }),
  ])

  return {
    phases: phases.error ? [] : (phases.data as PhaseRange[]),
    events: events.error ? [] : (events.data as RealmEvent[]),
    contests: contests.error ? [] : (contests.data as RealmContest[]),
  }
}

async function loadResourceOptions(realm: RealmId) {
  const supabase = getSupabase()
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('resources')
    .select('resource_id,name')
    .eq('realm_id', realm)
    .order('name', { ascending: true })

  if (error || !data?.length) {
    return []
  }

  return data as ResourceOption[]
}

function speedModifierDirection(speedModifier: number) {
  if (speedModifier < 0) {
    return 'Expected direction: price pressure up and traded volume likely down while production slows.'
  }

  if (speedModifier > 0) {
    return 'Expected direction: price pressure down and traded volume likely up while production speeds up.'
  }

  return 'Expected direction: neutral unless demand shifts elsewhere.'
}

function movementStoryScore(change: number, marketValue: number, volume: number, medianMarketValue: number, medianVolume: number) {
  const marketWeight = Math.log1p(marketValue / Math.max(medianMarketValue, 1))
  const volumeWeight = Math.log1p(volume / Math.max(medianVolume, 1))
  return Math.abs(change) * (1 + marketWeight + volumeWeight * 0.7)
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return 1
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function loadResourceMiniSeries(
  realm: RealmId,
  resourceId: number,
  preferredQuality?: number,
): Promise<{ quality: number; series: MiniPoint[] } | null> {
  const supabase = getSupabase()
  if (!supabase) {
    return null
  }

  const query = supabase
    .from('market_daily')
    .select('date,quality,vwap,market_value')
    .eq('realm_id', realm)
    .eq('resource_id', resourceId)
    .order('date', { ascending: false })
    .limit(900)

  if (typeof preferredQuality === 'number') {
    query.eq('quality', preferredQuality)
  }

  const { data, error } = await query
  if (error || !data?.length) {
    return null
  }

  const rows = data as Array<{ date: string; quality: number; vwap: number; market_value: number }>
  const selectedQuality =
    preferredQuality ??
    rows
      .filter((row) => row.date === rows[0].date)
      .sort((a, b) => b.market_value - a.market_value)[0]?.quality ??
    0
  const series = rows
    .filter((row) => row.quality === selectedQuality)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((row) => ({ date: row.date, value: row.vwap }))

  return series.length ? { quality: selectedQuality, series } : null
}

async function loadResourceSignal(realm: RealmId): Promise<DashboardSignal | null> {
  const supabase = getSupabase()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('market_daily')
    .select('date,resource_id,resource_name,quality,vwap,volume,market_value')
    .eq('realm_id', realm)
    .order('date', { ascending: false })
    .limit(3200)

  if (error || !data?.length) {
    return null
  }

  const rows = data as Array<{
    date: string
    resource_id: number
    resource_name: string
    quality: number
    vwap: number
    volume: number
    market_value: number
  }>
  const dates = Array.from(new Set(rows.map((row) => row.date))).sort().slice(-2)
  const [previousDate, latestDate] = dates
  if (!previousDate || !latestDate) {
    return null
  }

  const previousByKey = new Map(
    rows
      .filter((row) => row.date === previousDate)
      .map((row) => [`${row.resource_id}:${row.quality}`, row]),
  )

  const latestRows = rows.filter((row) => row.date === latestDate)
  const medianMarketValue = median(latestRows.map((row) => row.market_value))
  const medianVolume = median(latestRows.map((row) => row.volume))

  const moves = latestRows
    .map((row) => {
      const previous = previousByKey.get(`${row.resource_id}:${row.quality}`)
      const change = previous?.vwap ? row.vwap / previous.vwap - 1 : 0
      const score = movementStoryScore(change, row.market_value, row.volume, medianMarketValue, medianVolume)
      return { row, change, score }
    })
    .filter((move) => Number.isFinite(move.change) && move.change !== 0)
    .sort((a, b) => b.score - a.score)

  const top = moves[0]
  if (!top) {
    return null
  }

  const direction = top.change >= 0 ? 'surged' : 'dropped'
  const series = rows
    .filter((row) => row.resource_id === top.row.resource_id && row.quality === top.row.quality)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((row) => ({ date: row.date, value: row.vwap }))

  return {
    title: top.change >= 0 ? 'Major Surge' : 'Massive Drop',
    name: `${top.row.resource_name} Q${top.row.quality}`,
    realm,
    detail: `${top.row.resource_name} ${direction} ${Math.abs(top.change * 100).toFixed(1)}% on the latest snapshot, with ${formatCompact(top.row.volume)} volume traded and ${formatCompact(top.row.market_value)} in VWAP-volume market value.`,
    tone: top.change >= 0 ? 'positive' : 'negative',
    series,
    target: {
      kind: 'resource',
      realm,
      resourceId: top.row.resource_id,
      resourceName: top.row.resource_name,
      quality: top.row.quality,
    },
  }
}

async function loadPagedMarketDailyRows(realm: RealmId, targetDateCount = 12) {
  const supabase = getSupabase()
  if (!supabase) {
    return []
  }

  const pageSize = 1000
  const maxRows = 36000
  const rows: MarketDailyRow[] = []
  const dates = new Set<string>()

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await supabase
      .from('market_daily')
      .select('date,resource_id,resource_name,quality,vwap,volume,market_value')
      .eq('realm_id', realm)
      .order('date', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error || !data?.length) {
      break
    }

    const page = data as MarketDailyRow[]
    rows.push(...page)
    page.forEach((row) => dates.add(row.date))

    if (dates.size >= targetDateCount || page.length < pageSize) {
      break
    }
  }

  const newestDates = Array.from(dates).sort().slice(-targetDateCount)
  const newestDateSet = new Set(newestDates)
  return rows.filter((row) => newestDateSet.has(row.date))
}

async function loadTechnicalSignal(realm: RealmId): Promise<DashboardTechnical | null> {
  const rows = await loadPagedMarketDailyRows(realm)
  if (!rows.length) {
    return null
  }
  const latestDate = rows.map((row) => row.date).sort().at(-1)
  if (!latestDate) {
    return null
  }

  const latestRows = rows.filter((row) => row.date === latestDate)
  const medianMarketValue = median(latestRows.map((row) => row.market_value))
  const medianVolume = median(latestRows.map((row) => row.volume))
  const groupedRows = new Map<string, typeof rows>()

  for (const row of rows) {
    const key = `${row.resource_id}:${row.quality}`
    groupedRows.set(key, [...(groupedRows.get(key) ?? []), row])
  }

  const candidates = Array.from(groupedRows.values())
    .map((group) => {
      const series = group
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30)
        .map((row) => ({ date: row.date, value: row.vwap }))
      const signal = analyzeTechnicals(series) ?? analyzeEmergingTechnicals(series)
      const latest = [...group].sort((a, b) => b.date.localeCompare(a.date))[0]
      if (!signal || !latest || series.length < 2) return null

      const marketWeight = Math.log1p(latest.market_value / Math.max(medianMarketValue, 1))
      const volumeWeight = Math.log1p(latest.volume / Math.max(medianVolume, 1))
      const actionableWeight = signal.type === 'range' ? 0.35 : 1
      const score = signal.strength * actionableWeight * (1 + marketWeight + volumeWeight * 0.65)
      return { latest, series, signal, score }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.score - a.score)

  const top = candidates[0]
  if (!top) {
    return null
  }

  const direction =
    top.signal.tone === 'positive'
      ? 'upside'
      : top.signal.tone === 'negative'
        ? 'downside'
        : 'range-bound'

  return {
    title: top.signal.title,
    name: `${top.latest.resource_name} Q${top.latest.quality}`,
    realm,
    detail: `${top.latest.resource_name} has the strongest ${direction} technical setup in ${realms[realm]}. ${top.signal.detail} Signal is weighted by ${formatCompact(top.latest.volume)} volume and ${formatCompact(top.latest.market_value)} VWAP-volume value.`,
    tone: top.signal.tone,
    series: top.series,
    technical: top.signal,
    target: {
      kind: 'resource',
      realm,
      resourceId: top.latest.resource_id,
      resourceName: top.latest.resource_name,
      quality: top.latest.quality,
    },
  }
}

async function loadDashboard() {
  const marketSeries = await Promise.all(
    ([0, 1] as RealmId[]).map(async (realmId) => {
      const rows = await loadIndexSeries(realmId, 'total_market')
      if (!rows?.length) return null
      const latest = rows.at(-1)!
      const previous = rows.at(-2) ?? latest
      const first = rows[0] ?? latest
      return {
        realm: realmId,
        latest,
        dailyChange: previous.value ? latest.value / previous.value - 1 : 0,
        periodChange: first.value ? latest.value / first.value - 1 : 0,
        series: rows.slice(-30).map((row) => ({ date: row.date, value: row.value })),
      }
    }),
  )

  const resourceSignals = await Promise.all(([0, 1] as RealmId[]).map(loadResourceSignal))
  const technicalSignals = await Promise.all(([0, 1] as RealmId[]).map(loadTechnicalSignal))
  const context = await loadChartContext([0, 1], demoSeries[0].date, new Date().toISOString().slice(0, 10))
  const activeEvents = context.events
    .filter((event) => event.until >= new Date().toISOString())
    .sort((a, b) => Math.abs(b.speed_modifier) - Math.abs(a.speed_modifier))
  const activeContests = context.contests
    .filter((contest) => contest.end_at >= new Date().toISOString())
    .sort((a, b) => b.start_at.localeCompare(a.start_at))

  const watchEvent = activeEvents[0]
  const watchContest = activeContests[0]
  const watchEventMini = watchEvent
    ? await loadResourceMiniSeries(watchEvent.realm_id, watchEvent.resource_id)
    : null
  const watchContestMini = watchContest?.resource_id
    ? await loadResourceMiniSeries(watchContest.realm_id, watchContest.resource_id)
    : null
  const watchSignal: DashboardSignal | null = watchEvent
    ? {
        title: watchEvent.speed_modifier < 0 ? 'Supply Pressure' : 'Production Boost',
        name: watchEvent.resource_name,
        realm: watchEvent.realm_id,
        detail: `${watchEvent.resource_name} has a ${watchEvent.speed_modifier > 0 ? '+' : ''}${watchEvent.speed_modifier}% production speed modifier active in ${realms[watchEvent.realm_id]}. ${speedModifierDirection(watchEvent.speed_modifier)}`,
        tone: watchEvent.speed_modifier >= 0 ? 'positive' : 'negative',
        series: watchEventMini?.series ?? [],
        target: {
          kind: 'resource',
          realm: watchEvent.realm_id,
          resourceId: watchEvent.resource_id,
          resourceName: watchEvent.resource_name,
          quality: watchEventMini?.quality ?? 0,
        },
      }
    : watchContest
      ? {
          title: 'Contest Watch',
          name: watchContest.resource_name ?? watchContest.name,
          realm: watchContest.realm_id,
          detail: `${watchContest.name} is active in ${realms[watchContest.realm_id]}, affecting ${watchContest.resource_name ?? 'a contest target'}. Contest demand may push attention and liquidity toward the target while it is active.`,
          tone: 'neutral',
          series: watchContestMini?.series ?? [],
          target: watchContest.resource_id && watchContest.resource_name
            ? {
                kind: 'resource',
                realm: watchContest.realm_id,
                resourceId: watchContest.resource_id,
                resourceName: watchContest.resource_name,
                quality: watchContestMini?.quality ?? 0,
              }
            : undefined,
        }
      : null

  return {
    markets: marketSeries.filter(Boolean) as DashboardMarket[],
    signals: [resourceSignals.filter(Boolean).sort((a, b) => {
      const aMagnitude = Number(a?.detail.match(/([\d.]+)%/)?.[1] ?? 0)
      const bMagnitude = Number(b?.detail.match(/([\d.]+)%/)?.[1] ?? 0)
      return bMagnitude - aMagnitude
    })[0], watchSignal].filter(Boolean) as DashboardSignal[],
    technicals: technicalSignals.filter(Boolean) as DashboardTechnical[],
  }
}

async function loadResourceMarketSeries(realm: RealmId, selection: ComparisonSelection) {
  if (selection.kind !== 'resource') {
    return []
  }

  const supabase = getSupabase()
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('market_daily')
    .select('date,vwap,market_value,volume')
    .eq('realm_id', selection.realm ?? realm)
    .eq('resource_id', selection.resourceId)
    .eq('quality', selection.quality)
    .order('date', { ascending: true })

  if (error || !data?.length) {
    return []
  }

  return data as MarketPoint[]
}

async function loadIndexComparisonSeries(realm: RealmId, selection: ComparisonSelection) {
  if (selection.kind !== 'index') {
    return []
  }

  const rows = await loadIndexSeries(selection.realm ?? realm, selection.indexCode)
  return rows?.map((row) => ({ date: row.date, value: row.value })) ?? []
}

function buildComparisonRows(
  seriesByKey: Map<string, ComparisonPoint[]>,
  selections: ComparisonSelection[],
  mode: CompareMode,
  timeframe: Timeframe,
) {
  const dateMap = new Map<string, ComparisonDatum>()

  for (const selection of selections) {
    const rows = filterByTimeframe(seriesByKey.get(selection.key) ?? [], timeframe)
    const baseline = rows.find((row) => row.value > 0)?.value ?? 0

    for (const row of rows) {
      const label = new Date(`${row.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const datum = dateMap.get(row.date) ?? { date: row.date, label }
      const rawValue = Number(row.value)
      datum[selection.key] = mode === 'percent' && baseline > 0 ? (rawValue / baseline - 1) * 100 : rawValue
      dateMap.set(row.date, datum)
    }
  }

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function comparisonKeys(selections: ComparisonSelection[]) {
  return selections.length > 0 ? selections.map((selection) => selection.key) : ['power', 'steel']
}

function comparisonDomain(rows: ComparisonDatum[], keys: string[]) {
  const values = rows.flatMap((row) =>
    keys
      .map((key) => row[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  )

  if (values.length === 0) {
    return ['auto', 'auto'] as const
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const padding = range > 0 ? range * 0.06 : Math.max(Math.abs(max) * 0.06, 1)

  return [min - padding, max + padding] as const
}

function technicalRowsFromSeries(rows: Array<{ date: string; value: number }>): TechnicalPoint[] {
  return rows
    .map((row) => ({ date: row.date, value: Number(row.value) }))
    .filter((row) => row.date && Number.isFinite(row.value))
}

function technicalRowsFromComparison(
  rows: ComparisonDatum[],
  key: string,
  timeframe: Timeframe,
): TechnicalPoint[] {
  return filterByTimeframe(
    rows
      .map((row) => ({ date: row.date, value: Number(row[key]) }))
      .filter((row) => row.date && Number.isFinite(row.value)),
    timeframe,
  )
}

function linearRegression(values: number[]) {
  const n = values.length
  const sumX = values.reduce((sum, _value, index) => sum + index, 0)
  const sumY = values.reduce((sum, value) => sum + value, 0)
  const sumXY = values.reduce((sum, value, index) => sum + index * value, 0)
  const sumXX = values.reduce((sum, _value, index) => sum + index * index, 0)
  const denominator = n * sumXX - sumX * sumX
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator
  const intercept = n === 0 ? 0 : (sumY - slope * sumX) / n
  return { slope, intercept }
}

function analyzeTechnicals(inputRows: TechnicalPoint[]): TechnicalSignal | null {
  const rows = inputRows.filter((row) => Number.isFinite(row.value) && row.value > 0).slice(-30)
  if (rows.length < 5) {
    return null
  }

  const values = rows.map((row) => row.value)
  const latest = values.at(-1)!
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range <= 0) {
    return null
  }

  const zoneSize = Math.max(range * 0.14, Math.abs(latest) * 0.018)
  const demandZone: [number, number] = [min, min + zoneSize]
  const supplyZone: [number, number] = [max - zoneSize, max]
  const { slope, intercept } = linearRegression(values)
  const fitted = values.map((_value, index) => intercept + slope * index)
  const residuals = values.map((value, index) => value - fitted[index])
  const upperOffset = Math.max(...residuals)
  const lowerOffset = Math.min(...residuals)
  const channelRange = upperOffset - lowerOffset
  const slopeThreshold = range / Math.max(rows.length * 4.5, 1)
  const channel =
    channelRange > 0
      ? {
          upper: [intercept + upperOffset, intercept + slope * (rows.length - 1) + upperOffset] as [number, number],
          lower: [intercept + lowerOffset, intercept + slope * (rows.length - 1) + lowerOffset] as [number, number],
        }
      : undefined

  const nearDemand = latest <= demandZone[1]
  const nearSupply = latest >= supplyZone[0]
  const demandProximity = Math.max(0, 1 - Math.abs(latest - demandZone[1]) / Math.max(zoneSize, 1))
  const supplyProximity = Math.max(0, 1 - Math.abs(latest - supplyZone[0]) / Math.max(zoneSize, 1))
  const channelKind =
    Math.abs(slope) >= slopeThreshold
      ? slope > 0
        ? 'ascending-channel'
        : 'descending-channel'
      : null
  const channelStrength = channelKind ? Math.min(Math.abs(slope) / Math.max(slopeThreshold, 0.000001), 3) / 3 : 0
  const channelLabel = channelKind === 'ascending-channel' ? 'Ascending Channel' : 'Descending Channel'

  if (nearDemand) {
    return {
      type: 'demand',
      title: 'Testing Demand',
      detail: `Price is near the recent demand zone around ${formatNumber(demandZone[0])}-${formatNumber(demandZone[1])}.`,
      tone: 'positive',
      strength: 1 + demandProximity + channelStrength * 0.35,
      demandZone,
      supplyZone,
      channel: channelKind ? channel : undefined,
    }
  }

  if (nearSupply) {
    return {
      type: 'supply',
      title: 'Testing Supply',
      detail: `Price is near the recent supply zone around ${formatNumber(supplyZone[0])}-${formatNumber(supplyZone[1])}.`,
      tone: 'negative',
      strength: 1 + supplyProximity + channelStrength * 0.35,
      demandZone,
      supplyZone,
      channel: channelKind ? channel : undefined,
    }
  }

  if (channelKind && channel) {
    return {
      type: channelKind,
      title: channelLabel,
      detail:
        channelKind === 'ascending-channel'
          ? 'Price is moving inside a rising channel, with higher support and resistance levels.'
          : 'Price is moving inside a falling channel, with lower support and resistance levels.',
      tone: channelKind === 'ascending-channel' ? 'positive' : 'negative',
      strength: 0.8 + channelStrength,
      demandZone,
      supplyZone,
      channel,
    }
  }

  return {
    type: 'range',
    title: 'Range Watch',
    detail: `Price is between demand near ${formatNumber(demandZone[0])} and supply near ${formatNumber(supplyZone[1])}.`,
    tone: 'neutral',
    strength: 0.35,
    demandZone,
    supplyZone,
  }
}

function analyzeEmergingTechnicals(inputRows: TechnicalPoint[]): TechnicalSignal | null {
  const rows = inputRows.filter((row) => Number.isFinite(row.value) && row.value > 0).slice(-4)
  if (rows.length < 2) {
    return null
  }

  const first = rows[0].value
  const latest = rows.at(-1)!.value
  const change = first ? latest / first - 1 : 0
  const tone = change >= 0 ? 'positive' : 'negative'

  return {
    type: change >= 0 ? 'ascending-channel' : 'descending-channel',
    title: change >= 0 ? 'Emerging Upside Setup' : 'Emerging Downside Setup',
    detail: `Only ${rows.length} technical points are available, but price is ${change >= 0 ? 'pushing higher' : 'pressing lower'} by ${formatPercent(change)} over that window.`,
    tone,
    strength: 0.55 + Math.min(Math.abs(change) * 3, 0.8),
  }
}

function chartDateWindow(rows: { date: string }[]) {
  const dates = rows.map((row) => row.date).filter(Boolean).sort()
  return {
    startDate: dates[0] ?? '',
    endDate: dates.at(-1) ?? '',
  }
}

function shortDateLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function contextForSelections(context: ChartContext, selections: ComparisonSelection[]) {
  if (selections.length === 0) {
    return context
  }

  const hasIndexByRealm = new Set(
    selections.filter((selection) => selection.kind === 'index').map((selection) => selection.realm),
  )
  const resourceIdsByRealm = new Map<RealmId, Set<number>>()

  for (const selection of selections) {
    if (selection.kind === 'resource') {
      const existing = resourceIdsByRealm.get(selection.realm) ?? new Set<number>()
      existing.add(selection.resourceId)
      resourceIdsByRealm.set(selection.realm, existing)
    }
  }

  return {
    phases: context.phases,
    events: context.events.filter((event) => {
      if (hasIndexByRealm.has(event.realm_id)) return true
      return resourceIdsByRealm.get(event.realm_id)?.has(event.resource_id) ?? false
    }),
    contests: context.contests.filter((contest) => {
      if (hasIndexByRealm.has(contest.realm_id)) return true
      if (!contest.resource_id) return false
      return resourceIdsByRealm.get(contest.realm_id)?.has(contest.resource_id) ?? false
    }),
  }
}

function recentContests(contests: RealmContest[]) {
  return [...contests]
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
    .slice(0, 1)
}

function eventLabel(events: RealmEvent[]) {
  if (events.length === 1) {
    const event = events[0]
    return `${event.resource_name} ${event.speed_modifier > 0 ? '+' : ''}${event.speed_modifier}%`
  }

  return 'Speed modifiers'
}

function groupedEvents(events: RealmEvent[]) {
  const groups = new Map<string, RealmEvent[]>()

  for (const event of events) {
    const key = `${event.realm_id}-${toDateOnly(event.since)}-${toDateOnly(event.until)}`
    groups.set(key, [...(groups.get(key) ?? []), event])
  }

  return Array.from(groups.values())
}

function contextItemsForDate(context: ChartContext, date: string) {
  const at = `${date}T12:00:00Z`
  const events = context.events.filter((event) => event.since <= at && event.until >= at)
  const contests = context.contests.filter((contest) => contest.start_at <= at && contest.end_at >= at)

  return { events, contests }
}

function hasMultipleRealms(context: ChartContext) {
  const realmIds = new Set([
    ...context.phases.map((phase) => phase.realm_id),
    ...context.events.map((event) => event.realm_id),
    ...context.contests.map((contest) => contest.realm_id),
  ])
  return realmIds.size > 1
}

function phaseFill(phase: PhaseRange) {
  if (phase.phase === 'boom') {
    return phase.realm_id === 1 ? 'var(--phase-boom-alt)' : 'var(--phase-boom)'
  }
  return phase.realm_id === 1 ? 'var(--phase-recession-alt)' : 'var(--phase-recession)'
}

function eventLineColor(events: RealmEvent[]) {
  const positive = events.reduce((sum, event) => sum + event.speed_modifier, 0) >= 0
  const realmId = events[0]?.realm_id ?? 0
  if (positive) return realmId === 1 ? 'var(--event-positive-line-alt)' : 'var(--event-positive-line)'
  return realmId === 1 ? 'var(--event-negative-line-alt)' : 'var(--event-negative-line)'
}

function contestLineColor(contest: RealmContest) {
  return contest.realm_id === 1 ? 'var(--contest-border-alt)' : 'var(--contest-border)'
}

function topOverlayDy(row: number) {
  return 12 + row * 14
}

function bottomOverlayDy(row: number) {
  return -8 - row * 14
}

function renderContextOverlays(
  context: ChartContext,
  showPhases: boolean,
  showEvents: boolean,
  showContests: boolean,
  keyPrefix: string,
) {
  const contests = recentContests(context.contests)
  const eventGroups = groupedEvents(context.events)
  const multiRealm = hasMultipleRealms(context)

  return (
    <>
      {showPhases &&
        context.phases
          .filter((phase) => phase.phase !== 'normal')
          .map((phase, index) => (
            <ReferenceArea
              fill={phaseFill(phase)}
              fillOpacity={1}
              ifOverflow="visible"
              key={`${keyPrefix}-phase-${phase.realm_id}-${phase.start_at}`}
              label={
                multiRealm
                  ? {
                      value: `${realms[phase.realm_id]} ${phase.phase}`,
                      fill: 'var(--muted)',
                      fontSize: 11,
                      dy: topOverlayDy(index % 2),
                      position: 'insideTop',
                    }
                  : undefined
              }
              strokeOpacity={0}
              x1={toDateOnly(phase.start_at)}
              x2={toDateOnly(phase.end_at)}
            />
          ))}
      {showEvents &&
        eventGroups.flatMap((events, index) => {
          const first = events[0]
          const label = `${multiRealm ? `${realms[first.realm_id]}: ` : ''}${eventLabel(events)}`
          const color = eventLineColor(events)
          const labelRow = 2 + (index % 4)

          return [
            <ReferenceLine
              ifOverflow="visible"
              key={`${keyPrefix}-event-start-${first.realm_id}-${first.since}-${first.until}`}
              label={{
                value: label,
                fill: color,
                fontSize: 11,
                dy: topOverlayDy(labelRow),
                position: 'insideTopLeft',
              }}
              stroke={color}
              strokeDasharray="4 4"
              x={toDateOnly(first.since)}
            />,
            <ReferenceLine
              ifOverflow="visible"
              key={`${keyPrefix}-event-end-${first.realm_id}-${first.since}-${first.until}`}
              stroke={color}
              strokeDasharray="4 4"
              x={toDateOnly(first.until)}
            />,
          ]
        })}
      {showContests &&
        contests.flatMap((contest, index) => (
          [
            <ReferenceLine
              ifOverflow="visible"
              key={`${keyPrefix}-contest-start-${contest.realm_id}-${contest.contest_id}`}
              label={{
                value: `${multiRealm ? `${realms[contest.realm_id]}: ` : ''}${contest.name}`,
                fill: contestLineColor(contest),
                fontSize: 11,
                dy: bottomOverlayDy(index),
                position: 'insideBottomLeft',
              }}
              stroke={contestLineColor(contest)}
              strokeDasharray="4 4"
              x={toDateOnly(contest.start_at)}
            />,
            <ReferenceLine
              ifOverflow="visible"
              key={`${keyPrefix}-contest-end-${contest.realm_id}-${contest.contest_id}`}
              stroke={contestLineColor(contest)}
              strokeDasharray="4 4"
              x={toDateOnly(contest.end_at)}
            />,
          ]
        ))}
    </>
  )
}

function renderTechnicalOverlays(
  rows: TechnicalPoint[],
  signal: TechnicalSignal | null,
  keyPrefix: string,
  color = 'var(--accent)',
) {
  if (!signal || rows.length < 2) {
    return null
  }

  const startDate = rows[0].date
  const endDate = rows.at(-1)!.date

  return (
    <>
      {signal.demandZone && (
        <ReferenceArea
          fill="var(--technical-demand)"
          fillOpacity={1}
          ifOverflow="visible"
          key={`${keyPrefix}-demand-zone`}
          label={{
            value: 'Demand zone',
            fill: 'var(--technical-demand-line)',
            fontSize: 11,
            position: 'insideBottomLeft',
          }}
          stroke="var(--technical-demand-line)"
          strokeDasharray="5 4"
          x1={startDate}
          x2={endDate}
          y1={signal.demandZone[0]}
          y2={signal.demandZone[1]}
        />
      )}
      {signal.supplyZone && (
        <ReferenceArea
          fill="var(--technical-supply)"
          fillOpacity={1}
          ifOverflow="visible"
          key={`${keyPrefix}-supply-zone`}
          label={{
            value: 'Supply zone',
            fill: 'var(--technical-supply-line)',
            fontSize: 11,
            position: 'insideTopLeft',
          }}
          stroke="var(--technical-supply-line)"
          strokeDasharray="5 4"
          x1={startDate}
          x2={endDate}
          y1={signal.supplyZone[0]}
          y2={signal.supplyZone[1]}
        />
      )}
      {signal.channel && (
        <>
          <ReferenceLine
            ifOverflow="visible"
            key={`${keyPrefix}-channel-upper`}
            label={{
              value: signal.type === 'ascending-channel' ? 'Ascending channel' : 'Descending channel',
              fill: color,
              fontSize: 11,
              position: 'insideTopRight',
            }}
            segment={[
              { x: startDate, y: signal.channel.upper[0] },
              { x: endDate, y: signal.channel.upper[1] },
            ]}
            stroke={color}
            strokeDasharray="6 5"
          />
          <ReferenceLine
            ifOverflow="visible"
            key={`${keyPrefix}-channel-lower`}
            segment={[
              { x: startDate, y: signal.channel.lower[0] },
              { x: endDate, y: signal.channel.lower[1] },
            ]}
            stroke={color}
            strokeDasharray="6 5"
          />
        </>
      )}
    </>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  context,
  valueLabel,
}: {
  active?: boolean
  payload?: ReadonlyArray<any>
  label?: string | number
  context: ChartContext
  valueLabel: string
}) {
  if (!active || !payload?.length || !label) {
    return null
  }

  const dateLabel = String(label)
  const { events, contests } = contextItemsForDate(context, dateLabel)
  const eventsByRealm = ([0, 1] as RealmId[])
    .map((realmId) => ({
      realmId,
      events: events.filter((event) => event.realm_id === realmId),
    }))
    .filter((group) => group.events.length > 0)
  const contestsByRealm = ([0, 1] as RealmId[])
    .map((realmId) => ({
      realmId,
      contests: contests.filter((contest) => contest.realm_id === realmId),
    }))
    .filter((group) => group.contests.length > 0)

  return (
    <div className="chart-tooltip">
      <strong>{formatDisplayDate(dateLabel)}</strong>
      {payload.map((item) => (
        <span key={`${item.name}-${item.value}`}>
          <i style={{ background: item.color }} />
          {String(item.name ?? valueLabel)}: {formatNumber(Number(item.value))}
        </span>
      ))}
      {eventsByRealm.length > 0 && (
        <div className="tooltip-context">
          <b>Speed modifiers</b>
          {eventsByRealm.map((group) => (
            <div className="tooltip-realm-group" key={`events-${group.realmId}`}>
              <em>{realms[group.realmId]}</em>
              {group.events.slice(0, 5).map((event) => (
                <small key={event.event_id}>
                  {event.resource_name}: {event.speed_modifier > 0 ? '+' : ''}
                  {event.speed_modifier}%
                </small>
              ))}
            </div>
          ))}
        </div>
      )}
      {contestsByRealm.length > 0 && (
        <div className="tooltip-context">
          <b>Contests</b>
          {contestsByRealm.map((group) => (
            <div className="tooltip-realm-group" key={`contests-${group.realmId}`}>
              <em>{realms[group.realmId]}</em>
              {group.contests.slice(0, 2).map((contest) => (
                <small key={contest.contest_id}>{contest.name}</small>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniChart({
  data,
  tone = 'neutral',
  technical,
}: {
  data: MiniPoint[]
  tone?: DashboardSignal['tone']
  technical?: TechnicalSignal | null
}) {
  if (data.length < 2) {
    return <div className="mini-chart empty">No trend yet</div>
  }

  return (
    <div className={`mini-chart ${tone}`} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={['auto', 'auto']} />
          {technical && (
            <>
              {technical.demandZone && (
                <ReferenceArea
                  fill="var(--technical-demand)"
                  fillOpacity={1}
                  stroke="var(--technical-demand-line)"
                  strokeDasharray="4 4"
                  x1={data[0].date}
                  x2={data.at(-1)!.date}
                  y1={technical.demandZone[0]}
                  y2={technical.demandZone[1]}
                />
              )}
              {technical.supplyZone && (
                <ReferenceArea
                  fill="var(--technical-supply)"
                  fillOpacity={1}
                  stroke="var(--technical-supply-line)"
                  strokeDasharray="4 4"
                  x1={data[0].date}
                  x2={data.at(-1)!.date}
                  y1={technical.supplyZone[0]}
                  y2={technical.supplyZone[1]}
                />
              )}
              {technical.channel && (
                <>
                  <ReferenceLine
                    segment={[
                      { x: data[0].date, y: technical.channel.upper[0] },
                      { x: data.at(-1)!.date, y: technical.channel.upper[1] },
                    ]}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    segment={[
                      { x: data[0].date, y: technical.channel.lower[0] },
                      { x: data.at(-1)!.date, y: technical.channel.lower[1] },
                    ]}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                  />
                </>
              )}
            </>
          )}
          <Line
            dataKey="value"
            dot={false}
            isAnimationActive={false}
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={2.4}
            type="monotone"
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
}

function App() {
  const storedComparisonState = useMemo(
    () => readJsonStorage<Partial<ComparisonState>>(comparisonStateKey, {}),
    [],
  )
  const storedChartFilters = useMemo(
    () => readJsonStorage<Partial<ChartFilters>>(chartFiltersKey, {}),
    [],
  )
  const [activeView, setActiveView] = useState<AppView>('dashboard')
  const [realm, setRealm] = useState<RealmId>(0)
  const [selectedIndex, setSelectedIndex] = useState<IndexCode>('total_market')
  const [q0IncludesResearch, setQ0IncludesResearch] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('simco-theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [series, setSeries] = useState<IndexPoint[]>(demoSeries)
  const [components, setComponents] = useState<ComponentRow[]>(demoComponents)
  const [usingDemoData, setUsingDemoData] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [dashboardMarkets, setDashboardMarkets] = useState<DashboardMarket[]>([])
  const [dashboardSignals, setDashboardSignals] = useState<DashboardSignal[]>([])
  const [dashboardTechnicals, setDashboardTechnicals] = useState<DashboardTechnical[]>([])
  const [isDashboardLoading, setIsDashboardLoading] = useState(false)
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([])
  const [comparisonKind, setComparisonKind] = useState<ComparisonKind>(
    storedComparisonState.kind === 'resource' ? 'resource' : 'index',
  )
  const [selectedComparisonRealm, setSelectedComparisonRealm] = useState<RealmId>(
    storedComparisonState.selectedRealm === 1 ? 1 : 0,
  )
  const [selectedComparisonIndex, setSelectedComparisonIndex] = useState<IndexCode>(
    storedComparisonState.selectedIndex ?? 'total_market',
  )
  const [selectedResourceId, setSelectedResourceId] = useState(storedComparisonState.selectedResourceId ?? '')
  const [selectedQuality, setSelectedQuality] = useState(storedComparisonState.selectedQuality ?? 0)
  const [comparisonSelections, setComparisonSelections] = useState<ComparisonSelection[]>(
    storedComparisonState.selections ?? [],
  )
  const [comparisonSeries, setComparisonSeries] = useState<ComparisonDatum[]>(demoComparisonData)
  const [compareMode, setCompareMode] = useState<CompareMode>(storedComparisonState.mode ?? 'percent')
  const [compareMetric, setCompareMetric] = useState<CompareMetric>(storedComparisonState.metric ?? 'vwap')
  const [compareTimeframe, setCompareTimeframe] = useState<Timeframe>(storedComparisonState.timeframe ?? '30d')
  const [comparisonHeight, setComparisonHeight] = useState(storedComparisonState.height ?? 460)
  const [presetName, setPresetName] = useState('')
  const [comparisonPresets, setComparisonPresets] = useState<ComparisonPreset[]>(() =>
    readJsonStorage<ComparisonPreset[]>(comparisonPresetsKey, []),
  )
  const [isComparisonLoading, setIsComparisonLoading] = useState(false)
  const [showPhases, setShowPhases] = useState(Boolean(storedChartFilters.showPhases))
  const [showEvents, setShowEvents] = useState(Boolean(storedChartFilters.showEvents))
  const [showContests, setShowContests] = useState(Boolean(storedChartFilters.showContests))
  const [showTechnicals, setShowTechnicals] = useState(Boolean(storedChartFilters.showTechnicals))
  const [overviewContext, setOverviewContext] = useState<ChartContext>({
    phases: [],
    events: [],
    contests: [],
  })
  const [comparisonContext, setComparisonContext] = useState<ChartContext>({
    phases: [],
    events: [],
    contests: [],
  })
  const [nextUpdate, setNextUpdate] = useState(() => nextUpdateDate())
  const [updateCountdown, setUpdateCountdown] = useState(() => formatCountdown(nextUpdateDate()))

  const qualityDefinitions = qualityLevels.map((quality) => qualityIndexDefinition(quality, q0IncludesResearch))
  const allIndexDefinitions = useMemo(
    () => [...indexDefinitions, ...qualityDefinitions],
    [qualityDefinitions],
  )
  const activeDefinition =
    allIndexDefinitions.find((item) => item.code === selectedIndex) ?? indexDefinitions[0]
  const latest = series.at(-1) ?? demoSeries.at(-1)!
  const previous = series.at(-2) ?? latest
  const dailyChange = previous.value ? latest.value / previous.value - 1 : 0
  const first = series[0] ?? latest
  const periodChange = first.value ? latest.value / first.value - 1 : 0

  const visibleSeries = useMemo(
    () =>
      series.map((point) => ({
        ...point,
        label: new Date(`${point.date}T00:00:00Z`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      })),
    [series],
  )
  const activeComparisonKeys = useMemo(() => comparisonKeys(comparisonSelections), [comparisonSelections])
  const activeComparisonDomain = useMemo(
    () => comparisonDomain(comparisonSeries, activeComparisonKeys),
    [comparisonSeries, activeComparisonKeys],
  )
  const overviewDateWindow = useMemo(() => chartDateWindow(visibleSeries), [visibleSeries])
  const comparisonDateWindow = useMemo(() => chartDateWindow(comparisonSeries), [comparisonSeries])
  const filteredComparisonContext = useMemo(
    () => contextForSelections(comparisonContext, comparisonSelections),
    [comparisonContext, comparisonSelections],
  )
  const overviewTechnicalRows = useMemo(() => technicalRowsFromSeries(visibleSeries), [visibleSeries])
  const overviewTechnicalSignal = useMemo(
    () => analyzeTechnicals(overviewTechnicalRows),
    [overviewTechnicalRows],
  )
  const comparisonTechnicals = useMemo(
    () =>
      activeComparisonKeys
        .map((key, index) => {
          const rows = technicalRowsFromComparison(comparisonSeries, key, compareTimeframe)
          return {
            key,
            rows,
            color: comparisonColors[index % comparisonColors.length],
            signal: analyzeTechnicals(rows),
          }
        })
        .filter((item) => item.signal),
    [activeComparisonKeys, comparisonSeries, compareTimeframe],
  )
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('simco-theme', theme)
  }, [theme])

  useEffect(() => {
    function refreshCountdown() {
      const next = nextUpdateDate()
      setNextUpdate(next)
      setUpdateCountdown(formatCountdown(next))
    }

    refreshCountdown()
    const interval = window.setInterval(refreshCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const currentState: ComparisonState = {
      kind: comparisonKind,
      selectedRealm: selectedComparisonRealm,
      selectedIndex: selectedComparisonIndex,
      selectedResourceId,
      selectedQuality,
      selections: comparisonSelections,
      mode: compareMode,
      metric: compareMetric,
      timeframe: compareTimeframe,
      height: comparisonHeight,
    }
    localStorage.setItem(comparisonStateKey, JSON.stringify(currentState))
  }, [
    comparisonKind,
    selectedComparisonRealm,
    selectedComparisonIndex,
    selectedResourceId,
    selectedQuality,
    comparisonSelections,
    compareMode,
    compareMetric,
    compareTimeframe,
    comparisonHeight,
  ])

  useEffect(() => {
    localStorage.setItem(comparisonPresetsKey, JSON.stringify(comparisonPresets))
  }, [comparisonPresets])

  useEffect(() => {
    let isCurrent = true

    async function refreshDashboard() {
      setIsDashboardLoading(true)
      const data = await loadDashboard()
      if (!isCurrent) return
      setDashboardMarkets(data.markets)
      setDashboardSignals(data.signals)
      setDashboardTechnicals(data.technicals)
      setIsDashboardLoading(false)
    }

    refreshDashboard()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    const filters: ChartFilters = {
      showPhases,
      showEvents,
      showContests,
      showTechnicals,
    }
    localStorage.setItem(chartFiltersKey, JSON.stringify(filters))
  }, [showPhases, showEvents, showContests, showTechnicals])

  useEffect(() => {
    let isCurrent = true

    async function refreshOverviewContext() {
      const context = await loadChartContext([realm], overviewDateWindow.startDate, overviewDateWindow.endDate)
      if (isCurrent) {
        setOverviewContext(context)
      }
    }

    refreshOverviewContext()

    return () => {
      isCurrent = false
    }
  }, [realm, overviewDateWindow.startDate, overviewDateWindow.endDate])

  useEffect(() => {
    let isCurrent = true

    async function refreshData() {
      setIsLoading(true)
      const loadedSeries = await loadIndexSeries(realm, selectedIndex)

      if (!isCurrent) return

      if (!loadedSeries) {
        setSeries(
          demoSeries.map((point) => ({
            ...point,
            realm_id: realm,
            index_code: selectedIndex,
            value:
              point.value +
              (realm === 1 ? 34 : 0) +
              (selectedIndex === 'sc_10' ? 110 : selectedIndex === 'equal_weight_market' ? -42 : 0),
          })),
        )
        setComponents(demoComponents)
        setUsingDemoData(true)
        setIsLoading(false)
        return
      }

      setSeries(loadedSeries)
      const latestDate = loadedSeries.at(-1)?.date
      const loadedComponents = latestDate ? await loadIndexComponents(realm, selectedIndex, latestDate) : null

      if (!isCurrent) return

      setComponents(loadedComponents ?? [])
      setUsingDemoData(false)
      setIsLoading(false)
    }

    refreshData()

    return () => {
      isCurrent = false
    }
  }, [realm, selectedIndex])

  useEffect(() => {
    if (selectedIndex === 'quality_0' || selectedIndex === 'quality_0_with_research') {
      setSelectedIndex(qualityIndexCode(0, q0IncludesResearch))
    }
  }, [q0IncludesResearch, selectedIndex])

  useEffect(() => {
    let isCurrent = true

    async function refreshResources() {
      const options = await loadResourceOptions(selectedComparisonRealm)
      if (!isCurrent) return
      setResourceOptions(options)
      setSelectedResourceId((current) => current || options[0]?.resource_id.toString() || '')
    }

    refreshResources()

    return () => {
      isCurrent = false
    }
  }, [selectedComparisonRealm])

  useEffect(() => {
    let isCurrent = true

    async function refreshComparison() {
      if (comparisonSelections.length === 0) {
        setComparisonSeries(demoComparisonData)
        return
      }

      setIsComparisonLoading(true)
      setComparisonSeries([])
      const loaded = await Promise.all(
        comparisonSelections.map(async (selection) => [
          selection.key,
          selection.kind === 'index'
            ? await loadIndexComparisonSeries(realm, selection)
            : (await loadResourceMarketSeries(realm, selection)).map((row) => ({
                date: row.date,
                value: compareMetric === 'market_value' ? row.market_value : row.vwap,
              })),
        ] as const),
      )

      if (!isCurrent) return

      const seriesByKey = new Map(loaded)
      const rows = buildComparisonRows(
        seriesByKey,
        comparisonSelections,
        compareMode,
        compareTimeframe,
      )
      setComparisonSeries(rows)
      setIsComparisonLoading(false)
    }

    refreshComparison()

    return () => {
      isCurrent = false
    }
  }, [realm, comparisonSelections, compareMetric, compareMode, compareTimeframe])

  useEffect(() => {
    let isCurrent = true

    async function refreshComparisonContext() {
      const realmIds =
        comparisonSelections.length > 0
          ? Array.from(new Set(comparisonSelections.map((selection) => selection.realm)))
          : [selectedComparisonRealm]
      const context = await loadChartContext(
        realmIds,
        comparisonDateWindow.startDate,
        comparisonDateWindow.endDate,
      )
      if (isCurrent) {
        setComparisonContext(context)
      }
    }

    refreshComparisonContext()

    return () => {
      isCurrent = false
    }
  }, [
    selectedComparisonRealm,
    comparisonSelections,
    comparisonDateWindow.startDate,
    comparisonDateWindow.endDate,
  ])

  function addComparisonSelection() {
    if (comparisonKind === 'index') {
      const index = allIndexDefinitions.find((item) => item.code === selectedComparisonIndex)
      if (!index) return

      const key = `r${selectedComparisonRealm}i${index.code}`
      if (comparisonSelections.some((selection) => selection.key === key)) {
        return
      }

      const selection: IndexComparisonSelection = {
        key,
        kind: 'index',
        realm: selectedComparisonRealm,
        indexCode: index.code,
        indexName: index.name,
      }
      setComparisonSelections((current) => [...current, selection].slice(0, 6))
      return
    }

    const resourceId = Number(selectedResourceId)
    const option = resourceOptions.find((resource) => resource.resource_id === resourceId)
    if (!option) return

    const key = `r${selectedComparisonRealm}r${resourceId}q${selectedQuality}`
    if (comparisonSelections.some((selection) => selection.key === key)) {
      return
    }

    const selection: ResourceComparisonSelection = {
      key,
      kind: 'resource',
      realm: selectedComparisonRealm,
      resourceId,
      resourceName: option.name,
      quality: selectedQuality,
    }
    setComparisonSelections((current) => [...current, selection].slice(0, 6))
  }

  function removeComparisonSelection(key: string) {
    setComparisonSelections((current) => current.filter((selection) => selection.key !== key))
  }

  function currentComparisonState(): ComparisonState {
    return {
      kind: comparisonKind,
      selectedRealm: selectedComparisonRealm,
      selectedIndex: selectedComparisonIndex,
      selectedResourceId,
      selectedQuality,
      selections: comparisonSelections,
      mode: compareMode,
      metric: compareMetric,
      timeframe: compareTimeframe,
      height: comparisonHeight,
    }
  }

  function applyComparisonState(state: ComparisonState) {
    setComparisonKind(state.kind)
    setSelectedComparisonRealm(state.selectedRealm ?? realm)
    setSelectedComparisonIndex(state.selectedIndex)
    setSelectedResourceId(state.selectedResourceId)
    setSelectedQuality(state.selectedQuality)
    setComparisonSelections(state.selections)
    setCompareMode(state.mode)
    setCompareMetric(state.metric)
    setCompareTimeframe(state.timeframe)
    setComparisonHeight(state.height)
  }

  function saveComparisonPreset() {
    if (comparisonSelections.length === 0) return

    const preset: ComparisonPreset = {
      ...currentComparisonState(),
      id: crypto.randomUUID(),
      name: presetName.trim() || `Preset ${comparisonPresets.length + 1}`,
    }
    setComparisonPresets((current) => [preset, ...current].slice(0, 12))
    setPresetName('')
  }

  function deleteComparisonPreset(id: string) {
    setComparisonPresets((current) => current.filter((preset) => preset.id !== id))
  }

  function goToDashboardTarget(target: DashboardTarget) {
    if (target.kind === 'index') {
      setRealm(target.realm)
      setSelectedIndex(target.indexCode)
      setActiveView('overview')
      return
    }

    const selection: ResourceComparisonSelection = {
      key: `r${target.realm}r${target.resourceId}q${target.quality}`,
      kind: 'resource',
      realm: target.realm,
      resourceId: target.resourceId,
      resourceName: target.resourceName,
      quality: target.quality,
    }

    setSelectedComparisonRealm(target.realm)
    setComparisonKind('resource')
    setSelectedResourceId(target.resourceId.toString())
    setSelectedQuality(target.quality)
    setComparisonSelections([selection])
    setActiveView('compare')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SimCompanies Market Indices</p>
          <h1>Realm-level resource market performance</h1>
        </div>
        <div className="topbar-actions">
          <button
            aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
            className="icon-button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            type="button"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="status-strip">
            <span className={usingDemoData ? 'status-dot demo' : 'status-dot live'} />
            {usingDemoData ? 'Demo data' : 'Database Live'}
          </div>
        </div>
      </header>

      <section className="control-row" aria-label="Dashboard controls">
        <div className="segmented-control" aria-label="Realm">
          {Object.entries(realms).map(([id, name]) => (
            <button
              className={Number(id) === realm ? 'active' : ''}
              key={id}
              onClick={() => setRealm(Number(id) as RealmId)}
              type="button"
            >
              <Globe2 size={16} />
              {name}
            </button>
          ))}
        </div>
        <div className="update-note">
          <CalendarClock size={16} />
          <span>Next update in</span>
          <strong>{updateCountdown}</strong>
          <small>{nextUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      </section>

      <section className="chart-overlay-controls" aria-label="Chart overlays">
        <button
          className={showPhases ? 'active' : ''}
          onClick={() => setShowPhases((current) => !current)}
          type="button"
        >
          Show Phase
        </button>
        <button
          className={showEvents ? 'active' : ''}
          onClick={() => setShowEvents((current) => !current)}
          type="button"
        >
          Show Events
        </button>
        <button
          className={showContests ? 'active' : ''}
          onClick={() => setShowContests((current) => !current)}
          type="button"
        >
          Show Contests
        </button>
        <button
          className={showTechnicals ? 'active' : ''}
          onClick={() => setShowTechnicals((current) => !current)}
          type="button"
        >
          Show Technicals
        </button>
      </section>

      <nav className={`view-tabs ${activeView}`} aria-label="Views">
        <button
          className={activeView === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveView('dashboard')}
          type="button"
        >
          <Activity size={16} />
          Dashboard
        </button>
        <button
          className={activeView === 'overview' ? 'active' : ''}
          onClick={() => setActiveView('overview')}
          type="button"
        >
          <LineChartIcon size={16} />
          Overview
        </button>
        <button
          className={activeView === 'compare' ? 'active' : ''}
          onClick={() => setActiveView('compare')}
          type="button"
        >
          <BarChart3 size={16} />
          Comparisons
        </button>
      </nav>

      {activeView === 'dashboard' && (
        <section className="clean-dashboard view-panel">
          <div className="dashboard-hero">
            <div>
              <p className="eyebrow">Daily Brief</p>
              <h2>Overall Market</h2>
            </div>
            <span className="loading-state">
              <RefreshCw className={isDashboardLoading ? 'spin' : ''} size={15} />
              {isDashboardLoading ? 'Refreshing' : 'Ready'}
            </span>
          </div>

          <div className="market-summary-grid">
            {dashboardMarkets.map((market) => (
              <article className="market-summary-card" key={market.realm}>
                <div className="dashboard-card-main">
                  <span>{realms[market.realm]}</span>
                  <strong>{formatNumber(market.latest.value)}</strong>
                  <small className={market.dailyChange >= 0 ? 'positive' : 'negative'}>
                    {market.dailyChange >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                    {formatPercent(market.dailyChange)} today
                  </small>
                  <small className={market.periodChange >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(market.periodChange)} over visible history
                  </small>
                </div>
                <div className="dashboard-card-side">
                  <MiniChart data={market.series} tone={market.dailyChange >= 0 ? 'positive' : 'negative'} />
                  <button
                    className="go-to-button"
                    onClick={() => goToDashboardTarget({
                      kind: 'index',
                      realm: market.realm,
                      indexCode: 'total_market',
                    })}
                    type="button"
                  >
                    <ArrowUpRight size={15} />
                    Go To
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="signal-grid">
            {(dashboardSignals.length ? dashboardSignals : [
              {
                title: 'Resource of the Day',
                name: 'Waiting for data',
                realm: 0 as RealmId,
                detail: 'The dashboard will highlight market moves after the latest database snapshot loads.',
                tone: 'neutral' as const,
                series: [],
              },
            ]).map((signal, index) => (
              <article className={`signal-card ${signal.tone}`} key={`${signal.title}-${signal.name}-${index}`}>
                <div className="dashboard-card-main">
                  <p className="eyebrow">{realms[signal.realm]}</p>
                  <h2>{signal.title}</h2>
                  <strong>{signal.name}</strong>
                  <p>{signal.detail}</p>
                </div>
                <div className="dashboard-card-side">
                  <MiniChart data={signal.series} tone={signal.tone} />
                  <button
                    className="go-to-button"
                    disabled={!signal.target}
                    onClick={() => signal.target && goToDashboardTarget(signal.target)}
                    type="button"
                  >
                    <ArrowUpRight size={15} />
                    Go To
                  </button>
                </div>
              </article>
            ))}
          </div>

          <section className="technical-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Technical Analysis</p>
                <h2>Levels and channels</h2>
              </div>
            </div>
            <div className="technical-grid">
              {(dashboardTechnicals.length ? dashboardTechnicals : [
                {
                  title: 'Waiting for setup',
                  name: 'No signal yet',
                  realm: 0 as RealmId,
                  detail: 'The dashboard will highlight a resource when enough technical history is available.',
                  tone: 'neutral' as const,
                  series: [],
                  technical: null,
                  target: undefined,
                },
              ]).map((item) => (
                <article className="technical-card" key={item.realm}>
                  <div>
                    <p className="eyebrow">{realms[item.realm]}</p>
                    <strong>{item.name}</strong>
                    <span>{item.title}: {item.detail}</span>
                  </div>
                  <div className="dashboard-card-side">
                    <MiniChart data={item.series} technical={item.technical} tone={item.tone} />
                    <button
                      className="go-to-button"
                      disabled={!item.target}
                      onClick={() => item.target && goToDashboardTarget(item.target)}
                      type="button"
                    >
                      <ArrowUpRight size={15} />
                      Go To
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {activeView === 'overview' ? (
        <section className="overview-view view-panel">
          <section className="index-grid" aria-label="Indices">
            {indexDefinitions.map((item) => (
              <button
                className={`index-tile ${item.code === selectedIndex ? 'active' : ''}`}
                key={item.code}
                onClick={() => setSelectedIndex(item.code)}
                type="button"
              >
                <span className="tile-icon">
                  {item.code === 'total_market' && <LineChartIcon size={18} />}
                  {(item.code === 'sc_10' || item.code === 'sc_30' || item.code === 'sc_50') && (
                    <Activity size={18} />
                  )}
                  {item.code === 'research_only' && <FlaskConical size={18} />}
                  {item.code === 'food_only' && <Soup size={18} />}
                  {item.code === 'construction_only' && <Hammer size={18} />}
                  {item.code === 'equal_weight_market' && <BarChart3 size={18} />}
                  {item.code === 'agriculture_only' && <Sprout size={18} />}
                  {item.code === 'fashion_only' && <Shirt size={18} />}
                  {item.code === 'energy_only' && <Zap size={18} />}
                  {item.code === 'electronics_only' && <Cpu size={18} />}
                  {item.code === 'automotive_only' && <Car size={18} />}
                  {item.code === 'aerospace_only' && <Rocket size={18} />}
                  {item.code === 'resources_only' && <Pickaxe size={18} />}
                  {item.code === 'seasonal_only' && <Sparkles size={18} />}
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.method}</small>
                </span>
              </button>
            ))}
          </section>

          <section className="quality-panel" aria-label="Quality indices">
            <div className="quality-header">
              <div>
                <p className="eyebrow">Quality Indices</p>
                <h2>Q0-Q12 activity baskets</h2>
              </div>
              <label className="toggle-row">
                <input
                  checked={q0IncludesResearch}
                  onChange={(event) => setQ0IncludesResearch(event.target.checked)}
                  type="checkbox"
                />
                Include research in Q0
              </label>
            </div>
            <div className="quality-grid">
              {qualityLevels.map((quality) => {
                const item = qualityIndexDefinition(quality, q0IncludesResearch)
                return (
                  <button
                    className={`quality-tile ${item.code === selectedIndex ? 'active' : ''}`}
                    key={quality}
                    onClick={() => setSelectedIndex(item.code)}
                    type="button"
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="chart-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{realms[realm]}</p>
                  <h2>{activeDefinition.name}</h2>
                  <p>{activeDefinition.description}</p>
                </div>
                <div className="latest-value">
                  <span>{formatNumber(latest.value)}</span>
                  <small className={dailyChange >= 0 ? 'positive' : 'negative'}>
                    {dailyChange >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                    {formatPercent(dailyChange)} 1D
                  </small>
                </div>
              </div>

              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleSeries} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="indexFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                    <XAxis
                      dataKey="date"
                      minTickGap={28}
                      tickFormatter={shortDateLabel}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={['dataMin - 20', 'dataMax + 20']}
                      tickFormatter={(value) => formatNumber(Number(value))}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <Tooltip
                      content={(props) => (
                        <ChartTooltip
                          {...props}
                          context={overviewContext}
                          valueLabel="Index"
                        />
                      )}
                    />
                    {renderContextOverlays(overviewContext, showPhases, showEvents, showContests, 'overview')}
                    {showTechnicals &&
                      renderTechnicalOverlays(
                        overviewTechnicalRows,
                        overviewTechnicalSignal,
                        'overview-technical',
                      )}
                    <Area
                      dataKey="value"
                      type="monotone"
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fill="url(#indexFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <aside className="metrics-panel">
              <div className="metric">
                <span>Period Change</span>
                <strong className={periodChange >= 0 ? 'positive' : 'negative'}>{formatPercent(periodChange)}</strong>
              </div>
              <div className="metric">
                <span>Components</span>
                <strong>{formatNumber(latest.component_count)}</strong>
              </div>
              <div className="metric">
                <span>Market Value</span>
                <strong>{formatCompact(latest.total_market_value)}</strong>
              </div>
              <div className="metric">
                <span>Latest Date</span>
                <strong>{formatDisplayDate(latest.date)}</strong>
              </div>
              <div className="data-source">
                <Database size={17} />
                {usingDemoData
                  ? 'Live market history appears here after the database is connected.'
                  : 'Updated from the latest collected market snapshot.'}
              </div>
            </aside>
          </section>

          <section className="components-panel">
            <div className="panel-header compact">
              <div>
                <p className="eyebrow">Current Basket</p>
                <h2>Largest Components</h2>
              </div>
              <span className="loading-state">
                <RefreshCw className={isLoading ? 'spin' : ''} size={15} />
                {isLoading ? 'Refreshing' : 'Ready'}
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Q</th>
                    <th>Weight</th>
                    <th>VWAP</th>
                    <th>Volume</th>
                    <th>Market Value</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((row) => (
                    <tr key={`${row.resource_id}-${row.quality}`}>
                      <td>
                        <strong>{row.resource_name}</strong>
                        <span>#{row.resource_id}</span>
                      </td>
                      <td>{row.quality}</td>
                      <td>{formatPercent(row.weight)}</td>
                      <td>{formatNumber(row.vwap)}</td>
                      <td>{formatCompact(row.volume)}</td>
                      <td>{formatCompact(row.market_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : activeView === 'compare' ? (
        <section className="comparison-panel view-panel">
          <div className="panel-header comparison-heading">
            <div>
              <p className="eyebrow">Comparisons</p>
              <h2>Resource performance workspace</h2>
              <p>Compare indices or specific resources across either realm.</p>
            </div>
            <span className="loading-state">
              <RefreshCw className={isComparisonLoading ? 'spin' : ''} size={15} />
              {isComparisonLoading ? 'Refreshing' : 'Ready'}
            </span>
          </div>

          <div className="comparison-controls">
            <label>
              Line Realm
              <select
                value={selectedComparisonRealm}
                onChange={(event) => setSelectedComparisonRealm(Number(event.target.value) as RealmId)}
              >
                {Object.entries(realms).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={comparisonKind}
                onChange={(event) => setComparisonKind(event.target.value as ComparisonKind)}
              >
                <option value="index">Index</option>
                <option value="resource">Resource</option>
              </select>
            </label>
            {comparisonKind === 'index' ? (
              <label className="wide-control">
                Index
                <select
                  value={selectedComparisonIndex}
                  onChange={(event) => setSelectedComparisonIndex(event.target.value)}
                >
                  {allIndexDefinitions.map((index) => (
                    <option key={index.code} value={index.code}>
                      {index.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="wide-control">
                  Resource
                  <select value={selectedResourceId} onChange={(event) => setSelectedResourceId(event.target.value)}>
                    {resourceOptions.map((resource) => (
                      <option key={resource.resource_id} value={resource.resource_id}>
                        {resource.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quality
                  <select
                    value={selectedQuality}
                    onChange={(event) => setSelectedQuality(Number(event.target.value))}
                  >
                    {qualityLevels.map((quality) => (
                      <option key={quality} value={quality}>
                        Q{quality}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button className="command-button" onClick={addComparisonSelection} type="button">
              <Plus size={16} />
              Add
            </button>
            <label>
              Resource Metric
              <select
                disabled={
                  comparisonSelections.length > 0 &&
                  comparisonSelections.every((selection) => selection.kind === 'index')
                }
                value={compareMetric}
                onChange={(event) => setCompareMetric(event.target.value as CompareMetric)}
              >
                <option value="vwap">VWAP</option>
                <option value="market_value">Market value</option>
              </select>
            </label>
            <label>
              Mode
              <select value={compareMode} onChange={(event) => setCompareMode(event.target.value as CompareMode)}>
                <option value="percent">% change</option>
                <option value="absolute">$ / index value</option>
              </select>
            </label>
            <label>
              Timeframe
              <select
                value={compareTimeframe}
                onChange={(event) => setCompareTimeframe(event.target.value as Timeframe)}
              >
                <option value="7d">7D</option>
                <option value="30d">30D</option>
                <option value="90d">90D</option>
                <option value="all">All</option>
              </select>
            </label>
            <label>
              Height
              <select
                value={comparisonHeight}
                onChange={(event) => setComparisonHeight(Number(event.target.value))}
              >
                <option value={360}>Compact</option>
                <option value={460}>Standard</option>
                <option value={620}>Tall</option>
              </select>
            </label>
          </div>

          <div className="selection-strip" aria-label="Compared series">
            {comparisonSelections.length === 0 ? (
              <span className="empty-selection">Add up to six indices or resource-quality pairs.</span>
            ) : (
              comparisonSelections.map((selection, index) => (
                <button
                  className="selection-chip"
                  key={selection.key}
                  onClick={() => removeComparisonSelection(selection.key)}
                  style={{ ['--chip-color' as string]: comparisonColors[index % comparisonColors.length] }}
                  type="button"
                >
                  {comparisonLabel(selection)}
                  <X size={14} />
                </button>
              ))
            )}
          </div>

          <div className="preset-row">
            <label>
              Preset Name
              <input
                placeholder="My comparison"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
              />
            </label>
            <button
              className="secondary-command"
              disabled={comparisonSelections.length === 0}
              onClick={saveComparisonPreset}
              type="button"
            >
              <Save size={16} />
              Save Preset
            </button>
            {comparisonPresets.length > 0 && (
              <div className="preset-list" aria-label="Saved comparison presets">
                {comparisonPresets.map((preset) => (
                  <span className="preset-item" key={preset.id}>
                    <button onClick={() => applyComparisonState(comparisonStateFromPreset(preset))} type="button">
                      {preset.name}
                    </button>
                    <button
                      aria-label={`Delete ${preset.name}`}
                      className="preset-delete"
                      onClick={() => deleteComparisonPreset(preset.id)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="comparison-chart" style={{ height: comparisonHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={comparisonSeries} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="date"
                  minTickGap={24}
                  tickFormatter={shortDateLabel}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={activeComparisonDomain}
                  tickFormatter={(value) =>
                    compareMode === 'percent' ? `${Number(value).toFixed(0)}%` : formatCompact(Number(value))
                  }
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <Tooltip
                  content={(props) => (
                    <ChartTooltip
                      {...props}
                      context={filteredComparisonContext}
                      valueLabel={compareMode === 'percent' ? 'Change' : 'Value'}
                    />
                  )}
                />
                {renderContextOverlays(
                  filteredComparisonContext,
                  showPhases,
                  showEvents,
                  showContests,
                  'comparison',
                )}
                {showTechnicals &&
                  comparisonTechnicals.map((item) =>
                    renderTechnicalOverlays(
                      item.rows,
                      item.signal,
                      `comparison-technical-${item.key}`,
                      item.color,
                    ),
                  )}
                <Legend />
                {(comparisonSelections.length
                  ? comparisonSelections
                  : [
                      {
                        key: 'power',
                        kind: 'resource' as const,
                        realm: 0 as RealmId,
                        resourceName: 'Power',
                        quality: 2,
                        resourceId: 1,
                      },
                      {
                        key: 'steel',
                        kind: 'resource' as const,
                        realm: 0 as RealmId,
                        resourceName: 'Steel',
                        quality: 0,
                        resourceId: 43,
                      },
                    ]
                ).map((selection, index) => (
                  <Line
                    activeDot={{ r: 5 }}
                    animationBegin={0}
                    animationDuration={700}
                    dataKey={selection.key}
                    dot={false}
                    isAnimationActive
                    key={selection.key}
                    name={comparisonLabel(selection)}
                    stroke={comparisonColors[index % comparisonColors.length]}
                    strokeWidth={3}
                    type="monotone"
                  />
                ))}
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      <footer className="site-footer">
        <span>&copy; {new Date().getFullYear()} SimCompanies Market Indices.</span>
        <span>Unofficial fan-made tool. Not affiliated with SimCompanies or Simcotools.</span>
        <span>Market data sourced from Simcotools.</span>
      </footer>
    </main>
  )
}

export default App
