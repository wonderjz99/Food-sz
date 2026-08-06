/**
 * Upload data to WeChat Cloud Database.
 *
 * Usage:
 *   node scripts/upload-to-cloud.js [--dry-run] [--batch-size=100]
 *
 * Prerequisites:
 *   1. Install wx-server-sdk: npm install wx-server-sdk
 *   2. Set CLOUD_ENV environment variable to your cloud environment ID
 *   3. Run the data pipeline first: pnpm data:build
 *
 * This script reads data/parsed-ratings.json + data/geocode-cache.json,
 * merges them (same logic as scripts/build-data.ts), and uploads to
 * WeChat Cloud DB collections: food_safety_units + summary_stats.
 */

const fs = require('node:fs');
const path = require('node:path');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = parseInt(
  (process.argv.find(a => a.startsWith('--batch-size=')) || '').split('=')[1] || '100',
  10
);
const CLOUD_ENV = process.env.CLOUD_ENV || '';

if (!DRY_RUN && !CLOUD_ENV) {
  console.error('Set CLOUD_ENV=your-env-id or use --dry-run');
  process.exit(1);
}

function readJsonFile(filePath) {
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function loadUnits() {
  const parsed = readJsonFile('data/parsed-ratings.json');
  if (!parsed?.units?.length) {
    console.error('data/parsed-ratings.json not found. Run: pnpm data:build');
    process.exit(1);
  }
  return parsed;
}

function loadGeocodeCache() {
  return readJsonFile('data/geocode-cache.json') || {};
}

function toCloudDocument(unit, cache) {
  const cached = cache[unit.id];
  const location = cached?.location || unit.location;
  const geocodeStatus = cached?.status === 'ok' && cached?.confidence >= 0.6 ? 'ok' : 'review';
  const lat = location ? location.lat : null;
  const lng = location ? location.lng : null;

  const doc = {
    _id: unit.id,
    name: unit.name,
    rawCategory: unit.rawCategory,
    categoryGroup: unit.categoryGroup,
    address: unit.address,
    district: unit.district,
    ratingYear: unit.ratingYear,
    ratingLevel: unit.ratingLevel,
    riskLevel: unit.riskLevel || null,
    lat,
    lng,
    geocodeStatus,
    geocodeConfidence: cached?.confidence ?? unit.geocodeConfidence ?? null,
    sourceUpdatedAt: unit.sourceUpdatedAt
  };

  if (lat != null && lng != null) {
    doc.location = {
      type: 'Point',
      coordinates: [lng, lat]
    };
  }

  return doc;
}

function computeSummary(units, sourceUpdatedAt) {
  const byCategoryGroup = {};
  const byRawCategory = {};
  const byDistrict = {};
  const byRatingLevel = {};
  const byRatingYear = {};
  let withLocation = 0;
  const districts = new Set();
  const categoryGroups = new Set();
  const rawCategories = new Set();
  const years = new Set();

  for (const u of units) {
    byCategoryGroup[u.categoryGroup] = (byCategoryGroup[u.categoryGroup] || 0) + 1;
    byRawCategory[u.rawCategory] = (byRawCategory[u.rawCategory] || 0) + 1;
    byDistrict[u.district] = (byDistrict[u.district] || 0) + 1;
    byRatingLevel[u.ratingLevel] = (byRatingLevel[u.ratingLevel] || 0) + 1;
    byRatingYear[u.ratingYear] = (byRatingYear[u.ratingYear] || 0) + 1;
    if (u.lat != null) withLocation++;
    districts.add(u.district);
    categoryGroups.add(u.categoryGroup);
    rawCategories.add(u.rawCategory);
    years.add(u.ratingYear);
  }

  return {
    _id: 'global',
    sourceUpdatedAt,
    total: units.length,
    withLocation,
    byCategoryGroup,
    byRawCategory,
    byDistrict,
    byRatingLevel,
    byRatingYear,
    districts: [...districts].sort(),
    categoryGroups: [...categoryGroups],
    rawCategories: [...rawCategories].sort(),
    yearBounds: [Math.min(...years), Math.max(...years)],
    updatedAt: new Date().toISOString()
  };
}

async function uploadBatches(db, collectionName, docs) {
  const collection = db.collection(collectionName);
  let uploaded = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const promises = batch.map(doc =>
      collection.doc(doc._id).set({ data: doc }).catch(err => {
        if (err.errCode === -1) {
          return collection.add({ data: doc });
        }
        console.error(`  Error uploading ${doc._id}:`, err.message);
      })
    );
    await Promise.all(promises);
    uploaded += batch.length;
    const pct = ((uploaded / docs.length) * 100).toFixed(1);
    process.stdout.write(`\r  Uploaded ${uploaded}/${docs.length} (${pct}%)`);
  }
  process.stdout.write('\n');
}

async function main() {
  console.log('=== WeChat Cloud DB Upload ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  const { units: parsedUnits, sourceUpdatedAt } = loadUnits();
  const cache = loadGeocodeCache();
  console.log(`Parsed units: ${parsedUnits.length.toLocaleString()}`);
  console.log(`Geocode cache entries: ${Object.keys(cache).length.toLocaleString()}`);

  const docs = parsedUnits.map(u => toCloudDocument(u, cache));
  const geocoded = docs.filter(d => d.geocodeStatus === 'ok');
  console.log(`Geocoded (ok): ${geocoded.length.toLocaleString()}`);

  const summary = computeSummary(docs, sourceUpdatedAt);
  console.log(`Summary: ${JSON.stringify(summary.byRatingLevel)}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Sample document:');
    console.log(JSON.stringify(docs[0], null, 2));
    console.log('\n[DRY RUN] Summary document:');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nWould upload ${docs.length} documents + 1 summary`);
    return;
  }

  // Init cloud SDK
  const cloud = require('wx-server-sdk');
  cloud.init({ env: CLOUD_ENV });
  const db = cloud.database();

  console.log('\nUploading food_safety_units...');
  await uploadBatches(db, 'food_safety_units', docs);

  console.log('Uploading summary_stats...');
  await db.collection('summary_stats').doc('global').set({ data: summary })
    .catch(() => db.collection('summary_stats').add({ data: summary }));

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
