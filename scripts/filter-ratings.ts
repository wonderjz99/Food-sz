import fs from "node:fs";

type RatingRecord = {
  jcbhgx: string;
  jydz: string;
  lhdj: string;
  lhfxdj: string;
  pjsj: string;
  pjsj_end: string;
  pjsj_start: string;
  qymc: string;
  shxydm: string;
  ssfjmc: string;
  xkzbh: string;
};

const INPUT = "data/all-ratings.jsonl";
const OUTPUT = "data/filtered-ratings.jsonl";
const SUMMARY = "data/filtered-summary.json";

const SINCE = "2025-01-01";
const EXCLUDE_LEVELS = new Set(["未评级"]);

console.log(`读取 ${INPUT} ...`);
const raw = fs.readFileSync(INPUT, "utf8");
const lines = raw.trim().split("\n").filter(Boolean);

let skippedLevel = 0;
let skippedDate = 0;
const passed: RatingRecord[] = [];

for (const line of lines) {
  let record: RatingRecord;
  try {
    record = JSON.parse(line);
  } catch {
    continue;
  }

  if (EXCLUDE_LEVELS.has(record.lhdj)) {
    skippedLevel++;
    continue;
  }
  if (record.pjsj < SINCE) {
    skippedDate++;
    continue;
  }
  passed.push(record);
}

console.log(`  排除未评级: ${skippedLevel.toLocaleString()}`);
console.log(`  排除 ${SINCE} 前: ${skippedDate.toLocaleString()}`);

// 去重：按许可证编号，保留最新
const byLicense = new Map<string, RatingRecord>();
for (const r of passed) {
  const key = r.xkzbh || r.shxydm || r.qymc;
  const old = byLicense.get(key);
  if (!old || r.pjsj > old.pjsj) byLicense.set(key, r);
}
const deduped = Array.from(byLicense.values());

// 统计
const levels: Record<string, number> = {};
const years: Record<string, number> = {};
const districts: Record<string, number> = {};
let dMin = deduped[0]?.pjsj ?? "";
let dMax = dMin;

for (const r of deduped) {
  levels[r.lhdj] = (levels[r.lhdj] ?? 0) + 1;
  years[r.pjsj.slice(0, 4)] = (years[r.pjsj.slice(0, 4)] ?? 0) + 1;
  districts[r.ssfjmc] = (districts[r.ssfjmc] ?? 0) + 1;
  if (r.pjsj < dMin) dMin = r.pjsj;
  if (r.pjsj > dMax) dMax = r.pjsj;
}

// 写入
const outputLines = deduped.map((r) => JSON.stringify(r));
fs.writeFileSync(OUTPUT, outputLines.join("\n") + "\n");

const mb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);

fs.writeFileSync(
  SUMMARY,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      since: SINCE,
      totalInput: lines.length,
      skippedLevel,
      skippedDate,
      deduped: deduped.length,
      dateRange: { min: dMin, max: dMax },
      levels,
      years,
      topDistricts: Object.entries(districts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([n, c]) => ({ name: n, count: c })),
    },
    null,
    2
  )
);

console.log(`\n✅ 筛选完成`);
console.log(`  去重后: ${deduped.length.toLocaleString()} 条`);
console.log(`  文件: ${OUTPUT} (${mb} MB)`);
console.log(`  摘要: ${SUMMARY}`);
console.log(`  日期: ${dMin} ~ ${dMax}`);
console.log(`  等级: ${Object.entries(levels).map(([k,v]) => k+':'+v.toLocaleString()).join('  ')}`);
