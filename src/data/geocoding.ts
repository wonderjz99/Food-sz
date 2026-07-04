import type { GeocodeCache, GeocodeCacheRecord, LocationPoint } from "../types";

export const SHENZHEN_BOUNDS = {
  minLat: 22.35,
  maxLat: 22.9,
  minLng: 113.7,
  maxLng: 114.65
};

export function isInsideShenzhenBounds(location: LocationPoint | null): boolean {
  if (!location) {
    return false;
  }

  return (
    location.lat >= SHENZHEN_BOUNDS.minLat &&
    location.lat <= SHENZHEN_BOUNDS.maxLat &&
    location.lng >= SHENZHEN_BOUNDS.minLng &&
    location.lng <= SHENZHEN_BOUNDS.maxLng
  );
}

export function shouldReviewGeocode(record: Pick<GeocodeCacheRecord, "status" | "confidence" | "location">): boolean {
  if (record.status !== "ok") {
    return true;
  }

  if (!isInsideShenzhenBounds(record.location)) {
    return true;
  }

  return record.confidence < 0.7;
}

export function readCacheRecord(cache: GeocodeCache, unitId: string): GeocodeCacheRecord | undefined {
  return cache[unitId];
}

export function normalizeGeocodeAddress(address: string): string {
  return address.trim().replace(/\s+/g, "");
}

export function findReusableGeocodeRecord(
  cache: GeocodeCache,
  queryAddress: string
): GeocodeCacheRecord | undefined {
  const normalizedQueryAddress = normalizeGeocodeAddress(queryAddress);
  return Object.values(cache).find((record) => {
    if (record.status !== "ok" || !record.location) {
      return false;
    }

    return normalizeGeocodeAddress(record.queryAddress ?? record.address) === normalizedQueryAddress;
  });
}
