import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Database,
  FlaskConical,
  Globe2,
  Hammer,
  LineChart as LineChartIcon,
  Moon,
  Plus,
  RefreshCw,
  Soup,
  Sun,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
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
type AppView = 'overview' | 'compare'
type CompareMode = 'absolute' | 'percent'
type CompareMetric = 'vwap' | 'market_value'
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

type ComparisonSelection = {
  key: string
  resourceId: number
  resourceName: string
  quality: number
}

type ComparisonDatum = {
  date: string
  label: string
  [key: string]: string | number
}

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

async function loadResourceMarketSeries(realm: RealmId, selection: ComparisonSelection) {
  const supabase = getSupabase()
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('market_daily')
    .select('date,vwap,market_value,volume')
    .eq('realm_id', realm)
    .eq('resource_id', selection.resourceId)
    .eq('quality', selection.quality)
    .order('date', { ascending: true })

  if (error || !data?.length) {
    return []
  }

  return data as MarketPoint[]
}

function buildComparisonRows(
  seriesByKey: Map<string, MarketPoint[]>,
  selections: ComparisonSelection[],
  metric: CompareMetric,
  mode: CompareMode,
  timeframe: Timeframe,
) {
  const dateMap = new Map<string, ComparisonDatum>()

  for (const selection of selections) {
    const rows = filterByTimeframe(seriesByKey.get(selection.key) ?? [], timeframe)
    const baseline = rows.find((row) => Number(row[metric]) > 0)?.[metric] ?? 0

    for (const row of rows) {
      const label = new Date(`${row.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const datum = dateMap.get(row.date) ?? { date: row.date, label }
      const rawValue = Number(row[metric])
      datum[selection.key] = mode === 'percent' && baseline > 0 ? (rawValue / baseline - 1) * 100 : rawValue
      dateMap.set(row.date, datum)
    }
  }

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('overview')
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
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([])
  const [selectedResourceId, setSelectedResourceId] = useState('')
  const [selectedQuality, setSelectedQuality] = useState(0)
  const [comparisonSelections, setComparisonSelections] = useState<ComparisonSelection[]>([])
  const [comparisonSeries, setComparisonSeries] = useState<ComparisonDatum[]>(demoComparisonData)
  const [compareMode, setCompareMode] = useState<CompareMode>('percent')
  const [compareMetric, setCompareMetric] = useState<CompareMetric>('vwap')
  const [compareTimeframe, setCompareTimeframe] = useState<Timeframe>('30d')
  const [comparisonHeight, setComparisonHeight] = useState(460)
  const [isComparisonLoading, setIsComparisonLoading] = useState(false)
  const [nextUpdate, setNextUpdate] = useState(() => nextUpdateDate())
  const [updateCountdown, setUpdateCountdown] = useState(() => formatCountdown(nextUpdateDate()))

  const qualityDefinitions = qualityLevels.map((quality) => qualityIndexDefinition(quality, q0IncludesResearch))
  const activeDefinition =
    [...indexDefinitions, ...qualityDefinitions].find((item) => item.code === selectedIndex) ??
    indexDefinitions[0]
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
      const options = await loadResourceOptions(realm)
      if (!isCurrent) return
      setResourceOptions(options)
      setSelectedResourceId(options[0]?.resource_id.toString() ?? '')
      setComparisonSelections([])
    }

    refreshResources()

    return () => {
      isCurrent = false
    }
  }, [realm])

  useEffect(() => {
    let isCurrent = true

    async function refreshComparison() {
      if (comparisonSelections.length === 0) {
        setComparisonSeries(demoComparisonData)
        return
      }

      setIsComparisonLoading(true)
      const loaded = await Promise.all(
        comparisonSelections.map(async (selection) => [
          selection.key,
          await loadResourceMarketSeries(realm, selection),
        ] as const),
      )

      if (!isCurrent) return

      const seriesByKey = new Map(loaded)
      const rows = buildComparisonRows(
        seriesByKey,
        comparisonSelections,
        compareMetric,
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

  function addComparisonSelection() {
    const resourceId = Number(selectedResourceId)
    const option = resourceOptions.find((resource) => resource.resource_id === resourceId)
    if (!option) return

    const key = `r${resourceId}q${selectedQuality}`
    if (comparisonSelections.some((selection) => selection.key === key)) {
      return
    }

    setComparisonSelections((current) =>
      [...current, { key, resourceId, resourceName: option.name, quality: selectedQuality }].slice(0, 6),
    )
  }

  function removeComparisonSelection(key: string) {
    setComparisonSelections((current) => current.filter((selection) => selection.key !== key))
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
            {usingDemoData ? 'Demo data' : 'Supabase live'}
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

      <nav className="view-tabs" aria-label="Views">
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

      {activeView === 'overview' ? (
        <>
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
                    <XAxis dataKey="label" minTickGap={28} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={['dataMin - 20', 'dataMax + 20']}
                      tickFormatter={(value) => formatNumber(Number(value))}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                    />
                    <Tooltip
                      formatter={(value) => [formatNumber(Number(value)), 'Index']}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                    />
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
                <strong>{latest.date}</strong>
              </div>
              <div className="data-source">
                <Database size={17} />
                {usingDemoData
                  ? 'Connect Supabase to replace this placeholder dataset.'
                  : 'Reading from index_values and index_components.'}
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
        </>
      ) : (
        <section className="comparison-panel">
          <div className="panel-header comparison-heading">
            <div>
              <p className="eyebrow">Comparisons</p>
              <h2>Resource performance workspace</h2>
              <p>Compare specific resources by VWAP or traded market value across the selected realm.</p>
            </div>
            <span className="loading-state">
              <RefreshCw className={isComparisonLoading ? 'spin' : ''} size={15} />
              {isComparisonLoading ? 'Refreshing' : 'Ready'}
            </span>
          </div>

          <div className="comparison-controls">
            <label>
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
            <button className="command-button" onClick={addComparisonSelection} type="button">
              <Plus size={16} />
              Add
            </button>
            <label>
              Metric
              <select value={compareMetric} onChange={(event) => setCompareMetric(event.target.value as CompareMetric)}>
                <option value="vwap">VWAP</option>
                <option value="market_value">Market value</option>
              </select>
            </label>
            <label>
              Mode
              <select value={compareMode} onChange={(event) => setCompareMode(event.target.value as CompareMode)}>
                <option value="percent">% change</option>
                <option value="absolute">$ value</option>
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

          <div className="selection-strip" aria-label="Compared resources">
            {comparisonSelections.length === 0 ? (
              <span className="empty-selection">Add up to six resource-quality pairs.</span>
            ) : (
              comparisonSelections.map((selection, index) => (
                <button
                  className="selection-chip"
                  key={selection.key}
                  onClick={() => removeComparisonSelection(selection.key)}
                  style={{ ['--chip-color' as string]: comparisonColors[index % comparisonColors.length] }}
                  type="button"
                >
                  {selection.resourceName} Q{selection.quality}
                  <X size={14} />
                </button>
              ))
            )}
          </div>

          <div className="comparison-chart" style={{ height: comparisonHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={comparisonSeries} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="label" minTickGap={24} tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={(value) =>
                    compareMode === 'percent' ? `${Number(value).toFixed(0)}%` : formatCompact(Number(value))
                  }
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <Tooltip
                  formatter={(value, name) => [
                    compareMode === 'percent'
                      ? `${Number(value).toFixed(2)}%`
                      : compareMetric === 'market_value'
                        ? formatCompact(Number(value))
                        : formatNumber(Number(value)),
                    name,
                  ]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ''}
                />
                <Legend />
                {(comparisonSelections.length
                  ? comparisonSelections
                  : [
                      { key: 'power', resourceName: 'Power', quality: 2, resourceId: 1 },
                      { key: 'steel', resourceName: 'Steel', quality: 0, resourceId: 43 },
                    ]
                ).map((selection, index) => (
                  <Line
                    activeDot={{ r: 5 }}
                    dataKey={selection.key}
                    dot={false}
                    key={selection.key}
                    name={`${selection.resourceName} Q${selection.quality}`}
                    stroke={comparisonColors[index % comparisonColors.length]}
                    strokeWidth={3}
                    type="monotone"
                  />
                ))}
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
