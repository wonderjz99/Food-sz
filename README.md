# 深圳餐饮量化等级地图

深圳市场监督管理局餐饮单位食品安全量化等级查询系统的 Web 地图看板。支持 A/B/C 三级量化等级展示、全局搜索、地图交互。

## 数据来源

数据通过深圳市场监管局公开查询接口下载（`jg.amr.sz.gov.cn`），包含全市约 30 万条餐饮单位量化等级记录。经筛选保留 2025 年起的最新评级，去重后约 16.6 万条。

## 本地环境

```bash
pnpm install
pnpm run data:build
pnpm dev                  # 启动 → http://127.0.0.1:5173
```

停止开发服务器：

```bash
# Ctrl+C 或
lsof -ti:5173 | xargs kill
```

## 环境变量 / Key 管理

在项目根目录放 `key.txt`（已 `.gitignore`）：

```text
food-sz-geo:
腾讯位置服务 WebService Key（腾讯 geocode 用，备用）
food-sz-geo-secret:
腾讯 secret/SK
food-sz-web:
腾讯地图 Web Key（前端地图展示用）
food-sz-amap-geo:
高德 WebService Key（高德 geocode 用，主力）
```

支持的标签别名：`foodsz-amap1`, `amap-geo`, `food-sz-geo secret key`。

## 数据管线

### 数据下载与筛选

```bash
pnpm run data:download-all    # 下载全部 30 万条原始数据 → data/all-ratings.jsonl
pnpm run data:filter-ratings  # 筛选 2025+ 去重 → data/filtered-ratings.jsonl (~166k)
pnpm run data:parse-ratings   # 解析为 FoodSafetyUnit → data/parsed-ratings.json
```

### 地理编码

主力使用高德地图 Geocoder（腾讯配额不足）：

```bash
pnpm run data:geocode-amap -- --limit=4000 --delay-ms=200  # 单批 geocode
pnpm run data:geocode-daily                                  # 每日一批 4000 条（推荐）
```

- 高德免费额度 5000 条/天，每日脚本每次跑 4000 条
- 断点续传：自动跳过已 geocode 的记录
- 缓存文件：`data/geocode-cache.json`
- 如果当日额度用完，脚本会报错退出，第二天再跑即可

### 构建与验证

```bash
pnpm run data:build                              # 构建前端数据 → public/data/
pnpm run data:validate -- --strict-geocode       # 严格验证
pnpm run data:status                             # 查看 geocode 状态
pnpm run build                                   # 前端打包
pnpm test                                        # 运行测试
```

## 前端功能

### 地图

- 🟢 **A 级**（绿色标记）— 食品安全优秀
- 🟡 **B 级**（黄色标记）— 食品安全良好
- 🔴 **C 级**（红色标记）— 食品安全一般
- 仅显示已地理编码的真实坐标点
- 点击标记弹出店名标签（半透明黑底 + 关闭按钮）
- 定位按钮（靶子图标）放大至建筑级别，弹出店名

### 全局搜索

- 搜索全部 16.6 万条数据（不限于已 geocode）
- 实时匹配名称和地址
- 下拉结果带等级徽章 + 辖区
- 键盘导航（↑↓ Enter Esc）
- 未 geocode 的标"无坐标"
- 选中后自动联动详情卡 + 地图定位
- 懒加载搜索索引（首次点击搜索框才下载）

### 筛选

- **量化等级**：全部 / A 级 / B 级 / C 级
- **类别**：社会餐饮 / 学校幼儿园 / 连锁餐饮 / 单位食堂 / 集配中央厨房 / 其他餐饮
- **辖区**：11 个辖区多选
- **评级年份**：起止年份选择
- **关键词**：名称 + 地址 + 类别文本搜索

### 详情卡

- 动态等级徽章（绿 A / 黄 B / 红 C）+ 笑脸分级
- 风险等级显示（A/B/C/D）
- 地址复制 + 腾讯地图导航

### 列表

- 右侧单位列表，最多显示 80 条
- 行左侧颜色条按等级着色
- 等级徽章动态显示

## 技术栈

- React 18 + TypeScript
- Vite 6
- 腾讯地图 JavaScript API GL
- 高德地图 WebService Geocoder API
- JSONL 数据管线

## 文件结构

```
src/
├── components/
│   ├── HeaderBar.tsx      # 顶栏（标题 + 搜索 + 分享）
│   ├── SearchBar.tsx       # 全局搜索（Portal 下拉）
│   ├── SidebarFilters.tsx  # 侧栏筛选（等级/类别/辖区/年份）
│   ├── StatsBar.tsx        # 统计条（A/B/C 分布）
│   ├── MapPanel.tsx        # 地图面板（三色标记 + InfoWindow）
│   ├── DetailCard.tsx      # 详情卡（动态等级徽章）
│   └── UnitList.tsx        # 单位列表
├── data/
│   ├── useDataset.ts       # 数据加载（优先轻量 geocode 文件）
│   ├── filtering.ts        # 前端过滤（含等级筛选）
│   ├── categories.ts       # 类别分组逻辑
│   ├── geocoding.ts        # geocode 工具（坐标校验/地址复用）
│   └── mapFocus.ts         # 地图聚焦参数
├── types.ts                # 全局类型
└── styles.css              # 样式（含等级颜色变量）

scripts/
├── download-all-ratings.ts # 下载全量原始数据
├── filter-ratings.ts       # 筛选 2025+ 去重
├── parse-ratings.ts        # 解析为 FoodSafetyUnit
├── parse-xlsx.ts           # 旧 xlsx 解析（备用）
├── geocode-amap.ts         # 高德 geocode（主力）
├── geocode-tencent.ts      # 腾讯 geocode（备用）
├── geocode-daily.ts        # 每日 geocode 任务
├── geocode-status.ts       # 状态报告
├── build-data.ts           # 构建前端数据 + 搜索索引
├── validate-data.ts        # 数据验证
└── local-keys.ts           # key.txt 解析

data/
├── all-ratings.jsonl       # 全量原始数据 (~306k)
├── filtered-ratings.jsonl  # 筛选后 (~166k)
├── parsed-ratings.json     # 解析后 FoodSafetyUnit[]
├── geocode-cache.json      # geocode 缓存
└── analysis-report.md      # 数据分析报告

public/data/
├── units.json              # 全量数据（含预览坐标）
├── units-geo.json          # 仅已 geocode（轻量，地图加载）
├── summary.json            # 统计摘要
└── search-index.json       # 全局搜索索引
```
