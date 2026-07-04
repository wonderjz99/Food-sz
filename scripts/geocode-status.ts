import type { FoodSafetyUnit, GeocodeCache } from "../src/types";
import { readJsonFile } from "./fs-utils";
import { parseFoodSafetyWorkbook } from "./parse-xlsx";

type CountMap = Record<string, number>;

function countBy<T>(items: T[], keyFor: (item: T) => string): CountMap {
  return items.reduce<CountMap>((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function rawProviderStatus(record: GeocodeCache[string]): string {
  const raw = record.raw as Record<string, unknown> | undefined;
  if (!raw) return "none";

  if (record.source === "amap") {
    const status = raw.status as string | undefined;
    const infocode = raw.infocode as string | undefined;
    return status == null ? "none" : `${status}:${infocode ?? ""}`;
  }

  // tencent — numeric status
  const status = raw.status as number | undefined;
  return status == null ? "none" : String(status);
}

export function getGeocodeStatus() {
  const workbook = parseFoodSafetyWorkbook();
  const publicUnits = readJsonFile<FoodSafetyUnit[]>("public/data/units.json", []);
  const cache = readJsonFile<GeocodeCache>("data/geocode-cache.json", {});
  const cacheRecords = Object.values(cache);
  const publicStatuses = countBy(publicUnits, (unit) => unit.geocodeStatus);
  const cacheStatuses = countBy(cacheRecords, (record) => `${record.source}:${record.status}:${rawProviderStatus(record)}`);
  const ok = publicUnits.filter((unit) => unit.geocodeStatus === "ok").length;

  return {
    workbookTotal: workbook.units.length,
    publicTotal: publicUnits.length,
    publicStatuses,
    realGeocoded: ok,
    remainingStrict: Math.max(workbook.units.length - ok, 0),
    cacheRecords: cacheRecords.length,
    cacheStatuses,
    amapOk: cacheRecords.filter((record) => record.source === "amap" && record.status === "ok").length,
    tencentOk: cacheRecords.filter((record) => record.source === "tencent" && record.status === "ok").length,
    quotaFailures: cacheRecords.filter((record) => rawProviderStatus(record) === "121").length,
    signatureFailures: cacheRecords.filter((record) => rawProviderStatus(record) === "111").length
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const status = getGeocodeStatus();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`Workbook records: ${status.workbookTotal}`);
    console.log(`Public records: ${status.publicTotal}`);
    console.log(`Tencent geocoded ok: ${status.tencentOk ?? status.realGeocoded}`);
    console.log(`Amap geocoded ok: ${status.amapOk ?? 0}`);
    console.log(`Total geocoded ok: ${status.realGeocoded}`);
    console.log(`Remaining for strict geocode: ${status.remainingStrict}`);
    console.log(`Cache records: ${status.cacheRecords}`);
    console.log(`Public statuses: ${JSON.stringify(status.publicStatuses)}`);
    console.log(`Cache statuses: ${JSON.stringify(status.cacheStatuses)}`);
    console.log(`Quota-limit failures: ${status.quotaFailures}`);
    console.log(`Old signature failures to retry: ${status.signatureFailures}`);
  }
}
