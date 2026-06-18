import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Car,
  CircleHelp,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Globe2,
  Hammer,
  LineChart as LineChartIcon,
  Menu,
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
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
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
type AppView = 'dashboard' | 'overview' | 'compare' | 'tools' | 'changelog'
type CompareMode = 'absolute' | 'percent'
type CompareMetric = 'vwap' | 'market_value'
type ComparisonKind = 'index' | 'resource'
type Timeframe = '7d' | '14d' | '1m' | '2m' | '3m' | '6m' | '9m' | '1y' | '18m' | '2y' | 'all'
type ResourceQualitySelection = number | 'weighted'

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

type RealmGovernmentOrder = {
  realm_id: RealmId
  order_id: number
  project_name: string
  resource_id: number
  resource_name: string
  quality: number
  days_to_fulfill: number | null
  created_at: string
  due_at: string | null
}

type ChartContext = {
  phases: PhaseRange[]
  events: RealmEvent[]
  contests: RealmContest[]
  governmentOrders: RealmGovernmentOrder[]
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
  winner?: 'Producers' | 'Buyers' | 'Research Industry'
  loser?: 'Producers' | 'Buyers' | 'Buyers & Producers'
  beneficiary?: 'Rival Industries'
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
  volume?: number
}

type ResourceComparisonSelection = {
  key: string
  kind: 'resource'
  realm: RealmId
  resourceId: number
  resourceName: string
  quality: ResourceQualitySelection
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
  type: 'demand' | 'supply' | 'ascending-channel' | 'descending-channel'
  title: string
  detail: string
  tone: 'positive' | 'negative' | 'neutral'
  strength: number
  demandZone?: [number, number]
  supplyZone?: [number, number]
  channel?: {
    direction: 'ascending' | 'descending'
    startDate: string
    upper: [number, number]
    lower: [number, number]
  }
}

type ComparisonState = {
  kind: ComparisonKind
  selectedRealm: RealmId
  selectedIndex: IndexCode
  selectedResourceId: string
  selectedQuality: ResourceQualitySelection
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
  showOrders: boolean
  showTechnicals: boolean
  showVolume: boolean
}

type TourStep = {
  selector: string
  spotlightSelector?: string
  view: AppView
  title: string
  body: string
  task?: 'energy-crude-q3' | 'crude-weighted'
  interactive?: boolean
}

type ChangelogEntry = {
  date: string
  title: string
  items: string[]
}

type SpotlightRect = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

const comparisonStateKey = 'simco-comparison-state'
const comparisonPresetsKey = 'simco-comparison-presets'
const chartFiltersKey = 'simco-chart-filters'
const tourDismissedKey = 'simco-tour-dismissed'

const tourSteps: TourStep[] = [
  {
    selector: '.view-tabs',
    view: 'dashboard',
    title: 'Switch workspaces',
    body: 'Use these tabs to move between the dashboard, the main index view, and deeper comparisons.',
  },
  {
    selector: '.control-row',
    view: 'dashboard',
    title: 'Pick a realm',
    body: 'Magnates and Entrepreneurs are tracked separately, so realm changes affect every chart and signal.',
  },
  {
    selector: '.chart-overlay-controls',
    view: 'dashboard',
    title: 'Layer context',
    body: 'Toggle phases, events, contests, government orders, and technicals on charts whenever you need more context.',
  },
  {
    selector: '.market-summary-grid',
    view: 'dashboard',
    title: 'Market pulse',
    body: 'These cards show each realm total market with quick trend lines and links into the full chart.',
  },
  {
    selector: '.signal-grid',
    view: 'dashboard',
    title: 'Daily signals',
    body: 'The dashboard highlights the selected realm market story and resource to watch. Switch realms above to see the other realm picks.',
  },
  {
    selector: '.technical-panel',
    view: 'dashboard',
    title: 'Technical setup',
    body: 'This highlights the strongest technical resource setup and shows zones or channels directly on the mini chart.',
  },
  {
    selector: '.index-grid',
    view: 'overview',
    title: 'Choose an index',
    body: 'The overview page lets you switch between market-wide, category, quality, and top-resource indices.',
  },
  {
    selector: '.quality-panel',
    view: 'overview',
    title: 'Quality filters',
    body: 'Quality indices let you isolate Q0-Q12 behavior. Q0 can optionally include research resources.',
  },
  {
    selector: '.chart-panel',
    view: 'overview',
    title: 'Read the main chart',
    body: 'This chart shows the selected index over time, with optional phase, event, contest, and technical overlays.',
  },
  {
    selector: '.components-panel',
    view: 'overview',
    title: 'See what drives it',
    body: 'Components show which resources and qualities are contributing most to the selected index.',
  },
  {
    selector: '.comparison-controls',
    view: 'compare',
    title: 'Build a comparison',
    body: 'Compare indices or individual resources, choose realm and quality, then add up to six lines.',
  },
  {
    selector: '.selection-strip',
    view: 'compare',
    title: 'Manage compared lines',
    body: 'Selected lines appear here. Remove items quickly or save the whole setup as a preset.',
  },
  {
    selector: '.comparison-chart',
    view: 'compare',
    title: 'Compare movement',
    body: 'Switch between percent and price views, adjust the timeframe, and resize the comparison chart.',
  },
  {
    selector: '.comparison-panel',
    spotlightSelector: '.comparison-controls, .selection-strip, .comparison-chart',
    view: 'compare',
    title: 'Example: sector context',
    body: 'Try it now: add the Energy index and Q3 Crude Oil to the comparison chart. This shows whether your resource is moving with or against the wider industry. Energy includes resources such as Power, Ethanol, Rocket fuel, Diesel, Petrol, Methane, and Crude Oil.',
    task: 'energy-crude-q3',
    interactive: true,
  },
  {
    selector: '.comparison-panel',
    spotlightSelector: '.comparison-controls, .selection-strip, .comparison-chart',
    view: 'compare',
    title: 'Example: weighted quality',
    body: 'Now remove the broad Energy line and add Crude Oil with the weighted quality option. This combines all qualities into one resource line, weighted by traded activity, so you can see the whole Crude Oil market instead of only Q3.',
    task: 'crude-weighted',
    interactive: true,
  },
  {
    selector: '.tools-panel',
    view: 'tools',
    title: 'Useful tools',
    body: 'This page links to other SimCompanies tools that are useful alongside these market indices.',
  },
  {
    selector: '.changelog-panel',
    view: 'changelog',
    title: 'Track updates',
    body: 'The changelog lists recent feature releases and data changes in one place.',
  },
]

const changelogEntries: ChangelogEntry[] = [
  {
    date: '2026-06-16',
    title: 'Guided tour, tools, and polish',
    items: [
      'Added first-visit guided spotlight tour with replay from the header.',
      'Added useful tools tab with Coopers Tools and Simcotools links.',
      'Added small UI improvements and clearer site footer details.',
      'Made current basket tables scrollable with sticky headers.',
      'Added index tooltips, favicon update, and dashboard signal refinements.',
      'Improved daily data collection scheduling reliability.',
      'Added broad market dashboard handling for transport speed modifiers.',
      'Improved dashboard winner/loser logic for essential resources.',
      'Improved repeat-visit loading speed with current-day market caching and manual refresh.',
      'Calibrated dashboard movement labels so small high-volume moves are not overstated.',
      'Added weighted all-quality comparison for individual resources.',
      'Improved dashboard number precision and highlighted key values in signal text.',
      'Added smoother dashboard refresh progress feedback.',
      'Weighted dashboard event picks toward newer speed modifiers.',
      'Expanded comparison chart timeframes with 14D, 1M, 2M, 3M, 6M, 9M, 1Y, 18M, 2Y, and All views.',
      'Added government orders as dashboard demand catalysts.',
      'Added government order chart overlays and tooltip context.',
      'Added chart brush controls and optional resource volume bars in comparisons.',
      'Stabilized percent-change baselines for market-value comparisons.',
      'Added an interactive comparison example to the guided tour.',
      'Improved sector baskets so every component row is visible in the current basket table.',
      'Tightened technical analysis signals and improved channel label placement.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Dashboard and technical analysis',
    items: [
      'Added clean dashboard with realm market summaries, daily signals, and resources to watch.',
      'Added technical analysis signal picker for strongest resource setups.',
      'Added supply/demand zones and ascending/descending channel overlays.',
      'Added mini charts and Go To buttons across dashboard cards.',
    ],
  },
  {
    date: '2026-06-14',
    title: 'Comparison workspace',
    items: [
      'Added comparison mode for resources and indices across both realms.',
      'Added percent and absolute value comparison views.',
      'Added saved comparison presets and persistent filters.',
      'Improved chart axis scaling for cleaner multi-line comparisons.',
    ],
  },
  {
    date: '2026-06-13',
    title: 'Market context overlays',
    items: [
      'Added phase overlays for boom, normal, and recession periods.',
      'Added event and contest markers with separated tooltips.',
      'Added daily context collection from Simcotools data.',
      'Improved dark mode chart tooltip contrast.',
    ],
  },
  {
    date: '2026-06-12',
    title: 'Index expansion',
    items: [
      'Added SC-10, SC-30, SC-50, total market, equal-weight market, food, construction, research, and quality indices.',
      'Added sector index support for major resource groups.',
      'Added 30-day historical backfill support.',
      'Added daily GitHub Actions data collection workflow.',
    ],
  },
]

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
    method: 'Sector',
  },
  {
    code: 'fashion_only',
    name: 'Fashion',
    description: 'Fashion resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'energy_only',
    name: 'Energy',
    description: 'Energy resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'electronics_only',
    name: 'Electronics',
    description: 'Electronics resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'automotive_only',
    name: 'Automotive',
    description: 'Automotive resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'aerospace_only',
    name: 'Aerospace',
    description: 'Aerospace resources weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'resources_only',
    name: 'Resources',
    description: 'Raw and industrial resource inputs weighted by daily market activity.',
    method: 'Sector',
  },
  {
    code: 'seasonal_only',
    name: 'Seasonal',
    description: 'Seasonal resources weighted by daily market activity.',
    method: 'Sector',
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

function resourceQualityLabel(quality: ResourceQualitySelection) {
  return quality === 'weighted' ? 'Weighted qualities' : `Q${quality}`
}

function resourceQualityKey(quality: ResourceQualitySelection) {
  return quality === 'weighted' ? 'weighted' : quality.toString()
}

function comparisonLabel(selection: ComparisonSelection) {
  const realmName = realms[selection.realm] ?? realms[0]
  return selection.kind === 'index'
    ? `${realmName}: ${selection.indexName}`
    : `${realmName}: ${selection.resourceName} ${resourceQualityLabel(selection.quality)}`
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

type CachedValue<T> = {
  cycleKey: string
  savedAt: string
  value: T
}

const dataCachePrefix = 'simco-data-cache:v6:'

function latestUpdateCycleKey(now = new Date()) {
  // The collector starts at 01:20 UTC, but cache should expire when new data is expected to be visible.
  const update = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 30, 0),
  )

  if (now < update) {
    update.setUTCDate(update.getUTCDate() - 1)
  }

  return update.toISOString().slice(0, 10)
}

function dataCacheKey(key: string) {
  return `${dataCachePrefix}${key}`
}

function readDataCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(dataCacheKey(key))
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedValue<T>
    return cached.cycleKey === latestUpdateCycleKey() ? cached.value : null
  } catch {
    return null
  }
}

function writeDataCache<T>(key: string, value: T) {
  try {
    const cached: CachedValue<T> = {
      cycleKey: latestUpdateCycleKey(),
      savedAt: new Date().toISOString(),
      value,
    }
    localStorage.setItem(dataCacheKey(key), JSON.stringify(cached))
  } catch {
    // Cache writes can fail in private browsing or when storage is full.
  }
}

function clearDataCache() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(dataCachePrefix))
    .forEach((key) => localStorage.removeItem(key))
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
    timeframe: normalizeTimeframe(preset.timeframe),
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

function formatPriceLevel(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Math.abs(value) < 1 ? 3 : 2,
    minimumFractionDigits: Math.abs(value) < 1 ? 3 : 0,
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

function isCollectionWindow(now = new Date()) {
  const fiveMinutes = 5 * 60 * 1000
  const next = nextUpdateDate(now)
  const previous = new Date(next)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return next.getTime() - now.getTime() <= fiveMinutes || now.getTime() - previous.getTime() <= fiveMinutes
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
  if (timeframe === '14d') return 14
  if (timeframe === '1m') return 30
  if (timeframe === '2m') return 60
  if (timeframe === '3m') return 90
  if (timeframe === '6m') return 180
  if (timeframe === '9m') return 270
  if (timeframe === '1y') return 365
  if (timeframe === '18m') return 548
  if (timeframe === '2y') return 730
  return null
}

function normalizeTimeframe(timeframe: unknown): Timeframe {
  if (timeframe === '30d') return '1m'
  if (timeframe === '90d') return '3m'
  if (timeframe === '5m') return '6m'
  return timeframe === '7d' ||
    timeframe === '14d' ||
    timeframe === '1m' ||
    timeframe === '2m' ||
    timeframe === '3m' ||
    timeframe === '6m' ||
    timeframe === '9m' ||
    timeframe === '1y' ||
    timeframe === '18m' ||
    timeframe === '2y' ||
    timeframe === 'all'
    ? timeframe
    : '1m'
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
    .range(0, 4999)

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
    .range(0, 4999)

  if (error || !data?.length) {
    return null
  }

  return data as ComponentRow[]
}

async function loadChartContext(realmIds: RealmId[], startDate: string, endDate: string) {
  const supabase = getSupabase()
  if (!supabase || !realmIds.length || !startDate || !endDate) {
    return { phases: [], events: [], contests: [], governmentOrders: [] }
  }

  const [phases, events, contests, governmentOrders] = await Promise.all([
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
    supabase
      .from('realm_government_orders')
      .select('realm_id,order_id,project_name,resource_id,resource_name,quality,days_to_fulfill,created_at,due_at')
      .in('realm_id', realmIds)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .or(`due_at.gte.${startDate}T00:00:00Z,due_at.is.null`)
      .order('created_at', { ascending: false }),
  ])

  return {
    phases: phases.error ? [] : (phases.data as PhaseRange[]),
    events: events.error ? [] : (events.data as RealmEvent[]),
    contests: contests.error ? [] : (contests.data as RealmContest[]),
    governmentOrders: governmentOrders.error ? [] : (governmentOrders.data as RealmGovernmentOrder[]),
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

function isTransportEvent(event: RealmEvent) {
  return event.resource_name.trim().toLowerCase() === 'transport'
}

function isEssentialInfrastructureEvent(event: RealmEvent) {
  return ['transport', 'power', 'construction units'].includes(event.resource_name.trim().toLowerCase())
}

function speedModifierImpact(event: RealmEvent) {
  if (event.speed_modifier > 0) {
    return {
      winner: 'Buyers' as const,
      loser: 'Producers' as const,
      beneficiary: undefined,
    }
  }

  if (event.speed_modifier < 0 && isEssentialInfrastructureEvent(event)) {
    if (isTransportEvent(event)) {
      return {
        winner: 'Research Industry' as const,
        loser: 'Buyers' as const,
        beneficiary: undefined,
      }
    }

    return {
      winner: undefined,
      loser: 'Buyers' as const,
      beneficiary: 'Rival Industries' as const,
    }
  }

  if (event.speed_modifier < 0) {
    return {
      winner: undefined,
      loser: 'Buyers & Producers' as const,
      beneficiary: 'Rival Industries' as const,
    }
  }

  return {
    winner: undefined,
    loser: undefined,
    beneficiary: undefined,
  }
}

function essentialInfrastructureNote(event: RealmEvent) {
  if (event.speed_modifier >= 0 || !isEssentialInfrastructureEvent(event)) {
    return ''
  }

  if (isTransportEvent(event)) {
    return ' Transport is essential to most users, but research is mostly outside that supply chain, so transport pressure is likely bad for buyers while the research industry becomes the relative winner.'
  }

  return ` ${event.resource_name} is essential to most users, so reduced supply is likely bad for buyers while rival industries become the relative winners.`
}

function transportModifierDetail(event: RealmEvent) {
  const direction = event.speed_modifier < 0
    ? 'transport supply is slower, so most non-research resources may see higher logistics pressure, firmer prices, and weaker traded volume.'
    : 'transport supply is faster, so most non-research resources may see easier logistics, softer price pressure, and stronger traded volume.'

  return `Transport has a ${event.speed_modifier > 0 ? '+' : ''}${event.speed_modifier}% production speed modifier active in ${realms[event.realm_id]}. Because transport is used across most supply chains apart from research, ${direction}${essentialInfrastructureNote(event)}${eventAgeLabel(event)}`
}

function eventDashboardImpact(event: RealmEvent) {
  const broadMarketMultiplier = isTransportEvent(event) ? 2.25 : 1
  return Math.abs(event.speed_modifier) * broadMarketMultiplier * eventFreshnessWeight(event)
}

function eventFreshnessWeight(event: RealmEvent, now = new Date()) {
  const startedAt = new Date(event.since).getTime()
  if (!Number.isFinite(startedAt)) {
    return 0.5
  }

  const ageDays = Math.max(0, (now.getTime() - startedAt) / 86_400_000)

  if (ageDays <= 1) return 1.35
  if (ageDays <= 2) return 1.15
  if (ageDays <= 4) return 0.85
  if (ageDays <= 7) return 0.45
  if (ageDays <= 10) return 0.2
  return 0.08
}

function eventAgeLabel(event: RealmEvent, now = new Date()) {
  const startedAt = new Date(event.since).getTime()
  if (!Number.isFinite(startedAt)) {
    return ''
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - startedAt) / 86_400_000) - 1)
  if (ageDays === 0) return ' This modifier started today, so it is still early in price discovery.'
  if (ageDays === 1) return ' This modifier started yesterday, so it is still relatively fresh.'
  if (ageDays <= 7) return ` This modifier started ${ageDays} days ago, so some repricing may already be underway.`
  return ` This modifier started ${ageDays} days ago, so much of the direct price reaction may already be priced in.`
}

function governmentOrderFreshnessWeight(order: RealmGovernmentOrder, now = new Date()) {
  const createdAt = new Date(order.created_at).getTime()
  if (!Number.isFinite(createdAt)) {
    return 0.2
  }

  const ageDays = Math.max(0, (now.getTime() - createdAt) / 86_400_000)
  if (ageDays <= 1) return 1.25
  if (ageDays <= 3) return 1
  if (ageDays <= 7) return 0.6
  return 0.25
}

function governmentOrderDetail(order: RealmGovernmentOrder) {
  const dueText = order.due_at
    ? ` due by ${formatDisplayDate(toDateOnly(order.due_at))}`
    : ''

  return `${order.project_name} includes a government order for ${order.resource_name} Q${order.quality} in ${realms[order.realm_id]}${dueText}. Government demand can pull liquidity toward the required resource while the order is active.`
}

function movementStoryScore(change: number, marketValue: number, volume: number, medianMarketValue: number, medianVolume: number) {
  const marketWeight = Math.log1p(marketValue / Math.max(medianMarketValue, 1))
  const volumeWeight = Math.log1p(volume / Math.max(medianVolume, 1))
  return Math.abs(change) * (1 + marketWeight + volumeWeight * 0.7)
}

function movementStoryTitle(change: number) {
  const absoluteChange = Math.abs(change)
  const isPositive = change >= 0

  if (absoluteChange >= 0.12) {
    return isPositive ? 'Major Surge' : 'Massive Drop'
  }

  if (absoluteChange >= 0.05) {
    return isPositive ? 'Strong Rise' : 'Sharp Drop'
  }

  if (absoluteChange >= 0.02) {
    return isPositive ? 'Notable Gain' : 'Significant Drop'
  }

  return isPositive ? 'High-Volume Gain' : 'High-Volume Dip'
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return 1
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function stablePercentBaselineIndex(rows: ComparisonPoint[]) {
  const positiveValues = rows.map((row) => row.value).filter((value) => Number.isFinite(value) && value > 0)
  if (!positiveValues.length) {
    return -1
  }

  const typicalValue = median(positiveValues)
  const minimumBaseline = typicalValue * 0.2
  const stableIndex = rows.findIndex((row) => Number.isFinite(row.value) && row.value >= minimumBaseline)

  return stableIndex >= 0
    ? stableIndex
    : rows.findIndex((row) => Number.isFinite(row.value) && row.value > 0)
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
  const rows = await loadPagedMarketDailyRows(realm, 2)
  if (!rows.length) {
    return null
  }

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
  const absoluteChange = Math.abs(top.change)
  const scaleNote = absoluteChange < 0.02
    ? ' It is highlighted because the traded volume and VWAP-volume market value make the move market-relevant.'
    : ''
  const series = rows
    .filter((row) => row.resource_id === top.row.resource_id && row.quality === top.row.quality)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((row) => ({ date: row.date, value: row.vwap }))

  return {
    title: movementStoryTitle(top.change),
    name: `${top.row.resource_name} Q${top.row.quality}`,
    realm,
    detail: `${top.row.resource_name} ${direction} ${(absoluteChange * 100).toFixed(1)}% on the latest snapshot, with ${formatCompact(top.row.volume)} volume traded and ${formatCompact(top.row.market_value)} in VWAP-volume market value.${scaleNote}`,
    tone: top.change >= 0 ? 'positive' : 'negative',
    series,
    winner: top.change >= 0 ? 'Producers' : 'Buyers',
    loser: top.change >= 0 ? 'Buyers' : 'Producers',
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

    if (dates.size > targetDateCount || page.length < pageSize) {
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
      const score = signal.strength * (1 + marketWeight + volumeWeight * 0.65)
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
    .sort((a, b) => eventDashboardImpact(b) - eventDashboardImpact(a))
  const activeContests = context.contests
    .filter((contest) => contest.end_at >= new Date().toISOString())
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
  const activeGovernmentOrders = context.governmentOrders
    .filter((order) => !order.due_at || order.due_at >= new Date().toISOString())
    .sort((a, b) => governmentOrderFreshnessWeight(b) - governmentOrderFreshnessWeight(a))

  const watchSignals = await Promise.all(
    ([0, 1] as RealmId[]).map(async (realmId) => {
      const watchEvent = activeEvents.find((event) => event.realm_id === realmId)
      const watchGovernmentOrder = activeGovernmentOrders.find((order) => order.realm_id === realmId)
      const watchContest = activeContests.find((contest) => contest.realm_id === realmId)
      const watchEventMini = watchEvent && !isTransportEvent(watchEvent)
        ? await loadResourceMiniSeries(watchEvent.realm_id, watchEvent.resource_id)
        : null
      const watchEventIndexRows = watchEvent && isTransportEvent(watchEvent)
        ? (await loadIndexSeries(watchEvent.realm_id, 'total_market')) ?? []
        : []
      const watchContestMini = watchContest?.resource_id
        ? await loadResourceMiniSeries(watchContest.realm_id, watchContest.resource_id)
        : null
      const watchGovernmentOrderMini = watchGovernmentOrder
        ? await loadResourceMiniSeries(
            watchGovernmentOrder.realm_id,
            watchGovernmentOrder.resource_id,
            watchGovernmentOrder.quality,
          )
        : null

      if (watchEvent) {
        const impact = speedModifierImpact(watchEvent)

        if (isTransportEvent(watchEvent)) {
          return {
            title: watchEvent.speed_modifier < 0 ? 'Logistics Pressure' : 'Logistics Boost',
            name: 'Most non-research resources',
            realm: watchEvent.realm_id,
            detail: transportModifierDetail(watchEvent),
            tone: watchEvent.speed_modifier >= 0 ? 'positive' : 'negative',
            series: watchEventIndexRows.slice(-30).map((row) => ({ date: row.date, value: row.value })),
            winner: impact.winner,
            loser: impact.loser,
            beneficiary: impact.beneficiary,
            target: {
              kind: 'index',
              realm: watchEvent.realm_id,
              indexCode: 'total_market',
            },
          } satisfies DashboardSignal
        }

        return {
          title: watchEvent.speed_modifier < 0 ? 'Supply Pressure' : 'Production Boost',
          name: watchEvent.resource_name,
          realm: watchEvent.realm_id,
          detail: `${watchEvent.resource_name} has a ${watchEvent.speed_modifier > 0 ? '+' : ''}${watchEvent.speed_modifier}% production speed modifier active in ${realms[watchEvent.realm_id]}. ${speedModifierDirection(watchEvent.speed_modifier)}${essentialInfrastructureNote(watchEvent)}${eventAgeLabel(watchEvent)}`,
          tone: watchEvent.speed_modifier >= 0 ? 'positive' : 'negative',
          series: watchEventMini?.series ?? [],
          winner: impact.winner,
          loser: impact.loser,
          beneficiary: impact.beneficiary,
          target: {
            kind: 'resource',
            realm: watchEvent.realm_id,
            resourceId: watchEvent.resource_id,
            resourceName: watchEvent.resource_name,
            quality: watchEventMini?.quality ?? 0,
          },
        } satisfies DashboardSignal
      }

      if (watchGovernmentOrder) {
        return {
          title: 'Government Order',
          name: `${watchGovernmentOrder.resource_name} Q${watchGovernmentOrder.quality}`,
          realm: watchGovernmentOrder.realm_id,
          detail: governmentOrderDetail(watchGovernmentOrder),
          tone: 'neutral',
          series: watchGovernmentOrderMini?.series ?? [],
          winner: 'Producers',
          loser: 'Buyers',
          target: {
            kind: 'resource',
            realm: watchGovernmentOrder.realm_id,
            resourceId: watchGovernmentOrder.resource_id,
            resourceName: watchGovernmentOrder.resource_name,
            quality: watchGovernmentOrder.quality,
          },
        } satisfies DashboardSignal
      }

      if (watchContest) {
        return {
          title: 'Contest Watch',
          name: watchContest.resource_name ?? watchContest.name,
          realm: watchContest.realm_id,
          detail: `${watchContest.name} is active in ${realms[watchContest.realm_id]}, affecting ${watchContest.resource_name ?? 'a contest target'}. Contest demand may push attention and liquidity toward the target while it is active.`,
          tone: 'neutral',
          series: watchContestMini?.series ?? [],
          winner: 'Producers',
          loser: 'Buyers',
          target: watchContest.resource_id && watchContest.resource_name
            ? {
                kind: 'resource',
                realm: watchContest.realm_id,
                resourceId: watchContest.resource_id,
                resourceName: watchContest.resource_name,
                quality: watchContestMini?.quality ?? 0,
              }
            : undefined,
        } satisfies DashboardSignal
      }

      return null
    }),
  )

  return {
    markets: marketSeries.filter(Boolean) as DashboardMarket[],
    signals: [...resourceSignals, ...watchSignals].filter(Boolean) as DashboardSignal[],
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

  const query = supabase
    .from('market_daily')
    .select('date,vwap,market_value,volume')
    .eq('realm_id', selection.realm ?? realm)
    .eq('resource_id', selection.resourceId)
    .order('date', { ascending: true })

  if (selection.quality !== 'weighted') {
    query.eq('quality', selection.quality)
  }

  const { data, error } = await query
    .range(0, 4999)

  if (error || !data?.length) {
    return []
  }

  const rows = data as MarketPoint[]
  if (selection.quality !== 'weighted') {
    return rows
  }

  const byDate = new Map<string, { volume: number; market_value: number; weightedVwap: number }>()
  for (const row of rows) {
    const current = byDate.get(row.date) ?? { volume: 0, market_value: 0, weightedVwap: 0 }
    current.volume += row.volume
    current.market_value += row.market_value
    current.weightedVwap += row.vwap * row.volume
    byDate.set(row.date, current)
  }

  return Array.from(byDate.entries()).map(([date, row]) => ({
    date,
    volume: row.volume,
    market_value: row.market_value,
    vwap: row.volume > 0 ? row.weightedVwap / row.volume : 0,
  }))
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
    const timeframeRows = filterByTimeframe(seriesByKey.get(selection.key) ?? [], timeframe)
    const baselineIndex = mode === 'percent' ? stablePercentBaselineIndex(timeframeRows) : 0
    const rows = baselineIndex > 0 ? timeframeRows.slice(baselineIndex) : timeframeRows
    const baseline = rows.find((row) => row.value > 0)?.value ?? 0

    for (const row of rows) {
      const label = new Date(`${row.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const datum = dateMap.get(row.date) ?? { date: row.date, label }
      const rawValue = Number(row.value)
      datum[selection.key] = mode === 'percent' && baseline > 0 ? (rawValue / baseline - 1) * 100 : rawValue
      if (typeof row.volume === 'number' && Number.isFinite(row.volume)) {
        datum[`${selection.key}__volume`] = row.volume
      }
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

function valueDomain(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value))
  if (!finiteValues.length) {
    return ['auto', 'auto'] as const
  }

  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
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

function regressionFit(values: number[], slope: number, intercept: number) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const total = values.reduce((sum, value) => sum + (value - mean) ** 2, 0)
  if (total === 0) return 0

  const error = values.reduce((sum, value, index) => {
    const fitted = intercept + slope * index
    return sum + (value - fitted) ** 2
  }, 0)

  return Math.max(0, 1 - error / total)
}

function channelWindow(rows: TechnicalPoint[]) {
  if (rows.length < 12) return rows

  const values = rows.map((row) => row.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range <= 0) return rows

  let breakIndex = -1
  let largestMove = 0
  for (let index = 1; index < values.length; index += 1) {
    const move = Math.abs(values[index] - values[index - 1])
    if (move > largestMove) {
      largestMove = move
      breakIndex = index
    }
  }

  const recentRows = breakIndex >= 0 ? rows.slice(breakIndex) : rows
  if (largestMove >= range * 0.28 && recentRows.length >= 8) {
    return recentRows.slice(-18)
  }

  return rows.slice(-18)
}

function analyzeTechnicals(inputRows: TechnicalPoint[]): TechnicalSignal | null {
  const rows = inputRows.filter((row) => Number.isFinite(row.value)).slice(-45)
  if (rows.length < 8) {
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

  const scale = Math.max(Math.abs(latest), range, 1)
  const volatility = range / scale
  if (volatility < 0.006) {
    return null
  }

  const zoneSize = Math.max(range * 0.14, scale * 0.012)
  const demandZone: [number, number] = [min, min + zoneSize]
  const supplyZone: [number, number] = [max - zoneSize, max]
  const channelRows = channelWindow(rows)
  const channelValues = channelRows.map((row) => row.value)
  const channelStartIndex = rows.length - channelRows.length
  const { slope, intercept } = linearRegression(channelValues)
  const r2 = regressionFit(channelValues, slope, intercept)
  const fitted = channelValues.map((_value, index) => intercept + slope * index)
  const residuals = channelValues.map((value, index) => value - fitted[index])
  const upperOffset = Math.max(...residuals)
  const lowerOffset = Math.min(...residuals)
  const channelRange = upperOffset - lowerOffset
  const channelLocalRange = Math.max(...channelValues) - Math.min(...channelValues)
  const slopeThreshold = Math.max(channelLocalRange, range * 0.35) / Math.max(channelRows.length * 2.1, 1)
  const channelIsClean = r2 >= 0.45 && channelRange <= Math.max(channelLocalRange * 0.9, range * 0.22)
  const channel =
    channelRange > 0
      ? {
          direction: slope >= 0 ? 'ascending' as const : 'descending' as const,
          startDate: rows[channelStartIndex].date,
          upper: [intercept + upperOffset, intercept + slope * (channelRows.length - 1) + upperOffset] as [number, number],
          lower: [intercept + lowerOffset, intercept + slope * (channelRows.length - 1) + lowerOffset] as [number, number],
        }
      : undefined

  const demandCenter = (demandZone[0] + demandZone[1]) / 2
  const supplyCenter = (supplyZone[0] + supplyZone[1]) / 2
  const nearDemand = latest <= demandZone[1] + zoneSize * 1.25
  const nearSupply = latest >= supplyZone[0] - zoneSize * 1.25
  const demandProximity = Math.max(0, 1 - Math.abs(latest - demandCenter) / Math.max(zoneSize * 2.25, 0.000001))
  const supplyProximity = Math.max(0, 1 - Math.abs(latest - supplyCenter) / Math.max(zoneSize * 2.25, 0.000001))
  const demandTouches = values.filter((value) => value >= demandZone[0] - zoneSize * 0.35 && value <= demandZone[1] + zoneSize * 0.35).length
  const supplyTouches = values.filter((value) => value >= supplyZone[0] - zoneSize * 0.35 && value <= supplyZone[1] + zoneSize * 0.35).length
  const hasDemandZone = demandTouches >= 2
  const hasSupplyZone = supplyTouches >= 2
  const channelKind =
    channelIsClean && Math.abs(slope) >= slopeThreshold
      ? slope > 0
        ? 'ascending-channel'
        : 'descending-channel'
      : null
  const channelStrength = channelKind ? Math.min(Math.abs(slope) / Math.max(slopeThreshold, 0.000001), 3) / 3 : 0
  const channelLabel = channelKind === 'ascending-channel' ? 'Ascending Channel' : 'Descending Channel'

  if (nearDemand && demandProximity >= 0.62 && demandTouches >= 2) {
    return {
      type: 'demand',
      title: 'Testing Demand',
      detail: `Price is near the recent demand zone around ${formatPriceLevel(demandZone[0])}-${formatPriceLevel(demandZone[1])}.`,
      tone: 'positive',
      strength: 1 + demandProximity + channelStrength * 0.35,
      demandZone,
      supplyZone: hasSupplyZone ? supplyZone : undefined,
      channel: channelKind ? channel : undefined,
    }
  }

  if (nearSupply && supplyProximity >= 0.62 && supplyTouches >= 2) {
    return {
      type: 'supply',
      title: 'Testing Supply',
      detail: `Price is near the recent supply zone around ${formatPriceLevel(supplyZone[0])}-${formatPriceLevel(supplyZone[1])}.`,
      tone: 'negative',
      strength: 1 + supplyProximity + channelStrength * 0.35,
      demandZone: hasDemandZone ? demandZone : undefined,
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
      demandZone: hasDemandZone ? demandZone : undefined,
      supplyZone: hasSupplyZone ? supplyZone : undefined,
      channel,
    }
  }

  return null
}

function analyzeEmergingTechnicals(inputRows: TechnicalPoint[]): TechnicalSignal | null {
  const rows = inputRows.filter((row) => Number.isFinite(row.value)).slice(-4)
  if (rows.length < 2) {
    return null
  }

  const first = rows[0].value
  const latest = rows.at(-1)!.value
  const change = first ? latest / first - 1 : 0
  if (Math.abs(change) < 0.04) {
    return null
  }

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
    governmentOrders: context.governmentOrders.filter((order) => {
      if (hasIndexByRealm.has(order.realm_id)) return true
      return resourceIdsByRealm.get(order.realm_id)?.has(order.resource_id) ?? false
    }),
  }
}

function recentContests(contests: RealmContest[]) {
  return [...contests]
    .sort((a, b) => b.start_at.localeCompare(a.start_at))
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
  const governmentOrders = context.governmentOrders.filter(
    (order) => order.created_at <= at && (!order.due_at || order.due_at >= at),
  )

  return { events, contests, governmentOrders }
}

function hasMultipleRealms(context: ChartContext) {
  const realmIds = new Set([
    ...context.phases.map((phase) => phase.realm_id),
    ...context.events.map((event) => event.realm_id),
    ...context.contests.map((contest) => contest.realm_id),
    ...context.governmentOrders.map((order) => order.realm_id),
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

function orderLineColor(order: RealmGovernmentOrder) {
  return order.realm_id === 1 ? 'var(--warning)' : 'var(--accent)'
}

function recentGovernmentOrders(orders: RealmGovernmentOrder[]) {
  return [...orders]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4)
}

function orderChartLabel(order: RealmGovernmentOrder, multiRealm: boolean) {
  const realmPrefix = multiRealm ? `${realms[order.realm_id]}: ` : ''
  const resourceLabel = `${order.resource_name} Q${order.quality}`
  return `${realmPrefix}Order: ${resourceLabel}`
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
  showOrders: boolean,
  keyPrefix: string,
  yAxisId?: string,
) {
  const contests = recentContests(context.contests)
  const orders = recentGovernmentOrders(context.governmentOrders)
  const eventGroups = groupedEvents(context.events)
  const multiRealm = hasMultipleRealms(context)
  const axisProps = yAxisId ? { yAxisId } : {}

  return (
    <>
      {showPhases &&
        context.phases
          .filter((phase) => phase.phase !== 'normal')
          .map((phase, index) => (
            <ReferenceArea
              {...axisProps}
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
              {...axisProps}
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
              {...axisProps}
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
              {...axisProps}
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
              {...axisProps}
              ifOverflow="visible"
              key={`${keyPrefix}-contest-end-${contest.realm_id}-${contest.contest_id}`}
              stroke={contestLineColor(contest)}
              strokeDasharray="4 4"
              x={toDateOnly(contest.end_at)}
            />,
          ]
        ))}
      {showOrders &&
        orders.flatMap((order, index) => {
          const color = orderLineColor(order)
          const label = orderChartLabel(order, multiRealm)

          return [
            <ReferenceLine
              {...axisProps}
              ifOverflow="visible"
              key={`${keyPrefix}-order-start-${order.realm_id}-${order.order_id}-${order.resource_id}-${order.quality}`}
              label={{
                value: label,
                fill: color,
                fontSize: 11,
                dx: -142,
                dy: bottomOverlayDy((index + contests.length) % 4),
                position: 'insideBottomLeft',
              }}
              stroke={color}
              strokeDasharray="2 5"
              x={toDateOnly(order.created_at)}
            />,
            order.due_at ? (
              <ReferenceLine
                {...axisProps}
                ifOverflow="visible"
                key={`${keyPrefix}-order-due-${order.realm_id}-${order.order_id}-${order.resource_id}-${order.quality}`}
                stroke={color}
                strokeDasharray="2 5"
                x={toDateOnly(order.due_at)}
              />
            ) : null,
          ]
        })}
    </>
  )
}

function renderTechnicalOverlays(
  rows: TechnicalPoint[],
  signal: TechnicalSignal | null,
  keyPrefix: string,
  color = 'var(--accent)',
  yAxisId?: string,
) {
  if (!signal || rows.length < 2) {
    return null
  }

  const startDate = rows[0].date
  const endDate = rows.at(-1)!.date
  const latest = rows.at(-1)?.value ?? 0
  const axisProps = yAxisId ? { yAxisId } : {}
  const channelLabelOnLower =
    signal.channel &&
    Math.abs(latest - signal.channel.upper[1]) < Math.abs(latest - signal.channel.lower[1])

  return (
    <>
      {signal.demandZone && (
        <ReferenceArea
          {...axisProps}
          fill="var(--technical-demand)"
          fillOpacity={1}
          ifOverflow="visible"
          key={`${keyPrefix}-demand-zone`}
          label={{
            value: 'Demand zone',
            fill: 'var(--technical-demand-line)',
            fontSize: 11,
            dy: 22,
            position: 'insideLeft',
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
          {...axisProps}
          fill="var(--technical-supply)"
          fillOpacity={1}
          ifOverflow="visible"
          key={`${keyPrefix}-supply-zone`}
          label={{
            value: 'Supply zone',
            fill: 'var(--technical-supply-line)',
            fontSize: 11,
            dy: -22,
            position: 'insideLeft',
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
            {...axisProps}
            ifOverflow="visible"
            key={`${keyPrefix}-channel-upper`}
            label={
              channelLabelOnLower
                ? undefined
                : {
                    value: signal.channel.direction === 'ascending' ? 'Ascending channel' : 'Descending channel',
                    fill: color,
                    fontSize: 11,
                    dx: -72,
                    dy: 12,
                    position: 'insideRight',
                  }
            }
            segment={[
              { x: signal.channel.startDate, y: signal.channel.upper[0] },
              { x: endDate, y: signal.channel.upper[1] },
            ]}
            stroke={color}
            strokeDasharray="6 5"
          />
          <ReferenceLine
            {...axisProps}
            ifOverflow="visible"
            key={`${keyPrefix}-channel-lower`}
            label={
              channelLabelOnLower
                ? {
                    value: signal.channel.direction === 'ascending' ? 'Ascending channel' : 'Descending channel',
                    fill: color,
                    fontSize: 11,
                    dx: -72,
                    dy: -10,
                    position: 'insideRight',
                  }
                : undefined
            }
            segment={[
              { x: signal.channel.startDate, y: signal.channel.lower[0] },
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
  const { events, contests, governmentOrders } = contextItemsForDate(context, dateLabel)
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
  const ordersByRealm = ([0, 1] as RealmId[])
    .map((realmId) => ({
      realmId,
      orders: governmentOrders.filter((order) => order.realm_id === realmId),
    }))
    .filter((group) => group.orders.length > 0)

  return (
    <div className="chart-tooltip">
      <strong>{formatDisplayDate(dateLabel)}</strong>
      {payload.map((item) => (
        <span key={`${item.name}-${item.value}`}>
          <i style={{ background: item.color }} />
          {String(item.name ?? valueLabel)}:{' '}
          {String(item.name ?? '').toLowerCase().includes('volume')
            ? formatCompact(Number(item.value))
            : formatNumber(Number(item.value))}
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
      {ordersByRealm.length > 0 && (
        <div className="tooltip-context">
          <b>Government orders</b>
          {ordersByRealm.map((group) => (
            <div className="tooltip-realm-group" key={`orders-${group.realmId}`}>
              <em>{realms[group.realmId]}</em>
              {group.orders.slice(0, 4).map((order) => (
                <small key={`${order.order_id}-${order.resource_id}-${order.quality}`}>
                  {order.project_name}: {order.resource_name} Q{order.quality}
                </small>
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
                      { x: technical.channel.startDate, y: technical.channel.upper[0] },
                      { x: data.at(-1)!.date, y: technical.channel.upper[1] },
                    ]}
                    stroke="currentColor"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    segment={[
                      { x: technical.channel.startDate, y: technical.channel.lower[0] },
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

function DashboardDetail({
  text,
  tone = 'neutral',
}: {
  text: string
  tone?: DashboardSignal['tone']
}) {
  const pattern =
    /(\b(?:Magnates|Entrepreneurs|Q\d+|VWAP-volume|market value|volume traded|supply zone|demand zone)\b|[+-]?\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?(?:B|M|K)\b|\b\d+(?:\.\d+)?-\d+(?:\.\d+)?\b)/g
  const tokenPattern =
    /^(\b(?:Magnates|Entrepreneurs|Q\d+|VWAP-volume|market value|volume traded|supply zone|demand zone)\b|[+-]?\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?(?:B|M|K)\b|\b\d+(?:\.\d+)?-\d+(?:\.\d+)?\b)$/
  const parts = text.split(pattern).filter(Boolean)

  return (
    <>
      {parts.map((part, index) => {
        const percentValue = part.endsWith('%') ? Number(part.replace('%', '')) : null
        const isSignedPercent = part.startsWith('+') || part.startsWith('-')
        const toneClass =
          percentValue === null || Number.isNaN(percentValue)
            ? ''
            : isSignedPercent && percentValue < 0
              ? ' negative'
              : isSignedPercent && percentValue > 0
                ? ' positive'
                : tone === 'negative'
                  ? ' negative'
                  : tone === 'positive'
                    ? ' positive'
                : ''

        return tokenPattern.test(part) ? (
          <span className={`dashboard-token${toneClass}`} key={`${part}-${index}`}>
            {part}
          </span>
        ) : (
          part
        )
      })}
    </>
  )
}

function RefreshProgress({ active }: { active: boolean }) {
  const [progress, setProgress] = useState(active ? 12 : 100)

  useEffect(() => {
    if (!active) {
      setProgress(100)
      return
    }

    setProgress(12)
    const interval = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 88) {
          return current + Math.random() * 1.2
        }

        return Math.min(92, current + Math.max(1.5, (94 - current) * 0.08))
      })
    }, 260)

    return () => window.clearInterval(interval)
  }, [active])

  if (!active) {
    return (
      <div className="refresh-progress idle">
        <span>Ready</span>
      </div>
    )
  }

  return (
    <div className="refresh-progress" aria-label="Dashboard refresh progress">
      <div className="refresh-progress-label">
        <strong>{Math.min(99, Math.round(progress))}%</strong>
        <span>
          <RefreshCw className="spin" size={15} />
          Refreshing
        </span>
      </div>
      <div className="refresh-track">
        <div className="refresh-fill" style={{ width: `${Math.min(99, progress)}%` }} />
      </div>
    </div>
  )
}

function combinedSpotlightRect(selector: string): SpotlightRect | null {
  const targets = Array.from(document.querySelectorAll(selector))
  if (!targets.length) {
    return null
  }

  const rects = targets
    .map((target) => target.getBoundingClientRect())
    .filter((targetRect) => targetRect.width > 0 && targetRect.height > 0)

  if (!rects.length) {
    return null
  }

  const left = Math.min(...rects.map((targetRect) => targetRect.left))
  const top = Math.min(...rects.map((targetRect) => targetRect.top))
  const right = Math.max(...rects.map((targetRect) => targetRect.right))
  const bottom = Math.max(...rects.map((targetRect) => targetRect.bottom))

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  }
}

function GuidedTour({
  steps,
  stepIndex,
  canContinue,
  onBack,
  onDismiss,
  onNext,
}: {
  steps: TourStep[]
  stepIndex: number
  canContinue: boolean
  onBack: () => void
  onDismiss: () => void
  onNext: () => void
}) {
  const step = steps[stepIndex]
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useEffect(() => {
    const spotlightSelector = step.spotlightSelector ?? step.selector

    function updateRect() {
      setRect(combinedSpotlightRect(spotlightSelector))
    }

    const target = document.querySelector(step.selector)
    target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    window.setTimeout(updateRect, 220)
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [step.selector, step.spotlightSelector])

  const padding = 10
  const spotlightStyle = rect
    ? {
        height: rect.height + padding * 2,
        left: rect.left - padding,
        top: rect.top - padding,
        width: rect.width + padding * 2,
      }
    : undefined
  const cardWidth = Math.min(340, window.innerWidth - 32)
  const sidePlacement = step.interactive && rect && rect.right + 18 + cardWidth < window.innerWidth
  const cardStyle = rect
    ? {
        left: sidePlacement
          ? rect.right + 18
          : Math.min(Math.max(rect.left, 16), window.innerWidth - cardWidth - 16),
        top: sidePlacement
          ? Math.min(Math.max(rect.top, 16), window.innerHeight - 330)
          : rect.bottom + 18 < window.innerHeight - 210
            ? rect.bottom + 18
            : Math.max(16, rect.top - 218),
      }
    : undefined
  const cardPlacement = sidePlacement
    ? 'side'
    : rect && rect.bottom + 18 < window.innerHeight - 210
      ? 'below'
      : 'above'

  return (
    <div
      className={`guided-tour${step.interactive ? ' interactive' : ''}`}
      role="dialog"
      aria-modal={!step.interactive}
      aria-labelledby="tour-title"
    >
      {!step.interactive && <div className="tour-scrim" />}
      <div className="tour-spotlight" style={spotlightStyle} />
      <section className={`tour-card ${cardPlacement}`} style={cardStyle}>
        <span className="tour-count">
          {stepIndex + 1} of {steps.length}
        </span>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        {step.interactive && !canContinue && (
          <p className="tour-hint">Complete the example to continue, or use Back / Skip.</p>
        )}
        <div className="tour-actions">
          <button className="ghost-button" onClick={onDismiss} type="button">
            Skip
          </button>
          <div>
            <button className="ghost-button" disabled={stepIndex === 0} onClick={onBack} type="button">
              Back
            </button>
            <button className="command-button" disabled={!canContinue} onClick={onNext} type="button">
              {stepIndex === steps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </section>
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
  const [selectedQuality, setSelectedQuality] = useState<ResourceQualitySelection>(
    storedComparisonState.selectedQuality ?? 'weighted',
  )
  const [comparisonSelections, setComparisonSelections] = useState<ComparisonSelection[]>(
    storedComparisonState.selections ?? [],
  )
  const [comparisonSeries, setComparisonSeries] = useState<ComparisonDatum[]>(demoComparisonData)
  const [compareMode, setCompareMode] = useState<CompareMode>(storedComparisonState.mode ?? 'percent')
  const [compareMetric, setCompareMetric] = useState<CompareMetric>(storedComparisonState.metric ?? 'vwap')
  const [compareTimeframe, setCompareTimeframe] = useState<Timeframe>(
    normalizeTimeframe(storedComparisonState.timeframe ?? '1m'),
  )
  const [comparisonHeight, setComparisonHeight] = useState(storedComparisonState.height ?? 460)
  const [presetName, setPresetName] = useState('')
  const [comparisonPresets, setComparisonPresets] = useState<ComparisonPreset[]>(() =>
    readJsonStorage<ComparisonPreset[]>(comparisonPresetsKey, []),
  )
  const [isComparisonLoading, setIsComparisonLoading] = useState(false)
  const [showPhases, setShowPhases] = useState(Boolean(storedChartFilters.showPhases))
  const [showEvents, setShowEvents] = useState(Boolean(storedChartFilters.showEvents))
  const [showContests, setShowContests] = useState(Boolean(storedChartFilters.showContests))
  const [showOrders, setShowOrders] = useState(Boolean(storedChartFilters.showOrders))
  const [showTechnicals, setShowTechnicals] = useState(Boolean(storedChartFilters.showTechnicals))
  const [showVolume, setShowVolume] = useState(Boolean(storedChartFilters.showVolume))
  const [overviewContext, setOverviewContext] = useState<ChartContext>({
    phases: [],
    events: [],
    contests: [],
    governmentOrders: [],
  })
  const [comparisonContext, setComparisonContext] = useState<ChartContext>({
    phases: [],
    events: [],
    contests: [],
    governmentOrders: [],
  })
  const [nextUpdate, setNextUpdate] = useState(() => nextUpdateDate())
  const [updateCountdown, setUpdateCountdown] = useState(() => formatCountdown(nextUpdateDate()))
  const [showCollectionNotice, setShowCollectionNotice] = useState(() => isCollectionWindow())
  const [showTour, setShowTour] = useState(() => localStorage.getItem(tourDismissedKey) !== 'true')
  const [tourStepIndex, setTourStepIndex] = useState(0)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [dataRefreshToken, setDataRefreshToken] = useState(0)

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
  const volumeComparisonSelections = useMemo(
    () =>
      (comparisonSelections.length
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
          ]).filter((selection) => selection.kind === 'resource'),
    [comparisonSelections, comparisonSeries],
  )
  const canShowComparisonVolume = volumeComparisonSelections.some((selection) =>
    comparisonSeries.some((row) => typeof row[`${selection.key}__volume`] === 'number'),
  )
  const overviewDateWindow = useMemo(() => chartDateWindow(visibleSeries), [visibleSeries])
  const comparisonDateWindow = useMemo(() => chartDateWindow(comparisonSeries), [comparisonSeries])
  const filteredComparisonContext = useMemo(
    () => contextForSelections(comparisonContext, comparisonSelections),
    [comparisonContext, comparisonSelections],
  )
  const activeDashboardSignals = useMemo(
    () => dashboardSignals.filter((signal) => signal.realm === realm),
    [dashboardSignals, realm],
  )
  const overviewTechnicalRows = useMemo(() => technicalRowsFromSeries(visibleSeries), [visibleSeries])
  const overviewTechnicalSignal = useMemo(
    () => analyzeTechnicals(overviewTechnicalRows),
    [overviewTechnicalRows],
  )
  const comparisonTechnicals = useMemo(
    () =>
      activeComparisonKeys.length >= 2
        ? []
        : activeComparisonKeys
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
      setShowCollectionNotice(isCollectionWindow())
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
      const cacheKey = 'dashboard'
      const cached = readDataCache<Awaited<ReturnType<typeof loadDashboard>>>(cacheKey)
      if (cached) {
        setDashboardMarkets(cached.markets)
        setDashboardSignals(cached.signals)
        setDashboardTechnicals(cached.technicals)
        return
      }

      setIsDashboardLoading(true)
      const data = await loadDashboard()
      if (!isCurrent) return
      setDashboardMarkets(data.markets)
      setDashboardSignals(data.signals)
      setDashboardTechnicals(data.technicals)
      writeDataCache(cacheKey, data)
      setIsDashboardLoading(false)
    }

    refreshDashboard()

    return () => {
      isCurrent = false
    }
  }, [dataRefreshToken])

  useEffect(() => {
    const filters: ChartFilters = {
      showPhases,
      showEvents,
      showContests,
      showOrders,
      showTechnicals,
      showVolume,
    }
    localStorage.setItem(chartFiltersKey, JSON.stringify(filters))
  }, [showPhases, showEvents, showContests, showOrders, showTechnicals, showVolume])

  useEffect(() => {
    let isCurrent = true

    async function refreshOverviewContext() {
      const cacheKey = `overview-context:${realm}:${overviewDateWindow.startDate}:${overviewDateWindow.endDate}`
      const cached = readDataCache<ChartContext>(cacheKey)
      if (cached) {
        setOverviewContext(cached)
        return
      }

      const context = await loadChartContext([realm], overviewDateWindow.startDate, overviewDateWindow.endDate)
      if (isCurrent) {
        setOverviewContext(context)
        writeDataCache(cacheKey, context)
      }
    }

    refreshOverviewContext()

    return () => {
      isCurrent = false
    }
  }, [realm, overviewDateWindow.startDate, overviewDateWindow.endDate, dataRefreshToken])

  useEffect(() => {
    let isCurrent = true

    async function refreshData() {
      const cacheKey = `overview-data:${realm}:${selectedIndex}`
      const cached = readDataCache<{
        series: IndexPoint[]
        components: ComponentRow[]
        usingDemoData: boolean
      }>(cacheKey)
      if (cached) {
        setSeries(cached.series)
        setComponents(cached.components)
        setUsingDemoData(cached.usingDemoData)
        return
      }

      setIsLoading(true)
      const loadedSeries = await loadIndexSeries(realm, selectedIndex)

      if (!isCurrent) return

      if (!loadedSeries) {
        const fallbackSeries = demoSeries.map((point) => ({
          ...point,
          realm_id: realm,
          index_code: selectedIndex,
          value:
            point.value +
            (realm === 1 ? 34 : 0) +
            (selectedIndex === 'sc_10' ? 110 : selectedIndex === 'equal_weight_market' ? -42 : 0),
        }))
        setSeries(fallbackSeries)
        setComponents(demoComponents)
        setUsingDemoData(true)
        writeDataCache(cacheKey, {
          series: fallbackSeries,
          components: demoComponents,
          usingDemoData: true,
        })
        setIsLoading(false)
        return
      }

      setSeries(loadedSeries)
      const latestDate = loadedSeries.at(-1)?.date
      const loadedComponents = latestDate ? await loadIndexComponents(realm, selectedIndex, latestDate) : null

      if (!isCurrent) return

      setComponents(loadedComponents ?? [])
      setUsingDemoData(false)
      writeDataCache(cacheKey, {
        series: loadedSeries,
        components: loadedComponents ?? [],
        usingDemoData: false,
      })
      setIsLoading(false)
    }

    refreshData()

    return () => {
      isCurrent = false
    }
  }, [realm, selectedIndex, dataRefreshToken])

  useEffect(() => {
    if (selectedIndex === 'quality_0' || selectedIndex === 'quality_0_with_research') {
      setSelectedIndex(qualityIndexCode(0, q0IncludesResearch))
    }
  }, [q0IncludesResearch, selectedIndex])

  useEffect(() => {
    if (comparisonKind === 'resource' && storedComparisonState.selectedQuality === undefined) {
      setSelectedQuality('weighted')
    }
  }, [comparisonKind, storedComparisonState.selectedQuality])

  useEffect(() => {
    let isCurrent = true

    async function refreshResources() {
      const cacheKey = `resources:${selectedComparisonRealm}`
      const cached = readDataCache<ResourceOption[]>(cacheKey)
      if (cached) {
        setResourceOptions(cached)
        setSelectedResourceId((current) => current || cached[0]?.resource_id.toString() || '')
        return
      }

      const options = await loadResourceOptions(selectedComparisonRealm)
      if (!isCurrent) return
      setResourceOptions(options)
      setSelectedResourceId((current) => current || options[0]?.resource_id.toString() || '')
      writeDataCache(cacheKey, options)
    }

    refreshResources()

    return () => {
      isCurrent = false
    }
  }, [selectedComparisonRealm, dataRefreshToken])

  useEffect(() => {
    let isCurrent = true

    async function refreshComparison() {
      if (comparisonSelections.length === 0) {
        setComparisonSeries(demoComparisonData)
        return
      }

      const cacheKey = `comparison:${compareMetric}:${compareMode}:${compareTimeframe}:${comparisonSelections
        .map((selection) => selection.key)
        .join('|')}`
      const cached = readDataCache<ComparisonDatum[]>(cacheKey)
      if (cached) {
        setComparisonSeries(cached)
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
                volume: row.volume,
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
      writeDataCache(cacheKey, rows)
      setIsComparisonLoading(false)
    }

    refreshComparison()

    return () => {
      isCurrent = false
    }
  }, [realm, comparisonSelections, compareMetric, compareMode, compareTimeframe, dataRefreshToken])

  useEffect(() => {
    let isCurrent = true

    async function refreshComparisonContext() {
      const realmIds =
        comparisonSelections.length > 0
          ? Array.from(new Set(comparisonSelections.map((selection) => selection.realm)))
          : [selectedComparisonRealm]
      const cacheKey = `comparison-context:${realmIds.join(',')}:${comparisonDateWindow.startDate}:${comparisonDateWindow.endDate}`
      const cached = readDataCache<ChartContext>(cacheKey)
      if (cached) {
        setComparisonContext(cached)
        return
      }

      const context = await loadChartContext(
        realmIds,
        comparisonDateWindow.startDate,
        comparisonDateWindow.endDate,
      )
      if (isCurrent) {
        setComparisonContext(context)
        writeDataCache(cacheKey, context)
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
    dataRefreshToken,
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

    const key = `r${selectedComparisonRealm}r${resourceId}q${resourceQualityKey(selectedQuality)}`
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
    setCompareTimeframe(normalizeTimeframe(state.timeframe))
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

  function dismissTour() {
    localStorage.setItem(tourDismissedKey, 'true')
    setShowTour(false)
  }

  function replayTour() {
    setActiveView('dashboard')
    setTourStepIndex(0)
    setShowTour(true)
  }

  function crudeOilOption() {
    return resourceOptions.find((resource) => resource.name.trim().toLowerCase() === 'crude oil')
  }

  function tourTaskComplete(task: TourStep['task']) {
    if (!task) return true
    const crudeOil = crudeOilOption()
    if (!crudeOil) return false

    const hasEnergy = comparisonSelections.some(
      (selection) => selection.kind === 'index' && selection.realm === 0 && selection.indexCode === 'energy_only',
    )
    const hasCrudeQ3 = comparisonSelections.some(
      (selection) =>
        selection.kind === 'resource' &&
        selection.realm === 0 &&
        selection.resourceId === crudeOil.resource_id &&
        selection.quality === 3,
    )
    const hasWeightedCrude = comparisonSelections.some(
      (selection) =>
        selection.kind === 'resource' &&
        selection.realm === 0 &&
        selection.resourceId === crudeOil.resource_id &&
        selection.quality === 'weighted',
    )

    if (task === 'energy-crude-q3') {
      return hasEnergy && hasCrudeQ3
    }

    return hasWeightedCrude && !hasEnergy
  }

  useEffect(() => {
    if (!showTour) return
    const step = tourSteps[tourStepIndex]
    setActiveView(step.view)
  }, [showTour, tourStepIndex])

  function nextTourStep() {
    if (tourStepIndex >= tourSteps.length - 1) {
      dismissTour()
      return
    }
    const nextIndex = tourStepIndex + 1
    setActiveView(tourSteps[nextIndex].view)
    setTourStepIndex(nextIndex)
  }

  function previousTourStep() {
    const previousIndex = Math.max(0, tourStepIndex - 1)
    setActiveView(tourSteps[previousIndex].view)
    setTourStepIndex(previousIndex)
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

  function selectView(view: AppView) {
    setActiveView(view)
    setIsMobileNavOpen(false)
  }

  function refreshMarketData() {
    clearDataCache()
    setDataRefreshToken((current) => current + 1)
  }

  const isAnyMarketDataLoading = isLoading || isDashboardLoading || isComparisonLoading
  const chartOverlayControls = (
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
        className={showOrders ? 'active' : ''}
        onClick={() => setShowOrders((current) => !current)}
        type="button"
      >
        Show Orders
      </button>
      <button
        className={showTechnicals ? 'active' : ''}
        onClick={() => setShowTechnicals((current) => !current)}
        type="button"
      >
        Show Technicals
      </button>
      <button
        className={showVolume ? 'active' : ''}
        onClick={() => setShowVolume((current) => !current)}
        type="button"
      >
        Show Volume
      </button>
    </section>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Realm-level resource market performance</p>
          <h1>SimCompanies Market Indices</h1>
        </div>
        <div className="topbar-actions">
          <button
            aria-label="Show guided tour"
            className="icon-button"
            onClick={replayTour}
            title="Replay guided tour"
            type="button"
          >
            <CircleHelp size={18} />
          </button>
          <button
            aria-label="Refresh market data"
            className="icon-button"
            onClick={refreshMarketData}
            title="Refresh market data"
            type="button"
          >
            <RefreshCw className={isAnyMarketDataLoading ? 'spin' : ''} size={18} />
          </button>
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
              className={`${Number(id) === realm ? 'active' : ''} realm-${id}`}
              key={id}
              onClick={() => setRealm(Number(id) as RealmId)}
              type="button"
            >
              <Globe2 size={16} />
              {name}
            </button>
          ))}
        </div>
        <div className="update-stack">
          <div className="update-note">
            <CalendarClock size={16} />
            <div>
              <span>Next update in</span>
              <strong>{updateCountdown}</strong>
              <small>{nextUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
            </div>
          </div>
          {showCollectionNotice && (
            <div className="collection-notice">
              Daily collection is running around 1:30 UTC; visible changes may arrive a little later.
            </div>
          )}
        </div>
      </section>

      <button
        aria-expanded={isMobileNavOpen}
        aria-controls="primary-navigation"
        className="mobile-menu-button"
        onClick={() => setIsMobileNavOpen((current) => !current)}
        type="button"
      >
        <Menu size={18} />
        Menu
      </button>

      <nav
        className={`view-tabs ${activeView} ${isMobileNavOpen ? 'open' : ''}`}
        id="primary-navigation"
        aria-label="Views"
      >
        <button
          className={activeView === 'dashboard' ? 'active' : ''}
          onClick={() => selectView('dashboard')}
          type="button"
        >
          <Activity size={16} />
          Dashboard
        </button>
        <button
          className={activeView === 'overview' ? 'active' : ''}
          onClick={() => selectView('overview')}
          type="button"
        >
          <LineChartIcon size={16} />
          Overview
        </button>
        <button
          className={activeView === 'compare' ? 'active' : ''}
          onClick={() => selectView('compare')}
          type="button"
        >
          <BarChart3 size={16} />
          Comparisons
        </button>
        <button
          className={activeView === 'tools' ? 'active' : ''}
          onClick={() => selectView('tools')}
          type="button"
        >
          <Hammer size={16} />
          Tools
        </button>
        <button
          className={activeView === 'changelog' ? 'active' : ''}
          onClick={() => selectView('changelog')}
          type="button"
        >
          <FileText size={16} />
          Changelog
        </button>
      </nav>

      {activeView !== 'compare' && chartOverlayControls}

      {activeView === 'dashboard' && (
        <section className="clean-dashboard view-panel">
          <div className="dashboard-hero">
            <div>
              <p className="eyebrow">Daily Brief</p>
              <h2>Overall Market</h2>
            </div>
            <RefreshProgress active={isDashboardLoading} />
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
            {(activeDashboardSignals.length ? activeDashboardSignals : [
              {
                title: 'Resource of the Day',
                name: 'Waiting for data',
                realm,
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
                  <p><DashboardDetail text={signal.detail} tone={signal.tone} /></p>
                  {(signal.winner || signal.loser || signal.beneficiary) && (
                    <div className="impact-pills">
                      {signal.winner && <span className="winner">Winner: {signal.winner}</span>}
                      {signal.loser && <span className="loser">Loser: {signal.loser}</span>}
                      {signal.beneficiary && <span className="beneficiary">Winner: {signal.beneficiary}</span>}
                    </div>
                  )}
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
                  realm,
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
                    <span className="technical-detail">
                      <span className="dashboard-token">{item.title}</span>: <DashboardDetail text={item.detail} tone={item.tone} />
                    </span>
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
                <span className="index-tooltip" role="tooltip">
                  <strong>{item.name}</strong>
                  <span>{item.description}</span>
                  <small>Method: {item.method}</small>
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
                  <AreaChart data={visibleSeries} margin={{ top: 8, right: 18, left: 0, bottom: 22 }}>
                    <defs>
                      <linearGradient id="indexFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                    <XAxis
                      dataKey="date"
                      interval="preserveStartEnd"
                      minTickGap={28}
                      tickFormatter={shortDateLabel}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals
                      domain={valueDomain(visibleSeries.map((point) => point.value))}
                      tickFormatter={(value) => formatNumber(Number(value))}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <Tooltip
                      offset={50} // ts was pmo way too close to the data point
                      content={(props) => (
                        <ChartTooltip
                          {...props}
                          context={overviewContext}
                          valueLabel="Index"
                        />
                      )}
                    />
                    {renderContextOverlays(
                      overviewContext,
                      showPhases,
                      showEvents,
                      showContests,
                      showOrders,
                      'overview',
                    )}
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
                    <Brush
                      dataKey="date"
                      fill="var(--brush-track)"
                      height={18}
                      travellerWidth={8}
                      tickFormatter={shortDateLabel}
                      stroke="var(--brush-border)"
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
                <h2>All Components</h2>
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
                    onChange={(event) =>
                      setSelectedQuality(
                        event.target.value === 'weighted' ? 'weighted' : Number(event.target.value),
                      )
                    }
                  >
                    <option value="weighted">Weighted qualities</option>
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
                <option value="14d">14D</option>
                <option value="1m">1M</option>
                <option value="2m">2M</option>
                <option value="3m">3M</option>
                <option value="6m">6M</option>
                <option value="9m">9M</option>
                <option value="1y">1Y</option>
                <option value="18m">18M</option>
                <option value="2y">2Y</option>
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

          {chartOverlayControls}

          <div className="comparison-chart" style={{ height: comparisonHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={comparisonSeries} margin={{ top: 12, right: 20, left: 4, bottom: 24 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="date"
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickFormatter={shortDateLabel}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="value"
                  domain={activeComparisonDomain}
                  tickFormatter={(value) =>
                    compareMode === 'percent' ? `${Number(value).toFixed(0)}%` : formatCompact(Number(value))
                  }
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <YAxis
                  yAxisId="volume"
                  hide
                  orientation="right"
                  tickFormatter={(value) => formatCompact(Number(value))}
                />
                <Tooltip
                  offset={50}
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
                  showOrders,
                  'comparison',
                  'value',
                )}
                {showTechnicals &&
                  comparisonTechnicals.map((item) =>
                    renderTechnicalOverlays(
                      item.rows,
                      item.signal,
                      `comparison-technical-${item.key}`,
                      item.color,
                      'value',
                    ),
                  )} 
                <Legend />
                {showVolume &&
                  canShowComparisonVolume &&
                  volumeComparisonSelections.map((selection, index) => (
                    <Bar
                      dataKey={`${selection.key}__volume`}
                      fill={comparisonColors[index % comparisonColors.length]}
                      fillOpacity={0.18}
                      isAnimationActive={false}
                      key={`${selection.key}-volume`}
                      name={`${comparisonLabel(selection)} volume`}
                      radius={[3, 3, 0, 0]}
                      yAxisId="volume"
                    />
                  ))}
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
                    yAxisId="value"
                  />
                ))}
                <Brush
                  dataKey="date"
                  fill="var(--brush-track)"
                  height={18}
                  travellerWidth={8}
                  tickFormatter={shortDateLabel}
                  stroke="var(--brush-border)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : activeView === 'tools' ? (
        <section className="tools-panel view-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Useful Tools</p>
              <h2>Other SimCompanies resources</h2>
              <p>External tools made by other community developers.</p>
            </div>
          </div>

          <div className="tools-grid">
            <a className="tool-card" href="https://cooperinc.xyz" rel="noreferrer" target="_blank">
              <span className="tile-icon">
                <Hammer size={18} />
              </span>
              <div>
                <strong>Coopers Tools</strong>
                <small>cooperinc.xyz</small>
              </div>
              <ArrowUpRight size={17} />
            </a>
            <a className="tool-card" href="https://simcotools.com" rel="noreferrer" target="_blank">
              <span className="tile-icon">
                <LineChartIcon size={18} />
              </span>
              <div>
                <strong>Simcotools</strong>
                <small>simcotools.com</small>
              </div>
              <ArrowUpRight size={17} />
            </a>
          </div>
        </section>
      ) : activeView === 'changelog' ? (
        <section className="changelog-panel view-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Changelog</p>
              <h2>Latest updates</h2>
              <p>Major feature releases and data pipeline changes for the indices site.</p>
            </div>
            <div className="version-badge" aria-label="Current version">
              <span>Version</span>
              <strong>v1.1.13</strong>
            </div>
          </div>

          <div className="changelog-list">
            {changelogEntries.map((entry) => (
              <article className="changelog-entry" key={`${entry.date}-${entry.title}`}>
                <time dateTime={entry.date}>{formatDisplayDate(entry.date)}</time>
                <div>
                  <h3>{entry.title}</h3>
                  <ul>
                    {entry.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="site-footer">
        <a
          className="creator-credit"
          href="https://www.simcompanies.com/company/0/DevTech-Industries%20Ltd./"
          rel="noreferrer"
          target="_blank"
        >
          <img
            alt="DevTech Industries logo"
            src="https://d1fxy698ilbz6u.cloudfront.net/logo/a9aa06251d8a6699b825066fbb7e781ba96f6579.png"
          />
          <span>Made by Loki Clarke, DevTech Industries Ltd.</span>
        </a>
        <span>&copy; {new Date().getFullYear()} SimCompanies Market Indices.</span>
        <span>Unofficial fan-made tool. Not affiliated with SimCompanies or Simcotools. Market data sourced from Simcotools.</span>
      </footer>

      {showTour && (
        <GuidedTour
          canContinue={tourTaskComplete(tourSteps[tourStepIndex].task)}
          onBack={previousTourStep}
          onDismiss={dismissTour}
          onNext={nextTourStep}
          stepIndex={tourStepIndex}
          steps={tourSteps}
        />
      )}
    </main>
  )
}

export default App
