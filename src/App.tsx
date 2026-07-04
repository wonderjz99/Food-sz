import { useMemo, useState } from "react";
import { HeaderBar } from "./components/HeaderBar";
import { SidebarFilters } from "./components/SidebarFilters";
import { StatsBar } from "./components/StatsBar";
import { MapPanel } from "./components/MapPanel";
import { DetailCard } from "./components/DetailCard";
import { UnitList } from "./components/UnitList";
import { useDataset } from "./data/useDataset";
import { filterUnits } from "./data/filtering";
import type { FoodSafetyUnit, UnitFilters } from "./types";

function App() {
  const dataset = useDataset();
  const units = dataset.units;
  const yearBounds = useMemo<[number, number]>(() => {
    if (units.length === 0) {
      return [2025, 2026];
    }
    let min = Infinity, max = -Infinity;
    for (const u of units) {
      if (u.ratingYear < min) min = u.ratingYear;
      if (u.ratingYear > max) max = u.ratingYear;
    }
    return [min === Infinity ? 2025 : min, max === -Infinity ? 2026 : max];
  }, [units]);

  const [filters, setFilters] = useState<UnitFilters>({
    categoryGroup: "全部",
    rawCategory: "全部",
    ratingLevel: "全部",
    districts: new Set(),
    yearRange: yearBounds,
    query: ""
  });
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [searchedUnit, setSearchedUnit] = useState<FoodSafetyUnit | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const rawCategories = useMemo(() => {
    return [...new Set(units.map((unit) => unit.rawCategory))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [units]);

  const districts = useMemo(() => {
    return [...new Set(units.map((unit) => unit.district))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [units]);

  const effectiveFilters = useMemo(() => {
    return {
      ...filters,
      yearRange: filters.yearRange ?? yearBounds
    };
  }, [filters, yearBounds]);

  const filteredUnits = useMemo(() => filterUnits(units, effectiveFilters), [units, effectiveFilters]);
  const selectedUnit = useMemo(() => {
    // Search result takes priority
    if (searchedUnit && searchedUnit.id === selectedUnitId) return searchedUnit;
    return filteredUnits.find((unit) => unit.id === selectedUnitId) ?? filteredUnits[0] ?? null;
  }, [filteredUnits, selectedUnitId, searchedUnit]);

  function selectUnit(unit: FoodSafetyUnit) {
    setSelectedUnitId(unit.id);
    setSearchedUnit(null);
  }

  if (dataset.status === "loading") {
    return <div className="app-loading">正在加载深圳餐饮量化等级数据...</div>;
  }

  if (dataset.status === "error") {
    return (
      <div className="app-loading error-state">
        <strong>数据加载失败</strong>
        <span>{dataset.error}</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <HeaderBar
        sourceUpdatedAt={dataset.summary.sourceUpdatedAt}
        onSearchSelect={(partial) => {
          const unit = dataset.units.find((u) => u.id === partial.id);
          const target = unit ?? {
            id: partial.id ?? "",
            name: partial.name ?? "",
            rawCategory: "",
            categoryGroup: "其他餐饮",
            address: partial.address ?? "",
            district: partial.district ?? "",
            ratingYear: partial.ratingYear ?? 2026,
            ratingLevel: (partial.ratingLevel ?? "A") as FoodSafetyUnit["ratingLevel"],
            sourceUpdatedAt: "",
            location: null,
            geocodeStatus: "pending" as const,
            geocodeConfidence: null,
            sourceRow: 0,
          };
          setSearchedUnit(target);
          setSelectedUnitId(target.id);
          setFocusRequest((n) => n + 1);
        }}
      />
      <main className="dashboard">
        <SidebarFilters
          filters={effectiveFilters}
          summary={dataset.summary}
          rawCategories={rawCategories}
          districts={districts}
          yearBounds={yearBounds}
          onChange={setFilters}
        />
        <section className="map-workspace">
          <StatsBar summary={dataset.summary} filteredUnits={filteredUnits} />
          <MapPanel units={filteredUnits} selectedUnit={selectedUnit} onSelectUnit={selectUnit} focusRequest={focusRequest} />
          <DetailCard unit={selectedUnit} />
        </section>
        <UnitList units={filteredUnits} selectedUnit={selectedUnit} onSelectUnit={selectUnit} />
      </main>
      <footer className="source-footer">
        数据来源：深圳市市场监督管理局餐饮单位食品安全量化等级查询系统。绿/黄/红分别表示 A/B/C 级。仅绘制已地理编码的真实点位。
      </footer>
    </div>
  );
}

export default App;
