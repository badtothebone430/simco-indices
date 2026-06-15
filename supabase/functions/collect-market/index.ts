import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RealmId = 0 | 1;

type Resource = {
  id: number;
  name: string;
  isResearch?: boolean;
  transportation?: number;
  producedAnHour?: number;
  inputs?: Record<string, unknown>;
  retailInfo?: unknown[];
};

type MarketSummary = {
  quality: number;
  lastDayCandlestick?: {
    date?: string;
    close?: number;
    volume?: number;
    vwap?: number;
    previousVWAPPercentageChange?: number;
  };
};

type ResourceMarketResponse = {
  resource: {
    resourceId: number;
    resourceName: string;
    summariesByQuality: MarketSummary[];
  };
};

type MarketDailyRow = {
  realm_id: RealmId;
  resource_id: number;
  resource_name: string;
  quality: number;
  date: string;
  close: number | null;
  vwap: number;
  vwap_change_percent: number | null;
  volume: number;
  market_value: number;
  raw: MarketSummary;
};

const SIMCOTOOLS_BASE_URL = "https://api.simcotools.com";
const REALMS: RealmId[] = [0, 1];
const RATE_LIMIT_DELAY_MS = 2500;
const MAX_FETCH_ATTEMPTS = 5;
const BASE_INDEX_VALUE = 1000;

const FOOD_RESOURCE_NAMES = new Set([
  "apple cider",
  "apple icecream",
  "apple pie",
  "apples",
  "bread",
  "butter",
  "cheese",
  "chocolate",
  "chocolate icecream",
  "cocktails",
  "cocoa",
  "coffee beans",
  "coffee powder",
  "cream egg",
  "dough",
  "easter bunny",
  "eggs",
  "flour",
  "fodder",
  "ginger beer",
  "grain",
  "milk",
  "orange juice",
  "oranges",
  "sausages",
  "steak",
  "sugar",
  "sugarcane",
  "vegetable oil",
  "vegetables",
]);

const CONSTRUCTION_RESOURCE_NAMES = new Set([
  "beams",
  "bricks",
  "bulldozer",
  "cement",
  "clay",
  "construction units",
  "glass",
  "limestone",
  "planks",
  "sand",
  "tools",
  "windows",
  "wood",
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  return RATE_LIMIT_DELAY_MS * attempt * 3 + Math.floor(Math.random() * 1000);
}

class SimcotoolsError extends Error {
  status: number;

  constructor(path: string, status: number) {
    super(`Simcotools ${path} failed with ${status}`);
    this.status = status;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${SIMCOTOOLS_BASE_URL}${path}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
      },
    });

    if (response.ok) {
      return await response.json() as T;
    }

    if (response.status === 429 && attempt < MAX_FETCH_ATTEMPTS) {
      const retryDelay = retryDelayMs(response, attempt);
      await sleep(retryDelay);
      continue;
    }

    throw new SimcotoolsError(path, response.status);
  }

  throw new SimcotoolsError(path, 0);
}

async function fetchResources(realm: RealmId): Promise<Resource[]> {
  const data = await fetchJson<{ resources: Resource[] }>(
    `/v1/realms/${realm}/resources?type=all&disable_pagination=true`,
  );
  return data.resources ?? [];
}

async function fetchResourceMarket(realm: RealmId, resourceId: number) {
  return await fetchJson<ResourceMarketResponse>(
    `/v1/realms/${realm}/market/resources/${resourceId}`,
  );
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function buildMarketRows(realm: RealmId, market: ResourceMarketResponse): MarketDailyRow[] {
  const resource = market.resource;
  const summaries = resource.summariesByQuality ?? [];

  return summaries.flatMap((summary) => {
    const candle = summary.lastDayCandlestick;
    if (!candle?.date || !candle.vwap || !candle.volume) {
      return [];
    }

    const vwap = Number(candle.vwap);
    const volume = Number(candle.volume);

    if (!Number.isFinite(vwap) || !Number.isFinite(volume) || vwap <= 0 || volume <= 0) {
      return [];
    }

    return [{
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
    }];
  });
}

function weightedReturn(rows: MarketDailyRow[], weightField: "market_value" | "equal") {
  if (rows.length === 0) {
    return null;
  }

  const rowsWithReturn = rows.filter((row) => row.vwap_change_percent !== null);
  const activeRows = rowsWithReturn.length > 0 ? rowsWithReturn : rows;

  const totalWeight = activeRows.reduce((sum, row) => {
    return sum + (weightField === "equal" ? 1 : row.market_value);
  }, 0);

  if (totalWeight <= 0) {
    return null;
  }

  const value = activeRows.reduce((sum, row) => {
    const weight = weightField === "equal" ? 1 : row.market_value;
    return sum + (row.vwap_change_percent ?? 0) * weight;
  }, 0) / totalWeight;

  return value;
}

function isResearchRow(row: MarketDailyRow) {
  return row.resource_name.toLowerCase().includes("research");
}

function isFoodRow(row: MarketDailyRow) {
  return FOOD_RESOURCE_NAMES.has(row.resource_name.toLowerCase());
}

function isConstructionRow(row: MarketDailyRow) {
  return CONSTRUCTION_RESOURCE_NAMES.has(row.resource_name.toLowerCase());
}

async function getPreviousIndexValue(
  supabase: ReturnType<typeof createClient>,
  indexCode: string,
  realm: RealmId,
  date: string,
) {
  const { data, error } = await supabase
    .from("index_values")
    .select("value")
    .eq("index_code", indexCode)
    .eq("realm_id", realm)
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`previous index lookup failed: ${error.message}`);
  }

  return Number(data?.value ?? BASE_INDEX_VALUE);
}

async function buildIndex(
  supabase: ReturnType<typeof createClient>,
  indexCode: string,
  realm: RealmId,
  date: string,
  rows: MarketDailyRow[],
  weightField: "market_value" | "equal",
) {
  const dailyReturn = weightedReturn(rows, weightField);
  if (dailyReturn === null) {
    return null;
  }

  const previousValue = await getPreviousIndexValue(supabase, indexCode, realm, date);
  const totalMarketValue = rows.reduce((sum, row) => sum + row.market_value, 0);
  const denominator = weightField === "equal" ? rows.length : totalMarketValue;

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
      weight: weightField === "equal" ? 1 / rows.length : row.market_value / denominator,
      vwap: row.vwap,
      volume: row.volume,
      market_value: row.market_value,
    })),
  };
}

async function upsertInChunks<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  onConflict: string,
) {
  const chunkSize = 500;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new Error(`${table} upsert failed: ${error.message}`);
    }
  }
}

async function collectRealm(
  supabase: ReturnType<typeof createClient>,
  realm: RealmId,
) {
  const resources = await fetchResources(realm);

  await upsertInChunks(
    supabase,
    "resources",
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
    "realm_id,resource_id",
  );

  const rows: MarketDailyRow[] = [];
  const skippedResources = [];

  for (const resource of resources) {
    await sleep(RATE_LIMIT_DELAY_MS);
    try {
      const market = await fetchResourceMarket(realm, resource.id);
      rows.push(...buildMarketRows(realm, market));
    } catch (error) {
      if (error instanceof SimcotoolsError && (error.status === 404 || error.status === 422)) {
        skippedResources.push({
          resourceId: resource.id,
          name: resource.name,
          status: error.status,
        });
        continue;
      }
      throw error;
    }
  }

  await upsertInChunks(
    supabase,
    "market_daily",
    rows,
    "realm_id,resource_id,quality,date",
  );

  const latestDate = rows
    .map((row) => row.date)
    .sort()
    .at(-1);
  const dates = latestDate ? [latestDate] : [];
  const indexValues = [];
  const indexComponents = [];

  for (const date of dates) {
    const dayRows = rows.filter((row) => row.date === date);
    const rankedRows = [...dayRows].sort((a, b) => b.market_value - a.market_value);

    const indices = [
      await buildIndex(supabase, "total_market", realm, date, dayRows, "market_value"),
      await buildIndex(supabase, "sc_10", realm, date, rankedRows.slice(0, 10), "market_value"),
      await buildIndex(supabase, "sc_30", realm, date, rankedRows.slice(0, 30), "market_value"),
      await buildIndex(supabase, "sc_50", realm, date, rankedRows.slice(0, 50), "market_value"),
      await buildIndex(supabase, "research_only", realm, date, dayRows.filter(isResearchRow), "market_value"),
      await buildIndex(supabase, "food_only", realm, date, dayRows.filter(isFoodRow), "market_value"),
      await buildIndex(supabase, "construction_only", realm, date, dayRows.filter(isConstructionRow), "market_value"),
      await buildIndex(supabase, "equal_weight_market", realm, date, dayRows, "equal"),
    ].filter(Boolean);

    for (const index of indices) {
      indexValues.push(index!.value);
      indexComponents.push(...index!.components);
    }
  }

  await upsertInChunks(
    supabase,
    "index_values",
    indexValues,
    "index_code,realm_id,date",
  );

  await upsertInChunks(
    supabase,
    "index_components",
    indexComponents,
    "index_code,realm_id,date,resource_id,quality",
  );

  return {
    realm,
    resources: resources.length,
    skippedResources,
    marketRows: rows.length,
    indexValues: indexValues.length,
    indexComponents: indexComponents.length,
  };
}

Deno.serve(async (request) => {
  try {
    const collectorSecret = Deno.env.get("COLLECTOR_SECRET");

    if (collectorSecret) {
      const requestSecret = request.headers.get("x-collector-secret");
      if (requestSecret !== collectorSecret) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabaseUrl = Deno.env.get("SIMCO_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SIMCO_SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: "Missing SIMCO_SUPABASE_URL or SIMCO_SUPABASE_SECRET_KEY" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const results = [];

    for (const realm of REALMS) {
      results.push(await collectRealm(supabase, realm));
    }

    return Response.json({
      ok: true,
      collectedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
