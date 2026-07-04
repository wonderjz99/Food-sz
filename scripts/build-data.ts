import fs from "node:fs";
import type { FoodSafetyUnit, GeocodeCache, ParsedWorkbook } from "../src/types";
import { readCacheRecord, shouldReviewGeocode } from "../src/data/geocoding";
import { readJsonFile, writeJsonFile } from "./fs-utils";
import { parseFoodSafetyWorkbook, summarizeUnits } from "./parse-xlsx";

function loadParsedUnits(): ParsedWorkbook {
  // Use new parsed-ratings.json if available
  if (fs.existsSync("data/parsed-ratings.json")) {
    const parsed = readJsonFile<ParsedWorkbook | null>("data/parsed-ratings.json", null);
    if (parsed?.units?.length) {
      console.log(`从 data/parsed-ratings.json 构建 (${parsed.units.length.toLocaleString()} 条)`);
      return parsed;
    }
  }
  // Legacy xlsx path
  console.log("从 12297203.xlsx 构建");
  return parseFoodSafetyWorkbook();
}

function addPreviewLocation(unit: FoodSafetyUnit, index: number): FoodSafetyUnit {
  const row = Math.floor(index / 95);
  const col = index % 95;
  return {
    ...unit,
    location: {
      lat: 22.42 + row * 0.009,
      lng: 113.78 + col * 0.008
    },
    geocodeStatus: "review",
    geocodeConfidence: 0.45
  };
}

export function buildPublicData(): { units: FoodSafetyUnit[]; reviewRows: string[] } {
  const parsed = loadParsedUnits();
  const cache = readJsonFile<GeocodeCache>("data/geocode-cache.json", {});

  const reviewRows = ["id,name,address,district,rawCategory,ratingLevel,reason"];
  const units: FoodSafetyUnit[] = parsed.units.map((unit, index) => {
    const cached = readCacheRecord(cache, unit.id);
    if (!cached) {
      return addPreviewLocation(unit, index);
    }

    if (shouldReviewGeocode(cached)) {
      reviewRows.push(
        [unit.id, unit.name, unit.address, unit.district, unit.rawCategory, cached.status].map(csvEscape).join(",")
      );
    }

    return {
      ...unit,
      location: cached.location ?? addPreviewLocation(unit, index).location,
      geocodeStatus: shouldReviewGeocode(cached) ? "review" as const : "ok" as const,
      geocodeConfidence: cached.confidence
    };
  });

  // Full dataset for filtering (all records with preview coords)
  const summary = summarizeUnits(units, parsed.sourceUpdatedAt);
  writeJsonFile("public/data/units.json", units);
  writeJsonFile("public/data/summary.json", summary);

  // Search index: all records, minimal fields for fast client-side search
  const searchIndex = parsed.units.map((u) => ({
    i: u.id,
    n: u.name,
    a: u.address,
    l: u.ratingLevel,
    d: u.district,
    t: u.ratingYear,
    g: u.geocodeStatus === "ok",
  }));
  fs.writeFileSync("public/data/search-index.json", JSON.stringify(searchIndex));
  console.log(`  搜索索引: ${searchIndex.length.toLocaleString()} 条 (${(fs.statSync('public/data/search-index.json').size / 1024 / 1024).toFixed(1)} MB)`);

  // Lightweight geocoded-only dataset for fast map loading
  const geocoded = units.filter((u) => u.geocodeStatus === "ok");
  writeJsonFile("public/data/units-geo.json", geocoded);
  const geoSummary = summarizeUnits(geocoded, parsed.sourceUpdatedAt);
  writeJsonFile("public/data/summary-geo.json", geoSummary);
  console.log(`  已geocode: ${geocoded.length.toLocaleString()} (轻量文件: ${(fs.statSync('public/data/units-geo.json').size / 1024).toFixed(0)} KB)`);

  if (reviewRows.length > 1) {
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync("data/geocode-review.csv", `${reviewRows.join("\n")}\n`);
  }

  return { units, reviewRows };
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { units } = buildPublicData();
  console.log(`Built public data for ${units.length} units`);
}
