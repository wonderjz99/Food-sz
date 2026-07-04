import fs from "node:fs";
import type { FoodSafetyUnit } from "../src/types";
import { isInsideShenzhenBounds } from "../src/data/geocoding";
import { readJsonFile } from "./fs-utils";

type ValidateOptions = {
  strictGeocode?: boolean;
};

export function validateData(options: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  let nonOkGeocodeCount = 0;
  const units = readJsonFile<FoodSafetyUnit[]>("public/data/units.json", []);
  const summary = readJsonFile<{ total?: number; byRawCategory?: Record<string, number> }>("public/data/summary.json", {});

  if (units.length !== 4522) {
    errors.push(`Expected 4522 units, found ${units.length}`);
  }

  if (summary.total !== units.length) {
    errors.push(`Summary total ${summary.total ?? "missing"} does not match units ${units.length}`);
  }

  for (const unit of units) {
    if (!unit.name || !unit.rawCategory || !unit.address || !unit.district || !unit.ratingYear) {
      errors.push(`Unit ${unit.id} has missing required fields`);
    }

    if (unit.location && !isInsideShenzhenBounds(unit.location)) {
      errors.push(`Unit ${unit.id} has out-of-bounds location`);
    }

    if (options.strictGeocode && unit.geocodeStatus !== "ok") {
      nonOkGeocodeCount += 1;
    }
  }

  if (options.strictGeocode && nonOkGeocodeCount > 0) {
    errors.push(`Strict geocode validation failed: ${nonOkGeocodeCount} units are not fully geocoded`);
  }

  const rawCategorySum = Object.values(summary.byRawCategory ?? {}).reduce((sum, count) => sum + count, 0);
  if (rawCategorySum !== units.length) {
    errors.push(`Raw category sum ${rawCategorySum} does not match units ${units.length}`);
  }

  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!fs.existsSync("public/data/units.json")) {
    console.error("Missing public/data/units.json. Run pnpm run data:build first.");
    process.exit(1);
  }

  const errors = validateData({ strictGeocode: process.argv.includes("--strict-geocode") });
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log("Data validation passed");
}
