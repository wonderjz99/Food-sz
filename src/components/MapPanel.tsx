import { LocateFixed, MapPinned, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SELECTED_UNIT_FOCUS_ZOOM } from "../data/mapFocus";
import type { FoodSafetyUnit } from "../types";

declare global {
  interface Window {
    TMap?: any;
  }
}

type MapPanelProps = {
  units: FoodSafetyUnit[];
  selectedUnit: FoodSafetyUnit | null;
  onSelectUnit: (unit: FoodSafetyUnit) => void;
  focusRequest?: number;
};

const TENCENT_MAP_KEY = __TENCENT_MAP_WEB_KEY__;
const TENCENT_SCRIPT_TIMEOUT_MS = 8000;
const MARKER_SVG_A =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="#08985a" fill-opacity="0.82" stroke="#ffffff" stroke-width="2"/></svg>'
  );
const MARKER_SVG_B =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="#e8a317" fill-opacity="0.82" stroke="#ffffff" stroke-width="2"/></svg>'
  );
const MARKER_SVG_C =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="6" fill="#d93838" fill-opacity="0.82" stroke="#ffffff" stroke-width="2"/></svg>'
  );

export function MapPanel({ units, selectedUnit, onSelectUnit, focusRequest }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tencentApiRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const [fallbackReason, setFallbackReason] = useState<"missing-key" | "load-failed" | null>(
    TENCENT_MAP_KEY ? null : "missing-key"
  );
  const [mapMode, setMapMode] = useState<"loading" | "tencent" | "preview">(
    TENCENT_MAP_KEY ? "loading" : "preview"
  );

  const locatedUnits = useMemo(() => units.filter((unit) => unit.location), [units]);
  const realLocatedUnits = useMemo(
    () => units.filter((unit) => unit.location && unit.geocodeStatus === "ok"),
    [units]
  );
  const previewUnits = useMemo(() => locatedUnits.slice(0, 120), [locatedUnits]);
  const reviewCount = units.length - realLocatedUnits.length;
  const canFocus = !!(selectedUnit?.location);
  const districtCounts = useMemo(() => {
    return units.reduce<Record<string, number>>((counts, unit) => {
      counts[unit.district] = (counts[unit.district] ?? 0) + 1;
      return counts;
    }, {});
  }, [units]);

  useEffect(() => {
    if (!TENCENT_MAP_KEY) {
      setFallbackReason("missing-key");
      setMapMode("preview");
      return;
    }

    if (!containerRef.current) {
      return;
    }

    let cancelled = false;
    loadTencentMap(TENCENT_MAP_KEY)
      .then(() => {
        if (cancelled || !containerRef.current || !window.TMap) {
          return;
        }

        tencentApiRef.current = window.TMap;
        const center = new tencentApiRef.current.LatLng(22.5431, 114.0579);
        mapRef.current = new tencentApiRef.current.Map(containerRef.current, {
          center,
          zoom: 13,
          pitch: 0,
          rotation: 0
        });
        setFallbackReason(null);
        setMapMode("tencent");
      })
      .catch(() => {
        setFallbackReason("load-failed");
        setMapMode("preview");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const TMap = tencentApiRef.current ?? window.TMap;
    if (mapMode !== "tencent" || !TMap || !mapRef.current) {
      return;
    }

    markerRef.current?.setMap?.(null);
    const geometries = realLocatedUnits.slice(0, 5000).map((unit) => ({
      id: unit.id,
      styleId: `marker-${(unit.ratingLevel || 'A').toLowerCase()}`,
      position: new TMap.LatLng(unit.location!.lat, unit.location!.lng),
      properties: { title: unit.name }
    }));

    markerRef.current = new TMap.MultiMarker({
      map: mapRef.current,
      styles: {
        "marker-a": new TMap.MarkerStyle({
          width: 18, height: 18, anchor: { x: 9, y: 9 }, src: MARKER_SVG_A
        }),
        "marker-b": new TMap.MarkerStyle({
          width: 18, height: 18, anchor: { x: 9, y: 9 }, src: MARKER_SVG_B
        }),
        "marker-c": new TMap.MarkerStyle({
          width: 18, height: 18, anchor: { x: 9, y: 9 }, src: MARKER_SVG_C
        }),
      },
      geometries
    });

    markerRef.current.on("click", (event: any) => {
      const unit = realLocatedUnits.find((item) => item.id === event.geometry.id);
      if (unit && unit.location) {
        onSelectUnit(unit);
        showInfoWindow(TMap, unit.name, unit.location);
      }
    });
  }, [realLocatedUnits, mapMode, onSelectUnit]);

  // Auto-focus map when search selects a unit
  useEffect(() => {
    if (!focusRequest || focusRequest <= 0 || !selectedUnit?.location) return;
    const TMap = tencentApiRef.current ?? window.TMap;
    if (mapMode !== "tencent" || !TMap || !mapRef.current) return;
    const center = new TMap.LatLng(selectedUnit.location.lat, selectedUnit.location.lng);
    if (typeof mapRef.current.easeTo === "function") {
      mapRef.current.easeTo({ center, zoom: 18 });
    } else {
      mapRef.current.setZoom?.(18);
      mapRef.current.panTo?.(center);
    }
    showInfoWindow(TMap, selectedUnit.name, selectedUnit.location);
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  function showInfoWindow(TMap: any, title: string, location: { lat: number; lng: number }) {
    infoWindowRef.current?.close();
    const el = document.createElement("div");
    el.innerHTML = `<div style="display:flex;align-items:center;gap:4px;padding:2px 4px 2px 6px;font-size:12px;font-weight:600;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,0.58);color:#fff;border-radius:3px;line-height:1.5"><span style="overflow:hidden;text-overflow:ellipsis">${title}</span><span id="_iw_x" style="cursor:pointer;font-size:15px;opacity:0.65;flex-shrink:0;line-height:1">×</span></div>`;
    infoWindowRef.current = new TMap.InfoWindow({
      map: mapRef.current,
      enableCustom: true,
      position: new TMap.LatLng(location.lat, location.lng),
      content: el.innerHTML,
      offset: { x: 0, y: -14 },
    });
    infoWindowRef.current.open();
    // close button
    setTimeout(() => {
      document.getElementById("_iw_x")?.addEventListener("click", () => infoWindowRef.current?.close());
    }, 50);
  }

  function focusSelectedUnit() {
    const TMap = tencentApiRef.current ?? window.TMap;
    if (!selectedUnit?.location || mapMode !== "tencent" || !TMap || !mapRef.current) {
      return;
    }

    const center = new TMap.LatLng(selectedUnit.location.lat, selectedUnit.location.lng);
    if (typeof mapRef.current.easeTo === "function") {
      mapRef.current.easeTo({ center, zoom: SELECTED_UNIT_FOCUS_ZOOM });
    } else {
      mapRef.current.setZoom?.(SELECTED_UNIT_FOCUS_ZOOM);
      mapRef.current.panTo?.(center);
    }

    showInfoWindow(TMap, selectedUnit.name, selectedUnit.location);
  }

  return (
    <section className="map-panel" aria-label="深圳地图">
      {mapMode === "loading" || mapMode === "tencent" ? (
        <div className={mapMode === "loading" ? "tencent-map tencent-map-loading" : "tencent-map"} ref={containerRef} />
      ) : null}
      {mapMode !== "tencent" ? (
        <PreviewMap
          units={previewUnits}
          selectedUnit={selectedUnit}
          districtCounts={districtCounts}
          onSelectUnit={onSelectUnit}
        />
      ) : null}

      {mapMode !== "tencent" ? (
        <div className="map-watermark">
          {mapMode === "loading"
            ? "腾讯地图加载中"
            : fallbackReason === "missing-key"
              ? "预览坐标 · 添加 Web Key 后切换腾讯地图"
              : "预览坐标 · 腾讯地图脚本加载失败"}
        </div>
      ) : null}
      {mapMode === "tencent" && reviewCount > 0 ? (
        <div className="map-watermark">
          腾讯地图 · 真实点位 {realLocatedUnits.length.toLocaleString()} / {units.length.toLocaleString()}
        </div>
      ) : null}

      <div className="map-layer-card">
        <label>
          <input type="radio" checked readOnly />
          默认图层
        </label>
        <label>
          <input type="radio" readOnly />
          热力图层
        </label>
        <label>
          <input type="radio" readOnly />
          各区概况
        </label>
      </div>

      <div className="zoom-control" aria-label="地图控制">
        <button type="button" aria-label="放大地图">
          <Plus size={18} />
        </button>
        <button type="button" aria-label="缩小地图">
          <Minus size={18} />
        </button>
        <button
          type="button"
          aria-label={selectedUnit ? `定位到${selectedUnit.name}` : "定位到选中单位"}
          disabled={!canFocus}
          onClick={focusSelectedUnit}
        >
          <LocateFixed size={18} />
        </button>
      </div>
    </section>
  );
}

function PreviewMap({
  units,
  selectedUnit,
  districtCounts,
  onSelectUnit
}: {
  units: FoodSafetyUnit[];
  selectedUnit: FoodSafetyUnit | null;
  districtCounts: Record<string, number>;
  onSelectUnit: (unit: FoodSafetyUnit) => void;
}) {
  return (
    <div className="preview-map">
      <div className="shenzhen-shape">
        <div className="district-label district-label-one">
          龙岗区 <strong>{districtCounts["龙岗区"] ?? 0}</strong>
        </div>
        <div className="district-label district-label-two">
          宝安区 <strong>{districtCounts["宝安区"] ?? 0}</strong>
        </div>
        <div className="district-label district-label-three">
          南山区 <strong>{districtCounts["南山区"] ?? 0}</strong>
        </div>
        <div className="district-label district-label-four">
          福田区 <strong>{districtCounts["福田区"] ?? 0}</strong>
        </div>
        <div className="district-label district-label-five">
          罗湖区 <strong>{districtCounts["罗湖区"] ?? 0}</strong>
        </div>

        {units.map((unit, index) => (
          <button
            type="button"
            key={unit.id}
            className={selectedUnit?.id === unit.id ? "map-marker selected" : "map-marker"}
            style={markerStyle(index, units.length)}
            title={unit.name}
            onClick={() => onSelectUnit(unit)}
          >
            {index % 17 === 0 ? <span>{Math.max(9, Math.round(index / 3))}</span> : <MapPinned size={13} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function markerStyle(index: number, total: number): React.CSSProperties {
  const column = index % 29;
  const row = Math.floor(index / 29);
  const x = 8 + ((column * 3.2 + (row % 4) * 1.1) % 84);
  const y = 12 + ((row * 6.6 + (column % 5) * 1.8) % 70);
  const size = index % 17 === 0 ? 42 : 30;
  return {
    left: `${Math.min(x, 92)}%`,
    top: `${Math.min(y, 82)}%`,
    width: size,
    height: size,
    zIndex: total - index
  };
}

function loadTencentMap(key: string): Promise<void> {
  if (window.TMap) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>("script[data-tencent-map]");
  if (existing) {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Tencent map script timed out")), TENCENT_SCRIPT_TIMEOUT_MS);
      existing.addEventListener("load", () => {
        window.clearTimeout(timeout);
        resolve();
      });
      existing.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Tencent map script failed"));
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => reject(new Error("Tencent map script timed out")), TENCENT_SCRIPT_TIMEOUT_MS);
    script.dataset.tencentMap = "true";
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Tencent map script failed"));
    };
    document.head.appendChild(script);
  });
}
