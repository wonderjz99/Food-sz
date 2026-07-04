import type { FoodSafetyUnit, LocationPoint } from "../types";

export const SELECTED_UNIT_FOCUS_ZOOM = 18;

export type MapFocusTarget = {
  center: LocationPoint;
  zoom: number;
};

export function mapFocusTargetFor(
  unit: Pick<FoodSafetyUnit, "location"> | null | undefined,
  zoom = SELECTED_UNIT_FOCUS_ZOOM
): MapFocusTarget | null {
  if (!unit?.location) {
    return null;
  }

  return {
    center: unit.location,
    zoom
  };
}
