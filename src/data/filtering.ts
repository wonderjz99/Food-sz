import type { FoodSafetyUnit, UnitFilters } from "../types";

export function filterUnits(units: FoodSafetyUnit[], filters: UnitFilters): FoodSafetyUnit[] {
  const query = filters.query?.trim().toLowerCase() ?? "";

  return units.filter((unit) => {
    if (
      filters.categoryGroup &&
      filters.categoryGroup !== "全部" &&
      unit.categoryGroup !== filters.categoryGroup
    ) {
      return false;
    }

    if (filters.rawCategory && filters.rawCategory !== "全部" && unit.rawCategory !== filters.rawCategory) {
      return false;
    }

    if (filters.ratingLevel && filters.ratingLevel !== "全部" && unit.ratingLevel !== filters.ratingLevel) {
      return false;
    }

    if (filters.districts && filters.districts.size > 0 && !filters.districts.has(unit.district)) {
      return false;
    }

    if (filters.yearRange) {
      const [startYear, endYear] = filters.yearRange;
      if (unit.ratingYear < startYear || unit.ratingYear > endYear) {
        return false;
      }
    }

    if (query) {
      const haystack = `${unit.name} ${unit.address} ${unit.rawCategory} ${unit.district}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}
