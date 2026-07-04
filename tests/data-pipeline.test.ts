import { describe, expect, test } from "vitest";
import { parseFoodSafetyWorkbook } from "../scripts/parse-xlsx";
import { categoryGroupFor } from "../src/data/categories";
import { filterUnits } from "../src/data/filtering";
import {
  isInsideShenzhenBounds,
  shouldReviewGeocode,
  readCacheRecord,
  findReusableGeocodeRecord
} from "../src/data/geocoding";
import { parseLocalKeyText } from "../scripts/local-keys";
import { buildGeocodeAddress } from "../scripts/geocode-tencent";
import { mapFocusTargetFor } from "../src/data/mapFocus";
import type { FoodSafetyUnit } from "../src/types";

const workbookPath = "12297203.xlsx";

describe("xlsx parsing", () => {
  test("parses the food safety workbook into 4522 standard records", () => {
    const result = parseFoodSafetyWorkbook(workbookPath);

    expect(result.sourceUpdatedAt).toBe("2025-06-30");
    expect(result.units).toHaveLength(4522);
    expect(result.units[0]).toMatchObject({
      id: "sz-a-000001",
      name: "中国工商银行股份有限公司深圳市分行（职工食堂）",
      rawCategory: "机关企事业单位食堂",
      categoryGroup: "单位食堂",
      address: "深圳市福田区车公庙工业区303栋二层西",
      district: "福田区",
      ratingYear: 2010,
      geocodeStatus: "pending",
      geocodeConfidence: null,
      sourceRow: 4
    });
  });

  test("preserves all required text fields", () => {
    const result = parseFoodSafetyWorkbook(workbookPath);

    expect(result.units.every((unit) => unit.name.length > 0)).toBe(true);
    expect(result.units.every((unit) => unit.rawCategory.length > 0)).toBe(true);
    expect(result.units.every((unit) => unit.address.length > 0)).toBe(true);
    expect(result.units.every((unit) => unit.district.length > 0)).toBe(true);
  });
});

describe("category grouping", () => {
  test("maps raw categories to stable product groups", () => {
    expect(categoryGroupFor("社会餐饮")).toBe("社会餐饮");
    expect(categoryGroupFor("幼儿园食堂（公办）")).toBe("学校/幼儿园");
    expect(categoryGroupFor("学校食堂（民办）")).toBe("学校/幼儿园");
    expect(categoryGroupFor("连锁餐饮")).toBe("连锁餐饮");
    expect(categoryGroupFor("中央厨房/集体用餐配送单位")).toBe("集配/中央厨房");
    expect(categoryGroupFor("机关企事业单位食堂")).toBe("单位食堂");
  });
});

describe("filtering", () => {
  const units = parseFoodSafetyWorkbook(workbookPath).units;

  test("composes category, district, year, raw category, and keyword filters", () => {
    const filtered = filterUnits(units, {
      categoryGroup: "社会餐饮",
      rawCategory: "社会餐饮",
      districts: new Set(["龙岗区"]),
      yearRange: [2020, 2020],
      query: "华为"
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (unit) =>
          unit.categoryGroup === "社会餐饮" &&
          unit.rawCategory === "社会餐饮" &&
          unit.district === "龙岗区" &&
          unit.ratingYear === 2020 &&
          `${unit.name}${unit.address}`.includes("华为")
      )
    ).toBe(true);
  });
});

describe("geocode cache helpers", () => {
  test("reuses cached records and flags low-confidence/out-of-bounds locations", () => {
    const cache = {
      "sz-a-000001": {
        unitId: "sz-a-000001",
        address: "深圳市福田区车公庙工业区303栋二层西",
        location: { lat: 22.5431, lng: 114.0579 },
        status: "ok",
        confidence: 0.92,
        source: "tencent",
        updatedAt: "2026-06-30T00:00:00.000Z"
      }
    } as const;

    expect(readCacheRecord(cache, "sz-a-000001")?.location?.lng).toBe(114.0579);
    expect(isInsideShenzhenBounds({ lat: 22.5431, lng: 114.0579 })).toBe(true);
    expect(isInsideShenzhenBounds({ lat: 31.2304, lng: 121.4737 })).toBe(false);
    expect(shouldReviewGeocode({ status: "ok", confidence: 0.4, location: { lat: 22.6, lng: 114.1 } })).toBe(true);
    expect(shouldReviewGeocode({ status: "ok", confidence: 0.9, location: { lat: 31.2, lng: 121.4 } })).toBe(true);
    expect(shouldReviewGeocode({ status: "failed", confidence: 0, location: null })).toBe(true);
  });

  test("can reuse successful geocode records for duplicate query addresses", () => {
    const cache = {
      "sz-a-000001": {
        unitId: "sz-a-000001",
        address: "深圳市南山区华侨城深南大道9026号二楼",
        queryAddress: "深圳市南山区华侨城深南大道9026号二楼",
        location: { lat: 22.5402, lng: 113.9804 },
        status: "ok",
        confidence: 0.88,
        source: "tencent",
        updatedAt: "2026-06-30T00:00:00.000Z"
      },
      "sz-a-000002": {
        unitId: "sz-a-000002",
        address: "深圳市南山区华侨城深南大道9026号二楼",
        queryAddress: "深圳市南山区华侨城深南大道9026号二楼",
        location: null,
        status: "failed",
        confidence: 0,
        source: "tencent",
        updatedAt: "2026-06-30T00:00:00.000Z"
      }
    } as const;

    const reusable = findReusableGeocodeRecord(cache, " 深圳市南山区华侨城深南大道9026号二楼 ");

    expect(reusable?.unitId).toBe("sz-a-000001");
    expect(reusable?.location?.lng).toBe(113.9804);
  });
});

describe("local key file parsing", () => {
  test("maps friendly key labels to environment variable names without exposing values", () => {
    const parsed = parseLocalKeyText(`food-sz-geo:\ngeo-key\nfood-sz-geo secret key:\ngeo-secret\nfood-sz-web:\nweb-key\n`);

    expect(parsed).toEqual({
      TENCENT_MAP_GEOCODE_KEY: "geo-key",
      TENCENT_MAP_GEOCODE_SECRET: "geo-secret",
      VITE_TENCENT_MAP_WEB_KEY: "web-key"
    });
  });
});

describe("geocode request shaping", () => {
  test("keeps Shenzhen addresses and prefixes district-only addresses", () => {
    expect(buildGeocodeAddress({ address: "深圳市福田区车公庙工业区303栋二层西", district: "福田区" })).toBe(
      "深圳市福田区车公庙工业区303栋二层西"
    );
    expect(buildGeocodeAddress({ address: "车公庙工业区303栋二层西", district: "福田区" })).toBe(
      "深圳市福田区车公庙工业区303栋二层西"
    );
  });
});

describe("map focusing", () => {
  const baseUnit = {
    id: "sz-a-test",
    name: "测试餐厅",
    rawCategory: "社会餐饮",
    categoryGroup: "社会餐饮",
    address: "深圳市福田区测试路1号",
    district: "福田区",
    ratingYear: 2025,
    ratingLevel: "A",
    sourceUpdatedAt: "2025-06-30",
    location: { lat: 22.5431, lng: 114.0579 },
    geocodeStatus: "ok",
    geocodeConfidence: 0.95,
    sourceRow: 1
  } satisfies FoodSafetyUnit;

  test("builds a map focus target from the selected unit location", () => {
    expect(mapFocusTargetFor(baseUnit)).toEqual({
      center: { lat: 22.5431, lng: 114.0579 },
      zoom: 18
    });
  });

  test("does not focus the map when the selected unit has no location", () => {
    expect(mapFocusTargetFor({ ...baseUnit, location: null })).toBeNull();
  });
});
