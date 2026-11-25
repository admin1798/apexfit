# ApexFit — Personal Fitness System

An offline-first, mobile-first (and desktop-responsive) Progressive Web App designed for daily training, nutrition, physique progress, recovery tracking, and context-aware coaching.

---

## Core Modules

1. **Personal Dashboard (`Today`):**
   - Customizable dashboard widgets (`Customize` toggle).
   - Daily calorie, protein, carbs, fats, and fiber tracking rings.
   - One-tap hydration (`+250 ml` / `+500 ml`), steps, sleep, recovery readiness score, body weight, weekly activity strip, and recent personal records.
2. **Workout System (`Workouts`):**
   - Push, Pull, Legs, Upper, Lower, Full Body, and Custom programs with weekday scheduling.
   - Searchable Exercise Library with execution instructions, form cues, common mistakes, alternatives, previous performance, and personal training notes.
   - Fast in-gym live logger: sets, reps, weight (`kg` / `lb`), RPE, set types (`W`/`S`/`D`/`F`), reorder/remove/swap exercises, per-exercise notes, and customizable countdown rest timers (`60s`–`180s`, `±15s`, chime & haptics).
   - Workout calendar showing completed, planned, missed, and rest days.
3. **Nutrition System (`Nutrition`):**
   - Daily Calories, Protein, Carbs, Fats, Fiber, and Water tracking.
   - Offline searchable Food Database with **Bengali foods**, **Indian staples**, **International foods**, **Packaged snacks**, **Fruits & Veg**, **Fish, Eggs, Chicken, Dairy, Rice, Roti & Dal** with unit conversions (`Serving`, `100g`, `Piece`, `Bowl`, `Cup`, `Grams`).
   - Custom foods, saved meals, multi-ingredient recipe builder, repeat yesterday's meal, and 7-day nutrition analytics.
   - Optional **Gemini 2.5 Flash** natural-language meal parser using a locally stored API key.
4. **Physique & Progress (`Progress`):**
   - Body weight tracking (7-day & 30-day rolling averages, goal weight, total change).
   - Body measurements (Chest, Waist, Shoulders, Arms, Forearms, Hips, Thighs, Calves, Neck + custom).
   - Private local-only progress photos (Front, Side, Back) with date-based side-by-side comparison and optional privacy blur.
   - Strength progress (`Est. 1RM` & `Top Weight`) and Weekly Muscle Group Volume charts.
5. **Recovery & Health (`Recovery`) + Reports (`Reports`):**
   - Sleep duration & quality, steps, active minutes, fatigue, soreness, stress, mood, daily habits, and readiness score.
   - Automated Weekly (7-day) & Monthly (30-day) performance reports.
6. **Personal AI Fitness Coach (`AI Coach`):**
   - 5 modes (`Workout`, `Nutrition`, `Recovery`, `Progress`, `Assistant`) reading directly from local IndexedDB logs, with offline deterministic coaching + optional Gemini 2.5 Flash enhancement and confirmation dialogs before modifying saved programs.
7. **Offline-First & Privacy:**
   - Local-first **IndexedDB** via Dexie.js + **Workbox** service worker precaching.
   - Deduplicated offline `syncQueue` with retry & online flush indicator.
   - Optional App Lock PIN (SHA-256), JSON Export/Import backup, and full data deletion in Settings.

---

## Local Development & Verification

```bash
npm install
npm run lint
npm run build
npm run dev
```

---

## Git & Private GitHub Setup

```bash
git init
git add .
git commit -m "ApexFit personal fitness system"
git branch -M main
git remote add origin https://github.com/<your-username>/apexfit.git
git push -u origin main
```

`.gitignore` excludes `node_modules`, `dist`, `.env*`, private backup JSON files, and credentials.

---

## Deploy to Vercel

1. Connect your private GitHub repository in [Vercel](https://vercel.com).
2. `vercel.json` is pre-configured with:
   - **Framework:** `vite`
   - **Install Command:** `npm install`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - SPA fallback rewrite + no-cache headers for `sw.js` and `manifest.webmanifest`.
3. Click **Deploy** to get an HTTPS production URL.

---

## Install on iPhone (Safari)

1. Open your HTTPS Vercel URL in **Safari** on iPhone.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch **ApexFit** from the Home Screen in standalone full-screen mode with full offline gym & nutrition support.
