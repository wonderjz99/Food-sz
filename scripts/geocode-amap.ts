import fs from "node:fs";
import type { FoodSafetyUnit, GeocodeCache, GeocodeCacheRecord, LocationPoint, ParsedWorkbook } from "../src/types";
import { findReusableGeocodeRecord, shouldReviewGeocode } from "../src/data/geocoding";
import { loadEnvFile, readJsonFile, writeJsonFile } from "./fs-utils";
import { applyLocalKeysToProcessEnv } from "./local-keys";
import { parseFoodSafetyWorkbook } from "./parse-xlsx";
import { buildGeocodeAddress } from "./geocode-tencent";

type AmapGeocodeResponse = {
  status: "1" | "0";
  info: string;
  infocode: string;
  count?: string;
  geocodes?: Array<{
    location: string; // "lng,lat"
    level: string; // 门牌号|兴趣点|道路交叉路口|道路|住宅区|小巷|公交地铁站点|村庄|乡镇|区县|城市|未知
    formatted_address?: string;
    country?: string;
    province?: string;
    city?: string;
    district?: string;
    adcode?: string;
    street?: unknown;
    number?: unknown;
  }>;
};

const ENDPOINT_URL = "https://restapi.amap.com/v3/geocode/geo";
const DEFAULT_DELAY_MS = 200;
const DEFAULT_RETRIES = 2;

// Infocodes that mean "don't bother retrying, the run is blocked"
const FATAL_INFOCODES = new Set([
  "10001", // INVALID_USER_KEY — key is wrong or not activated
  "10003", // DAILY_QUERY_OVER_LIMIT — daily quota exhausted
  "20000", // NO_LIMITS — no API quota allocated to this key
]);

type GeocodeOptions = {
  limit: number;
  delayMs: number;
  retries: number;
  key?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function confidenceFromAmap(
  result: AmapGeocodeResponse["geocodes"]
): number {
  if (!result || result.length === 0) {
    return 0;
  }

  const level = result[0].level;
  // Map Amap address-matching levels to a 0-1 confidence score.
  // Higher precision → higher confidence. The 0.7 threshold determines
  // whether shouldReviewGeocode() flags the record for manual review.
  const LEVEL_CONFIDENCE: Record<string, number> = {
    "门牌号": 1.0, // building-number level
    "门址": 0.95, // door/entrance level
    "兴趣点": 0.9, // POI level
    "公交地铁站点": 0.85, // transit station
    "道路交叉路口": 0.8, // intersection
    "道路": 0.75, // road level
    "住宅区": 0.7, // residential area
    "小巷": 0.7, // alley
    "村庄": 0.6, // village
    "乡镇": 0.55, // town
    "未知": 0.5, // unknown
    "区县": 0.4, // district
    "城市": 0.3, // city
  };

  return Number((LEVEL_CONFIDENCE[level] ?? 0.5).toFixed(2));
}

function parseAmapLocation(locationStr: string): LocationPoint | null {
  const parts = locationStr.split(",").map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) {
    return null;
  }

  // Amap returns "lng,lat" — swap to our {lat, lng} order
  return { lat: parts[1], lng: parts[0] };
}

async function geocodeUnit(
  unit: FoodSafetyUnit,
  key: string
): Promise<GeocodeCacheRecord> {
  const queryAddress = buildGeocodeAddress(unit);
  const params = new URLSearchParams({
    key,
    address: queryAddress,
    city: "深圳",
    output: "JSON",
  });

  const response = await fetch(`${ENDPOINT_URL}?${params.toString()}`);
  const json = (await response.json()) as AmapGeocodeResponse;
  const location =
    json.status === "1" && json.geocodes?.[0]?.location
      ? parseAmapLocation(json.geocodes[0].location)
      : null;
  const confidence = confidenceFromAmap(json.geocodes);
  const status = response.ok && json.status === "1" && location ? "ok" : "failed";

  return {
    unitId: unit.id,
    address: unit.address,
    queryAddress,
    location,
    status,
    confidence,
    source: "amap",
    updatedAt: new Date().toISOString(),
    raw: json,
  };
}

async function geocodeWithRetry(
  unit: FoodSafetyUnit,
  key: string,
  retries: number
): Promise<GeocodeCacheRecord> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const record = await geocodeUnit(unit, key);
      const raw = record.raw as AmapGeocodeResponse | undefined;

      // Fatal infocodes — no point retrying, the whole run is blocked
      if (raw && FATAL_INFOCODES.has(raw.infocode)) {
        return record;
      }

      if (record.status === "ok" || attempt === retries) {
        return record;
      }
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }
    }

    await sleep(500 * (attempt + 1));
  }

  return {
    unitId: unit.id,
    address: unit.address,
    queryAddress: buildGeocodeAddress(unit),
    location: null,
    status: "failed",
    confidence: 0,
    source: "amap",
    updatedAt: new Date().toISOString(),
    raw: {
      status: "0",
      info: lastError instanceof Error ? lastError.message : String(lastError),
      infocode: "-1",
    },
  };
}

function writeReviewCsv(units: FoodSafetyUnit[], cache: GeocodeCache): void {
  const rows = ["id,name,address,district,rawCategory,source,status,confidence"];
  for (const unit of units) {
    const record = cache[unit.id];
    if (record && shouldReviewGeocode(record)) {
      rows.push(
        [
          unit.id,
          unit.name,
          unit.address,
          unit.district,
          unit.rawCategory,
          record.source,
          record.status,
          String(record.confidence),
        ]
          .map((value) => `"${value.replace(/"/g, '""')}"`)
          .join(",")
      );
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/geocode-review.csv", `${rows.join("\n")}\n`);
}

function loadUnits(): FoodSafetyUnit[] {
  // Check for new parsed-ratings.json first
  if (fs.existsSync("data/parsed-ratings.json")) {
    const parsed = readJsonFile<ParsedWorkbook | null>("data/parsed-ratings.json", null);
    if (parsed?.units?.length) {
      console.log(`从 data/parsed-ratings.json 加载 ${parsed.units.length.toLocaleString()} 条记录`);
      return parsed.units;
    }
  }
  // Fall back to legacy xlsx
  return parseFoodSafetyWorkbook().units;
}

export async function geocodeAmap(
  options: Partial<GeocodeOptions> = {}
): Promise<GeocodeCache> {
  const {
    limit = Number.POSITIVE_INFINITY,
    delayMs = DEFAULT_DELAY_MS,
    retries = DEFAULT_RETRIES,
    key: keyOverride,
  } = options;
  loadEnvFile();
  applyLocalKeysToProcessEnv();
  const key = keyOverride || process.env.AMAP_GEOCODE_KEY;

  if (!key) {
    throw new Error(
      "Missing AMAP_GEOCODE_KEY. Add it to .env, export it, or add food-sz-amap-geo to key.txt before running data:geocode-amap."
    );
  }

  const units = loadUnits();
  const cache = readJsonFile<GeocodeCache>("data/geocode-cache.json", {});
  let processed = 0;
  let ok = Object.values(cache).filter((record) => record.status === "ok")
    .length;

  for (const unit of units) {
    if (cache[unit.id]?.status === "ok") {
      continue;
    }

    const queryAddress = buildGeocodeAddress(unit);
    const reusable = findReusableGeocodeRecord(cache, queryAddress);
    if (reusable) {
      cache[unit.id] = {
        ...reusable,
        unitId: unit.id,
        address: unit.address,
        queryAddress,
        updatedAt: new Date().toISOString(),
      };
      ok += 1;
      continue;
    }

    cache[unit.id] = await geocodeWithRetry(unit, key, retries);
    processed += 1;
    ok += cache[unit.id].status === "ok" ? 1 : 0;

    const raw = cache[unit.id].raw as AmapGeocodeResponse | undefined;
    if (raw && FATAL_INFOCODES.has(raw.infocode)) {
      writeJsonFile("data/geocode-cache.json", cache);
      writeReviewCsv(units, cache);
      const hints: Record<string, string> = {
        "10001": "Amap reports the key is invalid or not yet activated. Check the key value and ensure the WebService API is enabled for this key in the Amap console (https://console.amap.com/dev/key/app). New keys may take up to an hour to activate.",
        "10003": "Amap reports this key has reached its daily request quota. Wait for the quota to reset or increase the quota in the Amap console.",
        "20000": "Amap reports no API quota allocated to this key. Go to the Amap console and assign quota to the WebService Geocoding API for this key.",
      };
      const hint =
        hints[raw.infocode] ??
        `Amap returned infocode ${raw.infocode}: ${raw.info}`;
      throw new Error(
        `Amap geocoder stopped at ${unit.id}: ${raw.info}. ${hint}`
      );
    }

    if (processed % 25 === 0) {
      writeJsonFile("data/geocode-cache.json", cache);
      writeReviewCsv(units, cache);
      console.log(
        `Geocoded ${processed} this run; ${ok}/${units.length} cached ok`
      );
    }

    if (processed >= limit) {
      break;
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  writeJsonFile("data/geocode-cache.json", cache);
  writeReviewCsv(units, cache);
  return cache;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
  const retriesArg = process.argv.find((arg) => arg.startsWith("--retries="));
  const limit = limitArg
    ? Number(limitArg.split("=")[1])
    : Number.POSITIVE_INFINITY;
  const delayMs = delayArg
    ? Number(delayArg.split("=")[1])
    : DEFAULT_DELAY_MS;
  const retries = retriesArg
    ? Number(retriesArg.split("=")[1])
    : DEFAULT_RETRIES;
  geocodeAmap({ limit, delayMs, retries })
    .then((cache) => {
      const ok = Object.values(cache).filter(
        (record) => record.status === "ok"
      ).length;
      console.log(
        `Geocode cache contains ${Object.keys(cache).length} records; ${ok} ok`
      );
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
