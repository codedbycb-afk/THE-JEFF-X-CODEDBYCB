#!/usr/bin/env node
/**
 * Monthly scheduler for The Jefferson Bar & Grill.
 *
 * - Reads schedule.json + caption libraries
 * - For each weekday in the target month (skipping Saturdays — CB handles those manually):
 *   1. Picks a random unused caption from that day's library
 *   2. Uploads the flyer to GHL media (once per unique flyer, then reuses URL)
 *   3. Creates a draft post in GHL Social Planner for IG + TikTok
 *
 * Usage:
 *   node scripts/schedule-month.js                # current month, dry-run preview
 *   node scripts/schedule-month.js --month 2026-05 --commit
 *   node scripts/schedule-month.js --commit       # current month, real schedule
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Polyfill fetch on older Node
const fetch = globalThis.fetch || ((...a) => import('node-fetch').then(({default: f}) => f(...a)));

// --- env ---
const ENV = {};
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) ENV[m[1]] = m[2].trim();
  });
}
const PIT = ENV.GHL_PIT || process.env.GHL_PIT;
const LOC = ENV.GHL_LOCATION_ID || process.env.GHL_LOCATION_ID;
const IG  = ENV.GHL_IG_ACCOUNT_ID || process.env.GHL_IG_ACCOUNT_ID;
const TT  = ENV.GHL_TIKTOK_ACCOUNT_ID || process.env.GHL_TIKTOK_ACCOUNT_ID;

if (!PIT || !LOC || !IG) {
  console.error('Missing GHL_PIT / GHL_LOCATION_ID / GHL_IG_ACCOUNT_ID in .env.local');
  process.exit(1);
}

// --- args ---
const args = process.argv.slice(2);
const monthArg = (args.find(a => a.startsWith('--month=')) || '').split('=')[1]
  || (args.includes('--month') ? args[args.indexOf('--month') + 1] : null)
  || new Date().toISOString().slice(0, 7);
const COMMIT = args.includes('--commit');
const POST_TIME_HOUR = 10; // 10 AM EST default
const SUNDAY_POST_HOUR = 11;
const PAGES_BASE = 'https://codedbycb-afk.github.io/THE-JEFF-X-CODEDBYCB';

console.log(`\n[Jefferson Scheduler] Month: ${monthArg} · Mode: ${COMMIT ? 'COMMIT (live)' : 'DRY-RUN (preview)'}`);

// --- load data ---
const root = path.join(__dirname, '..');
const schedule = JSON.parse(fs.readFileSync(path.join(root, 'data/schedule.json'), 'utf8'));
const captions = {};
['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].forEach(d => {
  captions[d] = JSON.parse(fs.readFileSync(path.join(root, `captions/${d}.json`), 'utf8')).captions;
});

function pickCaption(dayName) {
  const lib = captions[dayName.toLowerCase()];
  return lib[Math.floor(Math.random() * lib.length)];
}

// --- GHL API ---
async function ghlMediaUpload(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('hosted', 'false');
  form.append('locationId', LOC);
  form.append('name', path.basename(filePath));
  const res = await fetch('https://services.leadconnectorhq.com/medias/upload-file', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PIT}`,
      Version: '2021-07-28',
      Accept: 'application/json',
      ...form.getHeaders()
    },
    body: form
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Upload failed: ${JSON.stringify(json)}`);
  return json.fileUrl || json.url || json.uploadedFileUrl;
}

async function ghlCreatePost({ accountIds, mediaUrl, caption, scheduleISO, type }) {
  const ext = (mediaUrl.match(/\.([a-z0-9]+)(?:\?|$)/i) || [,'png'])[1].toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  const body = {
    type: type || 'post',
    accountIds,
    summary: caption,
    media: [{ url: mediaUrl, type: mime }],
    scheduleDate: scheduleISO,
    userId: ENV.GHL_USER_ID || '1zZlTU0NmSASpHTmFZw1',
    status: 'scheduled'
  };
  const res = await fetch('https://services.leadconnectorhq.com/social-media-posting/' + LOC + '/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PIT}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Post failed: ${JSON.stringify(json)}`);
  return json;
}

// --- main ---
function* eachDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  for (let d = 1; d <= total; d++) yield new Date(y, m-1, d);
}

function isoWithEastern(date, hour) {
  // crude EST/EDT: UTC = EST + 5 (EDT + 4). May = EDT, +4.
  const month = date.getMonth() + 1;
  const isEDT = month >= 3 && month <= 11;
  const offset = isEDT ? 4 : 5;
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour + offset, 0, 0));
  return utc.toISOString();
}

(async () => {
  const mediaCache = {}; // path -> uploaded URL
  const plan = [];
  const now = new Date();

  for (const date of eachDayOfMonth(monthArg)) {
    const dow = date.getDay();
    const cfg = schedule.weekday_map[String(dow)];
    if (cfg.manual_override) continue; // skip Saturday
    if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue; // skip past days

    const caption = pickCaption(cfg.day);
    const flyerPath = path.join(root, cfg.flyer);
    const hour = dow === 0 ? SUNDAY_POST_HOUR : POST_TIME_HOUR;
    const scheduleISO = isoWithEastern(date, hour);

    plan.push({ date: date.toISOString().slice(0,10), day: cfg.day, scheduleISO, caption: caption.slice(0,80) + '…', flyerPath });
  }

  console.log(`\nPlanned posts: ${plan.length}\n`);
  plan.forEach(p => console.log(`  ${p.date}  ${p.day.padEnd(10)} → ${p.scheduleISO}  | ${p.caption}`));

  if (!COMMIT) {
    console.log('\n[dry-run] Pass --commit to actually push to GHL.\n');
    return;
  }

  // Use GitHub Pages URLs directly (no upload needed)
  for (const p of plan) {
    try {
      const flyerName = path.basename(p.flyerPath);
      const mediaUrl = `${PAGES_BASE}/assets/${flyerName}`;
      // TikTok only supports video, so we push images to IG only.
      // (TikTok scheduling will be added once we have an image→video step.)
      const accountIds = [IG];
      const fullCap = pickCaption(p.day);
      const out = await ghlCreatePost({
        accountIds,
        mediaUrl,
        caption: fullCap,
        scheduleISO: p.scheduleISO
      });
      console.log(`  ✓ ${p.date}  ${p.day}  posted (id=${out.id || out.postId || 'n/a'})`);
    } catch (e) {
      console.error(`  ✗ ${p.date}  ${p.day}  ${e.message}`);
    }
  }
  console.log('\nDone. Check GHL Social Planner → Planner tab to review drafts.\n');
})();
