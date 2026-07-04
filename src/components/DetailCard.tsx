import { Copy, ExternalLink, MapPin, Navigation, Star } from "lucide-react";
import type { FoodSafetyUnit } from "../types";

type DetailCardProps = {
  unit: FoodSafetyUnit | null;
};

export function DetailCard({ unit }: DetailCardProps) {
  if (!unit) {
    return (
      <section className="detail-card empty-detail">
        <strong>选择一个餐饮单位</strong>
        <span>点击地图点位或右侧列表，查看地址、等级、类别、辖区和评级年份。</span>
      </section>
    );
  }

  const selectedUnit = unit;
  const mapUrl = `https://map.qq.com/?type=poi&what=${encodeURIComponent(selectedUnit.address)}&city=${encodeURIComponent(selectedUnit.district)}`;
  const locationLabel = selectedUnit.geocodeStatus === "ok"
    ? `真实坐标 · 置信度 ${Math.round((selectedUnit.geocodeConfidence ?? 0) * 100)}%`
    : "坐标待复核";

  async function copyAddress() {
    await navigator.clipboard?.writeText(selectedUnit.address);
  }

  return (
    <section className="detail-card" aria-label="单位详情">
      <div className={`detail-image rating-${selectedUnit.ratingLevel.toLowerCase()}`} aria-hidden="true">
        <span>{selectedUnit.ratingLevel}</span>
        <strong>{selectedUnit.ratingLevel === 'A' ? '大笑' : selectedUnit.ratingLevel === 'B' ? '微笑' : '平脸'}</strong>
      </div>
      <div className="detail-content">
        <div className="detail-heading">
          <h2>{selectedUnit.name}</h2>
          <span className={`rating-badge rating-${selectedUnit.ratingLevel.toLowerCase()}`}>{selectedUnit.ratingLevel}级</span>
        </div>
        <p>
          <MapPin size={16} />
          地址：{selectedUnit.address}
        </p>
        <p>所属辖区：{selectedUnit.district}</p>
        <p>类别：{selectedUnit.rawCategory} · {selectedUnit.categoryGroup}</p>
        {selectedUnit.riskLevel ? <p>风险等级：{selectedUnit.riskLevel} 级</p> : null}
        <p>评级年份：{selectedUnit.ratingYear} 年</p>
        <p>定位状态：{locationLabel}</p>
      </div>
      <div className="detail-actions">
        <a className="primary-action" href={mapUrl} target="_blank" rel="noreferrer">
          <Navigation size={16} />
          导航
        </a>
        <button type="button" onClick={copyAddress}>
          <Copy size={16} />
          复制地址
        </button>
        <button type="button">
          <Star size={16} />
          收藏
        </button>
        <a href={mapUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          腾讯地图
        </a>
      </div>
    </section>
  );
}
