import { ListFilter, Star } from "lucide-react";
import type { FoodSafetyUnit } from "../types";

type UnitListProps = {
  units: FoodSafetyUnit[];
  selectedUnit: FoodSafetyUnit | null;
  onSelectUnit: (unit: FoodSafetyUnit) => void;
};

export function UnitList({ units, selectedUnit, onSelectUnit }: UnitListProps) {
  const visibleUnits = units.slice(0, 80);

  return (
    <aside className="unit-list" aria-label="筛选结果">
      <div className="unit-list-header">
        <div>
          <span>附近 / 结果</span>
          <strong>{units.length.toLocaleString()} 家</strong>
        </div>
        <ListFilter size={18} />
      </div>

      <div className="unit-list-scroll">
        {visibleUnits.map((unit) => (
          <button
            type="button"
            key={unit.id}
            className={selectedUnit?.id === unit.id ? "unit-row selected" : "unit-row"}
            onClick={() => onSelectUnit(unit)}
          >
            <span className={`row-accent ${unit.ratingLevel === 'B' ? 'rating-b' : unit.ratingLevel === 'C' ? 'rating-c' : ''}`} />
            <span className="row-main">
              <strong>{unit.name}</strong>
              <small>
                {unit.district} · {unit.ratingYear} 年 · {unit.rawCategory}
              </small>
            </span>
            <span className={`rating-badge rating-${unit.ratingLevel.toLowerCase()}`}>{unit.ratingLevel}级</span>
            <Star size={15} />
          </button>
        ))}
      </div>
    </aside>
  );
}
