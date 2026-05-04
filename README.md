# THE JEFF × CODEDBYCB

Monthly social planner + UI for **The Jefferson Bar & Grill** (3670 W 130th St · Cleveland, OH).

Built and maintained by [CODEDBYCB](https://codedbycb.com).

## What this is

A static web dashboard + Node automation script that:

1. Generates 7 weekly flyer templates (one per weekday) via Higgsfield Nano Banana
2. Pulls a fresh caption from a 350-caption library (50 per day)
3. Schedules a full month of posts to **GHL Social Planner** (Instagram + TikTok) as drafts
4. Lets CB review the whole month in one calendar view and approve with one click

## UI tabs

- **Schedule** — calendar of the month, click any day to preview the flyer + caption, edit, reroll, save. Big "Approve This Month's Schedule" button at the top.
- **Payments** — client's next payment date, retainer amount, history.
- **Task Log** — running list of work CB has delivered. Adds inline; export to JSON.

The UI is pure HTML/CSS/JS — no framework, no build step. Hosted on GitHub Pages.

## Project structure

```
the-jeff-x-codedbycb/
├── index.html              ← single-page UI (served by Pages)
├── captions/
│   ├── monday.json         ← 50 captions
│   ├── tuesday.json        ← 50 captions
│   └── … (7 total)
├── assets/
│   └── jefferson-{day}-flyer.png
├── data/
│   ├── schedule.json       ← weekday → flyer/caption map
│   ├── payments.json       ← client billing state
│   └── tasks.json          ← work log
├── scripts/
│   └── schedule-month.js   ← Node monthly auto-schedule to GHL
├── .env.local              ← (gitignored) GHL credentials
└── package.json
```

## Monthly run

```bash
# preview what would post
npm run schedule:dry

# actually push to GHL Social Planner as drafts
npm run schedule:commit
```

The script:
- Skips Saturdays (CB schedules those manually with sound)
- Skips past days
- Picks a random caption per post
- Uploads each unique flyer to GHL once and reuses the URL
- Posts to IG + TikTok at 10AM EST (Sundays at 11AM)

## Credit budget

- ~14 Higgsfield credits/month for flyer regen (7 unique flyers × 2 credits Pro)
- 0 credits if/when plain Nano Banana works on the templates

## Stack

- **Higgsfield MCP** — flyer generation (Nano Banana / Pro)
- **GHL Private Integration Token** — Social Planner API
- **Static HTML/JS** — UI (GitHub Pages)
- **Node + form-data** — monthly scheduler script

## Setup

1. Drop a `.env.local` with:
   ```
   GHL_PIT=pit-...
   GHL_LOCATION_ID=...
   GHL_IG_ACCOUNT_ID=...
   GHL_TIKTOK_ACCOUNT_ID=...
   ```
2. `npm install`
3. `npm run schedule:dry` to preview
4. `npm run schedule:commit` to push for real

## License

Private project — internal use for CODEDBYCB and The Jefferson Bar & Grill.
