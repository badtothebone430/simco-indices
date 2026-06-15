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
  LineChart,
  RefreshCw,
  Soup,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { createClient } from '@supabase/supabase-js'
import './App.css'

type RealmId = 0 | 1

type IndexCode =
  | 'total_market'
  | 'sc_10'
  | 'sc_30'
  | 'sc_50'
  | 'research_only'
  | 'food_only'
  | 'construction_only'
  | 'equal_weight_market'

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

const realms: Record<RealmId, string> = {
  0: 'Magnates',
  1: 'Entrepreneurs',
}

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

async function loadIndexSeries(realm: RealmId, indexCode: IndexCode) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  const supabase = createClient(url, key)
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
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    return null
  }

  const supabase = createClient(url, key)
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

function App() {
  const [realm, setRealm] = useState<RealmId>(0)
  const [selectedIndex, setSelectedIndex] = useState<IndexCode>('total_market')
  const [series, setSeries] = useState<IndexPoint[]>(demoSeries)
  const [components, setComponents] = useState<ComponentRow[]>(demoComponents)
  const [usingDemoData, setUsingDemoData] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const activeDefinition = indexDefinitions.find((item) => item.code === selectedIndex)!
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
      const loadedComponents = latestDate
        ? await loadIndexComponents(realm, selectedIndex, latestDate)
        : null

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SimCompanies Market Indices</p>
          <h1>Realm-level resource market performance</h1>
        </div>
        <div className="status-strip">
          <span className={usingDemoData ? 'status-dot demo' : 'status-dot live'} />
          {usingDemoData ? 'Demo data' : 'Supabase live'}
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
          Daily snapshot after prior-day VWAPs settle
        </div>
      </section>

      <section className="index-grid" aria-label="Indices">
        {indexDefinitions.map((item) => (
          <button
            className={`index-tile ${item.code === selectedIndex ? 'active' : ''}`}
            key={item.code}
            onClick={() => setSelectedIndex(item.code)}
            type="button"
          >
            <span className="tile-icon">
              {item.code === 'total_market' && <LineChart size={18} />}
              {(item.code === 'sc_10' || item.code === 'sc_30' || item.code === 'sc_50') && <Activity size={18} />}
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
                    <stop offset="0%" stopColor="#247a7b" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#247a7b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#dde5e4" strokeDasharray="3 5" vertical={false} />
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
                  stroke="#247a7b"
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
    </main>
  )
}

export default App
