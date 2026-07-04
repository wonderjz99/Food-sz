import fs from "node:fs";

export type LocalKeyEnv = {
  TENCENT_MAP_GEOCODE_KEY?: string;
  TENCENT_MAP_GEOCODE_SECRET?: string;
  VITE_TENCENT_MAP_WEB_KEY?: string;
  AMAP_GEOCODE_KEY?: string;
  AMAP_GEOCODE_KEY_2?: string;
};

const KEY_LABELS: Record<string, keyof LocalKeyEnv> = {
  "food-sz-geo": "TENCENT_MAP_GEOCODE_KEY",
  "food-sz-geo secret key": "TENCENT_MAP_GEOCODE_SECRET",
  "food-sz-geo-secret": "TENCENT_MAP_GEOCODE_SECRET",
  "food-sz-secret": "TENCENT_MAP_GEOCODE_SECRET",
  "food-sz-web": "VITE_TENCENT_MAP_WEB_KEY",
  "food-sz-amap-geo": "AMAP_GEOCODE_KEY",
  "amap-geo": "AMAP_GEOCODE_KEY",
  "foodsz-amap1": "AMAP_GEOCODE_KEY",
  "shenzhen-food": "AMAP_GEOCODE_KEY_2"
};

export function parseLocalKeyText(text: string): LocalKeyEnv {
  const env: LocalKeyEnv = {};
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const labelMatch = lines[index].match(/^([^:]+):\s*(.*)$/);
    if (!labelMatch) {
      continue;
    }

    const [, label, inlineValue] = labelMatch;
    const envName = KEY_LABELS[label.trim()];
    if (!envName) {
      continue;
    }

    const value = inlineValue.trim() || lines[index + 1]?.trim();
    if (value) {
      env[envName] = value;
    }
  }

  return env;
}

export function loadLocalKeyFile(filePath = "key.txt"): LocalKeyEnv {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return parseLocalKeyText(fs.readFileSync(filePath, "utf8"));
}

export function applyLocalKeysToProcessEnv(filePath = "key.txt"): LocalKeyEnv {
  const localKeys = loadLocalKeyFile(filePath);
  for (const [key, value] of Object.entries(localKeys)) {
    if (value && !process.env[key]) {
      process.env[key] = value;
    }
  }

  return localKeys;
}
