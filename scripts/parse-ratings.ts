import fs from "node:fs";
import type { FoodSafetyUnit, DatasetSummary } from "../src/types";

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

const INPUT = "data/filtered-ratings.jsonl";
const OUTPUT = "data/parsed-ratings.json";

// ssfjmc → district name mapping
const DISTRICT_MAP: Record<string, string> = {
  "福田局": "福田区",
  "罗湖局": "罗湖区",
  "南山局": "南山区",
  "盐田局": "盐田区",
  "宝安局": "宝安区",
  "龙岗局": "龙岗区",
  "龙华局": "龙华区",
  "坪山局": "坪山区",
  "光明局": "光明区",
  "大鹏局": "大鹏新区",
  "深汕局": "深汕合作区",
};

// Category group derivation from qymc keywords (checked in order)
function deriveCategoryGroup(name: string): string {
  if (/幼儿园|学校|小学|中学|大学|学院/.test(name)) return "学校/幼儿园";
  if (/连锁/.test(name)) return "连锁餐饮";
  if (/食堂|职工|员工|饭堂/.test(name)) return "单位食堂";
  if (/配送|集配|中央厨房/.test(name)) return "集配/中央厨房";
  if (/餐饮|餐厅|饭店|酒楼|小吃|快餐|粉店|面馆|火锅|烧烤|烘焙|奶茶|咖啡|茶饮|蛋糕|面包|大排档|粥|菜馆|肠粉|麻辣烫/.test(name)) return "社会餐饮";
  return "其他餐饮";
}

// Raw category from qymc name ending (last 3-5 chars)
function deriveRawCategory(name: string): string {
  const n = name.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "");
  const endings: [RegExp, string][] = [
    [/烧烤店$/, "烧烤"],
    [/火锅店$/, "火锅"],
    [/麻辣烫店$/, "麻辣烫"],
    [/猪脚饭店$/, "猪脚饭"],
    [/肠粉店$/, "肠粉"],
    [/汤粉店$/, "汤粉"],
    [/快餐店$/, "快餐"],
    [/小吃店$/, "小吃"],
    [/饮品店$/, "饮品"],
    [/奶茶店$/, "奶茶"],
    [/咖啡店$/, "咖啡"],
    [/面包店$/, "面包"],
    [/蛋糕店$/, "蛋糕"],
    [/烘焙店$/, "烘焙"],
    [/面馆$/, "面馆"],
    [/粉店$/, "粉店"],
    [/粥店$/, "粥店"],
    [/菜馆$/, "菜馆"],
    [/饭店$/, "饭店"],
    [/餐厅$/, "餐厅"],
    [/酒楼$/, "酒楼"],
    [/大排档$/, "大排档"],
    [/便利店$/, "便利店"],
    [/食堂$/, "食堂"],
    [/酒店/, "含酒店"],
  ];
  for (const [re, cat] of endings) {
    if (re.test(n)) return cat;
  }
  return "一般餐饮";
}

// Normalize address: strip "广东省" prefix, unify to "深圳市..." format
function normalizeAddress(addr: string): string {
  return addr.replace(/^广东省/, "").trim();
}

function main(): void {
  console.log(`读取 ${INPUT} ...`);
  const raw = fs.readFileSync(INPUT, "utf8");
  const lines = raw.trim().split("\n").filter(Boolean);

  const units: FoodSafetyUnit[] = [];
  let latestDate = "";
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const r: RatingRecord = JSON.parse(lines[i]);
      const district = DISTRICT_MAP[r.ssfjmc] || r.ssfjmc;
      const year = parseInt(r.pjsj.slice(0, 4), 10) || 0;
      if (r.pjsj > latestDate) latestDate = r.pjsj;

      units.push({
        id: r.xkzbh,
        name: r.qymc,
        rawCategory: deriveRawCategory(r.qymc),
        categoryGroup: deriveCategoryGroup(r.qymc) as FoodSafetyUnit["categoryGroup"],
        address: normalizeAddress(r.jydz),
        district,
        ratingYear: year,
        ratingLevel: r.lhdj as "A" | "B" | "C",
        riskLevel: r.lhfxdj,
        sourceUpdatedAt: latestDate,
        location: null,
        geocodeStatus: "pending",
        geocodeConfidence: null,
        sourceRow: i + 1,
      });
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Summarize
  const summary: DatasetSummary = {
    sourceUpdatedAt: latestDate,
    total: units.length,
    withLocation: 0,
    byCategoryGroup: countBy(units, (u) => u.categoryGroup),
    byRawCategory: countBy(units, (u) => u.rawCategory),
    byDistrict: countBy(units, (u) => u.district),
    byRatingYear: countBy(units, (u) => String(u.ratingYear)),
    byRatingLevel: countBy(units, (u) => u.ratingLevel),
  };

  fs.writeFileSync(OUTPUT, JSON.stringify({ units, summary }, null, 2));
  const mb = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);

  console.log(`✅ 解析完成`);
  console.log(`  记录数: ${units.length.toLocaleString()}`);
  console.log(`  文件: ${OUTPUT} (${mb} MB)`);
  console.log(`  日期范围: 2025-01 ~ ${latestDate}`);
  console.log(`  辖区: ${Object.keys(DISTRICT_MAP).length} 个`);
  console.log(`  等级: A=${summary.byRatingLevel["A"]?.toLocaleString()} B=${summary.byRatingLevel["B"]?.toLocaleString()} C=${summary.byRatingLevel["C"]?.toLocaleString()}`);
  console.log(`  类别组: ${Object.keys(summary.byCategoryGroup).length} 类`);
  if (errors.length > 0) {
    console.log(`  ⚠️ 错误行: ${errors.length} (前3条: ${errors.slice(0, 3).join("; ")})`);
  }
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, DISTRICT_MAP, deriveCategoryGroup, deriveRawCategory, normalizeAddress };
