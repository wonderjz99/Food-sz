import { geocodeAmap } from "./geocode-amap";
import { applyLocalKeysToProcessEnv } from "./local-keys";

const DAILY_LIMIT = 5000;
const DELAY_MS = 200;
const CONCURRENCY = 5;

async function main(): Promise<void> {
  applyLocalKeysToProcessEnv();
  const keys = [
    process.env.AMAP_GEOCODE_KEY,
    process.env.AMAP_GEOCODE_KEY_2,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    console.error("未找到任何高德 key，请在 key.txt 中配置 foodsz-amap1 和 shenzhen-food");
    process.exit(1);
  }

  console.log(`=== 每日地理编码任务 ===`);
  console.log(`可用 key: ${keys.length} 个`);
  console.log(`每个 key 上限: ${DAILY_LIMIT} 条`);
  console.log(`总上限: ${DAILY_LIMIT * keys.length} 条`);
  console.log("");

  for (let i = 0; i < keys.length; i++) {
    console.log(`--- Key ${i + 1}/${keys.length} ---`);
    const start = Date.now();
    try {
      await geocodeAmap({ limit: DAILY_LIMIT, delayMs: DELAY_MS, retries: 2, concurrency: CONCURRENCY, key: keys[i] });
    } catch (err) {
      console.error(`Key ${i + 1} 失败:`, err instanceof Error ? err.message : String(err));
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`Key ${i + 1} 耗时: ${elapsed}s`);
    console.log("");
  }
  console.log(`下一步: pnpm run data:build 重新构建公共数据`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("每日任务失败:", error);
    process.exit(1);
  });
}

export { main };
