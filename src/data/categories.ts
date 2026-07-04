import type { CategoryGroup } from "../types";

export const CATEGORY_GROUPS: CategoryGroup[] = [
  "社会餐饮",
  "学校/幼儿园",
  "连锁餐饮",
  "单位食堂",
  "集配/中央厨房",
  "其他餐饮"
];

export function categoryGroupFor(rawCategory: string): CategoryGroup {
  const value = rawCategory.trim();

  if (value.includes("社会餐饮")) {
    return "社会餐饮";
  }

  if (value.includes("幼儿园") || value.includes("学校")) {
    return "学校/幼儿园";
  }

  if (value.includes("连锁")) {
    return "连锁餐饮";
  }

  if (
    value.includes("集体用餐配送") ||
    value.includes("集体配餐") ||
    value.includes("集配") ||
    value.includes("中央厨房") ||
    value.includes("配送")
  ) {
    return "集配/中央厨房";
  }

  if (
    value.includes("食堂") ||
    value.includes("单位") ||
    value.includes("企业") ||
    value.includes("机关") ||
    value.includes("工厂") ||
    value.includes("医院") ||
    value.includes("养老")
  ) {
    return "单位食堂";
  }

  return "其他餐饮";
}
