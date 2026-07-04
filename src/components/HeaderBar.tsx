import { Share2, ShieldCheck } from "lucide-react";
import { SearchBar } from "./SearchBar";
import type { FoodSafetyUnit } from "../types";

type HeaderBarProps = {
  sourceUpdatedAt?: string;
  onSearchSelect?: (unit: Partial<FoodSafetyUnit> & { hasGeocode: boolean }) => void;
};

export function HeaderBar({ sourceUpdatedAt, onSearchSelect }: HeaderBarProps) {
  return (
    <header className="header-bar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <ShieldCheck size={28} strokeWidth={2.2} />
          <span>食</span>
        </div>
        <div>
          <h1>深圳餐饮量化等级地图</h1>
          <p>安心餐饮 · 健康深圳</p>
        </div>
      </div>

      <nav className="top-nav" aria-label="主导航">
        <span className="nav-item active">地图</span>
        <span className="nav-item">公示榜单</span>
        <span className="nav-item">数据说明</span>
      </nav>

      {onSearchSelect && <SearchBar onSelect={onSearchSelect} />}

      <div className="header-actions">
        <span>更新 {sourceUpdatedAt ?? "--"}</span>
        <button type="button" className="icon-text-button">
          <Share2 size={16} />
          分享
        </button>
      </div>
    </header>
  );
}
