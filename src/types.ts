export type CategoryGroup =
  | "社会餐饮"
  | "学校/幼儿园"
  | "连锁餐饮"
  | "单位食堂"
  | "集配/中央厨房"
  | "其他餐饮";

export type GeocodeStatus = "pending" | "ok" | "failed" | "review";

export type LocationPoint = {
  lat: number;
  lng: number;
};

export type FoodSafetyUnit = {
  id: string;
  name: string;
  rawCategory: string;
  categoryGroup: CategoryGroup;
  address: string;
  district: string;
  ratingYear: number;
  ratingLevel: "A" | "B" | "C";
  riskLevel?: string;
  sourceUpdatedAt: string;
  location: LocationPoint | null;
  geocodeStatus: GeocodeStatus;
  geocodeConfidence: number | null;
  sourceRow: number;
};

export type DatasetSummary = {
  sourceUpdatedAt: string;
  total: number;
  withLocation: number;
  byCategoryGroup: Record<string, number>;
  byRawCategory: Record<string, number>;
  byDistrict: Record<string, number>;
  byRatingYear: Record<string, number>;
  byRatingLevel: Record<string, number>;
};

export type ParsedWorkbook = {
  sourceUpdatedAt: string;
  units: FoodSafetyUnit[];
  summary: DatasetSummary;
};

export type UnitFilters = {
  categoryGroup?: CategoryGroup | "全部";
  rawCategory?: string;
  ratingLevel?: "A" | "B" | "C" | "全部";
  districts?: Set<string>;
  yearRange?: [number, number];
  query?: string;
};

export type GeocodeCacheRecord = {
  unitId: string;
  address: string;
  queryAddress?: string;
  location: LocationPoint | null;
  status: "ok" | "failed";
  confidence: number;
  source: "tencent" | "amap" | "preview";
  updatedAt: string;
  raw?: unknown;
};

export type GeocodeCache = Record<string, GeocodeCacheRecord>;
