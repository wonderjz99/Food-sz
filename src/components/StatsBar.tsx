import { Building2, CalendarClock, MapPinned, Utensils } from "lucide-react";
import type { DatasetSummary, FoodSafetyUnit } from "../types";

type StatsBarProps = {
  summary: DatasetSummary | null;
  filteredUnits: FoodSafetyUnit[];
};

export function StatsBar({ summary, filteredUnits }: StatsBarProps) {
  const aTotal = filteredUnits.filter((u) => u.ratingLevel === "A").length;
  const bTotal = filteredUnits.filter((u) => u.ratingLevel === "B").length;
  const cTotal = filteredUnits.filter((u) => u.ratingLevel === "C").length;
  const selectedRealLocations = filteredUnits.filter((unit) => unit.location && unit.geocodeStatus === "ok").length;
  const latestYear = filteredUnits.reduce((max, unit) => Math.max(max, unit.ratingYear), 0);

  return (
    <section className="stats-bar" aria-label="地图统计">
      <StatItem icon={<Utensils size={22} />} label="当前筛选" value={`${filteredUnits.length.toLocaleString()} 家`} />
      <StatItem icon={<MapPinned size={22} />} label="真实坐标" value={`${selectedRealLocations.toLocaleString()} 家`} />
      <StatItem icon={<Building2 size={22} />} label="A / B / C" value={`${aTotal.toLocaleString()} / ${bTotal.toLocaleString()} / ${cTotal.toLocaleString()}`} />
      <StatItem icon={<CalendarClock size={22} />} label="最近评级" value={latestYear ? `${latestYear} 年` : "--"} />
    </section>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="stat-item">
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
