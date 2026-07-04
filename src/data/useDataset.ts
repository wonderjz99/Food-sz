import { useEffect, useState } from "react";
import type { DatasetSummary, FoodSafetyUnit } from "../types";

type DatasetState =
  | { status: "loading"; units: FoodSafetyUnit[]; summary: null; error: null }
  | { status: "ready"; units: FoodSafetyUnit[]; summary: DatasetSummary; error: null }
  | { status: "error"; units: FoodSafetyUnit[]; summary: null; error: string };

export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({
    status: "loading",
    units: [],
    summary: null,
    error: null
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDataset() {
      try {
        // Prefer lightweight geocoded dataset; fall back to full
        const [unitsResponse, summaryResponse] = await Promise.all([
          fetch("/data/units-geo.json").then((r) => (r.ok ? r : fetch("/data/units.json"))),
          fetch("/data/summary-geo.json").then((r) => (r.ok ? r : fetch("/data/summary.json")))
        ]);

        if (!unitsResponse.ok || !summaryResponse.ok) {
          throw new Error("数据文件加载失败，请先运行 pnpm run data:build");
        }

        const [units, summary] = (await Promise.all([
          unitsResponse.json(),
          summaryResponse.json()
        ])) as [FoodSafetyUnit[], DatasetSummary];

        if (!cancelled) {
          setState({ status: "ready", units, summary, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            units: [],
            summary: null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    loadDataset();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
