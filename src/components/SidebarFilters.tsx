import { RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { CATEGORY_GROUPS } from "../data/categories";
import type { CategoryGroup, DatasetSummary, UnitFilters } from "../types";

type SidebarFiltersProps = {
  filters: UnitFilters;
  summary: DatasetSummary | null;
  rawCategories: string[];
  districts: string[];
  yearBounds: [number, number];
  onChange: (filters: UnitFilters) => void;
};

export function SidebarFilters({
  filters,
  summary,
  rawCategories,
  districts,
  yearBounds,
  onChange
}: SidebarFiltersProps) {
  const selectedDistricts = filters.districts ?? new Set<string>();
  const [minYear, maxYear] = yearBounds;
  const [startYear, endYear] = filters.yearRange ?? yearBounds;

  function toggleDistrict(district: string) {
    const next = new Set(selectedDistricts);
    if (district === "全部") {
      next.clear();
    } else if (next.has(district)) {
      next.delete(district);
    } else {
      next.add(district);
    }
    onChange({ ...filters, districts: next });
  }

  function reset() {
    onChange({
      categoryGroup: "全部",
      rawCategory: "全部",
      ratingLevel: "全部",
      districts: new Set(),
      yearRange: yearBounds,
      query: ""
    });
  }

  return (
    <aside className="sidebar" aria-label="筛选条件">
      <div className="sidebar-title">
        <SlidersHorizontal size={18} />
        <span>筛选</span>
      </div>

      <label className="search-field">
        <Search size={16} />
        <input
          value={filters.query ?? ""}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="搜索餐饮单位、地址"
        />
      </label>

      <section className="filter-section">
        <h2>类别</h2>
        <button
          type="button"
          className={filters.categoryGroup === "全部" ? "filter-row selected" : "filter-row"}
          onClick={() => onChange({ ...filters, categoryGroup: "全部" })}
        >
          <span>全部类别</span>
          <strong>{summary?.total.toLocaleString() ?? "--"}</strong>
        </button>
        {CATEGORY_GROUPS.map((group) => (
          <button
            type="button"
            key={group}
            className={filters.categoryGroup === group ? "filter-row selected" : "filter-row"}
            onClick={() => onChange({ ...filters, categoryGroup: group })}
          >
            <span>{group}</span>
            <strong>{summary?.byCategoryGroup[group]?.toLocaleString() ?? "0"}</strong>
          </button>
        ))}
      </section>

      <section className="filter-section">
        <h2>原始类别</h2>
        <select
          value={filters.rawCategory ?? "全部"}
          onChange={(event) => onChange({ ...filters, rawCategory: event.target.value })}
        >
          <option value="全部">全部原始类别</option>
          {rawCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </section>

      <section className="filter-section">
        <h2>量化等级</h2>
        <div className="district-grid">
          <button
            type="button"
            className={(filters.ratingLevel ?? "全部") === "全部" ? "district-chip selected" : "district-chip"}
            onClick={() => onChange({ ...filters, ratingLevel: "全部" })}
          >
            全部
          </button>
          {(["A", "B", "C"] as const).map((level) => (
            <button
              type="button"
              key={level}
              className={filters.ratingLevel === level ? "district-chip selected" : "district-chip"}
              onClick={() => onChange({ ...filters, ratingLevel: level })}
            >
              {level}级 ({summary?.byRatingLevel[level]?.toLocaleString() ?? "0"})
            </button>
          ))}
        </div>
      </section>

      <section className="filter-section">
        <h2>辖区</h2>
        <div className="district-grid">
          <button
            type="button"
            className={selectedDistricts.size === 0 ? "district-chip selected" : "district-chip"}
            onClick={() => toggleDistrict("全部")}
          >
            全部
          </button>
          {districts.map((district) => (
            <button
              type="button"
              key={district}
              className={selectedDistricts.has(district) ? "district-chip selected" : "district-chip"}
              onClick={() => toggleDistrict(district)}
            >
              {district}
            </button>
          ))}
        </div>
      </section>

      <section className="filter-section">
        <h2>评级年份</h2>
        <div className="year-row">
          <select
            value={startYear}
            onChange={(event) => onChange({ ...filters, yearRange: [Number(event.target.value), endYear] })}
          >
            {yearOptions(minYear, maxYear).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <span>至</span>
          <select
            value={endYear}
            onChange={(event) => onChange({ ...filters, yearRange: [startYear, Number(event.target.value)] })}
          >
            {yearOptions(minYear, maxYear).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </section>

      <button type="button" className="reset-button" onClick={reset}>
        <RotateCcw size={16} />
        重置筛选
      </button>
    </aside>
  );
}

function yearOptions(minYear: number, maxYear: number): number[] {
  const years: number[] = [];
  for (let year = minYear; year <= maxYear; year += 1) {
    years.push(year);
  }
  return years;
}
