import path from "node:path";
import XLSX from "xlsx";
import { categoryGroupFor } from "../src/data/categories";
import type { DatasetSummary, FoodSafetyUnit, ParsedWorkbook } from "../src/types";
import { writeJsonFile } from "./fs-utils";

const DEFAULT_WORKBOOK = "12297203.xlsx";

type RawRow = [number, string, string, string, string, string];

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function parseSourceUpdatedAt(value: string): string {
  const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseRatingYear(value: unknown): number {
  const match = asString(value).match(/(\d{4})/);
  if (!match) {
    throw new Error(`Invalid rating year: ${String(value)}`);
  }

  return Number(match[1]);
}

function countBy<T extends string | number>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = String(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

export function summarizeUnits(units: FoodSafetyUnit[], sourceUpdatedAt: string): DatasetSummary {
  return {
    sourceUpdatedAt,
    total: units.length,
    withLocation: units.filter((unit) => unit.location).length,
    byCategoryGroup: countBy(units.map((unit) => unit.categoryGroup)),
    byRawCategory: countBy(units.map((unit) => unit.rawCategory)),
    byDistrict: countBy(units.map((unit) => unit.district)),
    byRatingYear: countBy(units.map((unit) => unit.ratingYear)),
    byRatingLevel: countBy(units.map((unit) => unit.ratingLevel))
  };
}

export function parseFoodSafetyWorkbook(workbookPath = DEFAULT_WORKBOOK): ParsedWorkbook {
  const absolutePath = path.resolve(workbookPath);
  const workbook = XLSX.readFile(absolutePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const sourceUpdatedAt = parseSourceUpdatedAt(asString(rows[1]?.[0]));

  const units = rows.slice(3).flatMap((row, index) => {
    const [sequence, name, rawCategory, address, district, ratingYear] = row as RawRow;
    const normalizedName = asString(name);
    const normalizedCategory = asString(rawCategory);
    const normalizedAddress = asString(address);
    const normalizedDistrict = asString(district);

    if (!normalizedName && !normalizedAddress) {
      return [];
    }

    const idNumber = Number(sequence) || index + 1;
    return [
      {
        id: `sz-a-${String(idNumber).padStart(6, "0")}`,
        name: normalizedName,
        rawCategory: normalizedCategory,
        categoryGroup: categoryGroupFor(normalizedCategory),
        address: normalizedAddress,
        district: normalizedDistrict,
        ratingYear: parseRatingYear(ratingYear),
        ratingLevel: "A" as const,
        sourceUpdatedAt,
        location: null,
        geocodeStatus: "pending" as const,
        geocodeConfidence: null,
        sourceRow: index + 4
      }
    ];
  });

  return {
    sourceUpdatedAt,
    units,
    summary: summarizeUnits(units, sourceUpdatedAt)
  };
}

export function writeParsedWorkbook(workbookPath = DEFAULT_WORKBOOK): ParsedWorkbook {
  const parsed = parseFoodSafetyWorkbook(workbookPath);
  writeJsonFile("data/parsed-units.json", parsed.units);
  writeJsonFile("data/summary.json", parsed.summary);
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const workbookPath = process.argv[2] ?? DEFAULT_WORKBOOK;
  const parsed = writeParsedWorkbook(workbookPath);
  console.log(`Parsed ${parsed.units.length} records from ${workbookPath}`);
}
