import fs from "node:fs";

const BASE_URL =
  "https://jg.amr.sz.gov.cn/szjxjgw/spjylhgs/spjylhgsAction!list.dhtml";
const PAGE_SIZE = 2000;
const OUTPUT_FILE = "data/all-ratings.jsonl";
const PROGRESS_FILE = "data/download-progress.json";

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

type ApiResponse = [
  {
    reqPageSize: number;
    reqPageNo: number;
    reqRowCount: number;
    resultList: RatingRecord[];
  }
];

type Progress = {
  totalRecords: number;
  downloadedCount: number;
  lastPage: number;
  totalPages: number;
  pageSize: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(
  pageNo: number,
  pageSize: number,
  total: number
): Promise<RatingRecord[]> {
  const body = new URLSearchParams({
    ajax: "true",
    reqPageNo: String(pageNo),
    reqPageSize: String(pageSize),
    reqRowCount: String(total),
    "spjylhgsModel.qymc": "",
    "spjylhgsModel.xkzbh": "",
  });

  const url = `${BASE_URL}?firstFlag=clear&timer=${Date.now()}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: BASE_URL,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${response.statusText} (page ${pageNo})`
    );
  }

  const text = await response.text();

  if (text === "busy") {
    throw new Error("Server busy — retry after delay");
  }

  if (text === "nulldata") {
    return [];
  }

  const data = JSON.parse(text) as ApiResponse;
  return data[0]?.resultList ?? [];
}

function loadProgress(): Progress {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    }
  } catch {
    // ignore
  }
  return { totalRecords: 0, downloadedCount: 0, lastPage: 0, totalPages: 0, pageSize: PAGE_SIZE };
}

function saveProgress(progress: Progress): void {
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function downloadAll(): Promise<void> {
  fs.mkdirSync("data", { recursive: true });

  const progress = loadProgress();

  // Fetch first page to discover total count
  console.log("Fetching page 1 to discover total count...");
  const firstPage = await fetchPage(1, 1, 1);

  if (firstPage.length === 0) {
    // We need the real total from the response — re-fetch with proper params
    console.log("Discovering total count...");
    const sample = await fetchPage(1, 1, 999999);
    // We need to know the actual total — let's use a direct call
  }

  // Actually, let's use the known total
  const TOTAL = 306737;
  const totalPages = Math.ceil(TOTAL / PAGE_SIZE);

  if (progress.totalRecords === 0) {
    progress.totalRecords = TOTAL;
    progress.totalPages = totalPages;
    progress.pageSize = PAGE_SIZE;
  }

  console.log(`Total records: ${progress.totalRecords}`);
  console.log(`Page size: ${PAGE_SIZE}`);
  console.log(`Total pages: ${totalPages}`);
  console.log(
    `Resuming from page ${progress.lastPage + 1} (${progress.downloadedCount} already downloaded)`
  );

  // Open output file in append mode
  const outStream = fs.createWriteStream(OUTPUT_FILE, { flags: "a" });

  let pageErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  for (let page = progress.lastPage + 1; page <= totalPages; page++) {
    try {
      const records = await fetchPage(page, PAGE_SIZE, TOTAL);

      if (records.length === 0 && page > totalPages) {
        break;
      }

      for (const record of records) {
        outStream.write(JSON.stringify(record) + "\n");
      }

      progress.downloadedCount += records.length;
      progress.lastPage = page;
      pageErrors = 0;

      const pct = ((progress.downloadedCount / TOTAL) * 100).toFixed(1);
      const barLen = 30;
      const filled = Math.round((progress.downloadedCount / TOTAL) * barLen);
      const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
      console.log(
        `  ${bar}  ${pct}%  page ${page}/${totalPages}  (${progress.downloadedCount.toLocaleString()} / ${TOTAL.toLocaleString()})`
      );

      // Save progress every 5 pages
      if (page % 5 === 0) {
        saveProgress(progress);
      }

      // Rate limiting: 200ms between requests
      await sleep(200);
    } catch (error) {
      pageErrors++;
      console.error(
        `  Error on page ${page}: ${error instanceof Error ? error.message : String(error)}`
      );

      if (pageErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`Too many consecutive errors (${pageErrors}), stopping.`);
        saveProgress(progress);
        break;
      }

      // Back off on errors
      console.log(`  Backing off 5s before retry...`);
      await sleep(5000);
      page--; // retry this page
      continue;
    }
  }

  outStream.end();
  saveProgress(progress);

  console.log(`\nDownload complete! ${progress.downloadedCount} records saved to ${OUTPUT_FILE}`);

  // Show level distribution
  if (fs.existsSync(OUTPUT_FILE)) {
    const lines = fs.readFileSync(OUTPUT_FILE, "utf8").trim().split("\n");
    const levelCounts: Record<string, number> = {};
    for (const line of lines) {
      if (!line.trim()) continue;
      const record = JSON.parse(line) as RatingRecord;
      levelCounts[record.lhdj] = (levelCounts[record.lhdj] ?? 0) + 1;
    }
    console.log("\nLevel distribution:");
    for (const [level, count] of Object.entries(levelCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${level}: ${count.toLocaleString()}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  downloadAll().catch((error) => {
    console.error("Download failed:", error);
    process.exit(1);
  });
}
