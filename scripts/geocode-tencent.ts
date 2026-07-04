import crypto from "node:crypto";
import fs from "node:fs";
import type { FoodSafetyUnit, GeocodeCache, GeocodeCacheRecord, LocationPoint } from "../src/types";
import { findReusableGeocodeRecord, shouldReviewGeocode } from "../src/data/geocoding";
import { loadEnvFile, readJsonFile, writeJsonFile } from "./fs-utils";
import { applyLocalKeysToProcessEnv } from "./local-keys";
import { parseFoodSafetyWorkbook } from "./parse-xlsx";

type TencentGeocodeResponse = {
  status: number;
  message: string;
  result?: {
    title?: string;
    reliability?: number;
    similarity?: number;
    location?: {
      lat: number;
      lng: number;
    };
  };
};

const ENDPOINT_PATH = "/ws/geocoder/v1/";
const ENDPOINT_URL = `https://apis.map.qq.com${ENDPOINT_PATH}`;
const DEFAULT_DELAY_MS = 120;
const DEFAULT_RETRIES = 2;

type GeocodeOptions = {
  limit: number;
  delayMs: number;
  retries: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildSignature(pathname: string, params: URLSearchParams, secret: string): string {
  const query = [...params.entries()]
    .filter(([key]) => key !== "sig")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto.createHash("md5").update(`${pathname}?${query}${secret}`).digest("hex");
}

function confidenceFromTencent(result: TencentGeocodeResponse["result"]): number {
  if (!result) {
    return 0;
  }

  const reliability = Math.min(Math.max((result.reliability ?? 0) / 10, 0), 1);
  const similarity = Math.min(Math.max((result.similarity ?? 0) / 100, 0), 1);
  return Number(Math.max(reliability, similarity).toFixed(2));
}

export function buildGeocodeAddress(unit: Pick<FoodSafetyUnit, "address" | "district">): string {
  const address = unit.address.trim();
  if (address.includes("深圳")) {
    return address;
  }

  return `深圳市${unit.district}${address}`;
}

async function geocodeUnit(unit: FoodSafetyUnit, key: string, secret?: string): Promise<GeocodeCacheRecord> {
  const queryAddress = buildGeocodeAddress(unit);
  const params = new URLSearchParams({
    address: queryAddress,
    key,
    region: "深圳市"
  });

  if (secret) {
    params.set("sig", buildSignature(ENDPOINT_PATH, params, secret));
  }

  const response = await fetch(`${ENDPOINT_URL}?${params.toString()}`);
  const json = (await response.json()) as TencentGeocodeResponse;
  const location: LocationPoint | null = json.result?.location
    ? { lat: json.result.location.lat, lng: json.result.location.lng }
    : null;
  const confidence = confidenceFromTencent(json.result);
  const status = response.ok && json.status === 0 && location ? "ok" : "failed";

  return {
    unitId: unit.id,
    address: unit.address,
    queryAddress,
    location,
    status,
    confidence,
    source: "tencent",
    updatedAt: new Date().toISOString(),
    raw: json
  };
}

async function geocodeWithRetry(
  unit: FoodSafetyUnit,
  key: string,
  secret: string | undefined,
  retries: number
): Promise<GeocodeCacheRecord> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const record = await geocodeUnit(unit, key, secret);
      const raw = record.raw as TencentGeocodeResponse | undefined;
      if (raw?.status === 111 || raw?.status === 121) {
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
    source: "tencent",
    updatedAt: new Date().toISOString(),
    raw: {
      status: -1,
      message: lastError instanceof Error ? lastError.message : String(lastError)
    }
  };
}

function writeReviewCsv(units: FoodSafetyUnit[], cache: GeocodeCache): void {
  const rows = ["id,name,address,district,rawCategory,status,confidence"];
  for (const unit of units) {
    const record = cache[unit.id];
    if (record && shouldReviewGeocode(record)) {
      rows.push(
        [unit.id, unit.name, unit.address, unit.district, unit.rawCategory, record.status, String(record.confidence)]
          .map((value) => `"${value.replace(/"/g, '""')}"`)
          .join(",")
      );
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/geocode-review.csv", `${rows.join("\n")}\n`);
}

export async function geocodeTencent(options: Partial<GeocodeOptions> = {}): Promise<GeocodeCache> {
  const {
    limit = Number.POSITIVE_INFINITY,
    delayMs = DEFAULT_DELAY_MS,
    retries = DEFAULT_RETRIES
  } = options;
  loadEnvFile();
  applyLocalKeysToProcessEnv();
  const key = process.env.TENCENT_MAP_GEOCODE_KEY;
  const secret = process.env.TENCENT_MAP_GEOCODE_SECRET;

  if (!key) {
    throw new Error("Missing TENCENT_MAP_GEOCODE_KEY. Add it to .env or export it before running data:geocode.");
  }

  const units = parseFoodSafetyWorkbook().units;
  const cache = readJsonFile<GeocodeCache>("data/geocode-cache.json", {});
  let processed = 0;
  let ok = Object.values(cache).filter((record) => record.status === "ok").length;

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
        updatedAt: new Date().toISOString()
      };
      ok += 1;
      continue;
    }

    cache[unit.id] = await geocodeWithRetry(unit, key, secret, retries);
    processed += 1;
    ok += cache[unit.id].status === "ok" ? 1 : 0;

    const raw = cache[unit.id].raw as TencentGeocodeResponse | undefined;
    if (raw?.status === 111 || raw?.status === 121) {
      writeJsonFile("data/geocode-cache.json", cache);
      writeReviewCsv(units, cache);
      const hint = raw.status === 111 ? (secret
        ? "TENCENT_MAP_GEOCODE_SECRET is present but Tencent rejected the signature. Check the SK value and whether the console key matches it."
        : "This WebService key appears to require signature verification. Add TENCENT_MAP_GEOCODE_SECRET in .env, add a food-sz-geo-secret entry in key.txt, or disable signature verification for this key in Tencent Location Service.")
        : "Tencent reports this key has reached its daily request quota. Wait for the quota to reset or increase the WebService API quota in the Tencent Location Service console.";
      throw new Error(`Tencent geocoder stopped at ${unit.id}: ${raw.message}. ${hint}`);
    }

    if (processed % 25 === 0) {
      writeJsonFile("data/geocode-cache.json", cache);
      writeReviewCsv(units, cache);
      console.log(`Geocoded ${processed} this run; ${ok}/${units.length} cached ok`);
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
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Number.POSITIVE_INFINITY;
  const delayMs = delayArg ? Number(delayArg.split("=")[1]) : DEFAULT_DELAY_MS;
  const retries = retriesArg ? Number(retriesArg.split("=")[1]) : DEFAULT_RETRIES;
  geocodeTencent({ limit, delayMs, retries })
    .then((cache) => {
      const ok = Object.values(cache).filter((record) => record.status === "ok").length;
      console.log(`Geocode cache contains ${Object.keys(cache).length} records; ${ok} ok`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
