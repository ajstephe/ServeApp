# 🎾 ServeApp

A tap-to-count tracker for tennis serves. Big button, instant undo, one entry per
practice session, and a calendar that shows how much work you have actually put in.

No accounts, no server — it is a static Vite app, and every serve is stored on the
device in `localStorage`.

## Features

- **One-tap counting.** A large dial in the middle of the screen; each tap logs a
  serve with a timestamp, a ripple and a short haptic buzz.
- **Two timers.** The session strip shows overall elapsed time and pace
  (serves/min) since the session started; the dial itself shows time since your
  *last* serve, for pacing between serves — it starts once you've tapped at least
  once and resets to zero on every tap.
- **Undo.** The Undo button reverses the last serve you counted — it walks back
  through a stack, so repeated taps keep peeling off mistakes (works across
  sessions too).
- **Sessions.** A session starts on your first serve of the day and can be ended,
  renamed, resumed or restarted at any time, so several sessions in one day each
  keep their own count, start time, duration and serves-per-minute.
- **Calendar.** A month grid with a heatmap of daily volume. Tap a day to see the
  sessions logged on it; tap a session to edit or delete it.
- **Stats.** Totals, average per session, best day, best session, active days,
  a current day-streak and a 14-day bar chart.
- **Export.** A `.json` backup for re-importing on another device or browser, or
  a `.xlsx` workbook (Sessions, Daily Totals and Summary sheets) for opening in
  Excel, Numbers or Google Sheets.
- **Offline / installable.** A service worker caches the app shell, so it runs
  with no signal — on court, in airplane mode.

## Run it

```bash
npm install
npm run dev
# then open the URL Vite prints (usually http://localhost:5173)
```

`npm run build` produces a production build in `dist/`; `npm run preview` serves
that build locally so you can check it before deploying.

## Deploying

Built with [Vite](https://vitejs.dev). `vercel.json` sets `"framework": "vite"`,
so on Vercel, importing the repository and deploying needs no configuration —
build command and output directory (`dist`) are inferred from that.

`vercel.json` also sets the headers that matter for a PWA:

- `sw.js` is served `must-revalidate`, so an updated service worker is picked up
  on the next visit instead of a stale shell being cached forever.
- `manifest.webmanifest` gets the correct `application/manifest+json` type.
- Everything under `icons/` is immutable and cached for a year.

Note that the production branch must actually contain the app before a deploy
serves anything.

## Put it on your phone

Host the folder anywhere static (GitHub Pages, Netlify, Vercel, a Raspberry Pi),
open the URL on your phone, then:

- **iOS Safari** — Share → *Add to Home Screen*
- **Android Chrome** — ⋮ → *Add to home screen* / *Install app*

It then launches full-screen with no browser chrome, and works without a
connection.

## Keyboard shortcuts (desktop)

| Key | Action |
| --- | --- |
| `Space` / `Enter` | Count a serve |
| `Z` | Undo the last serve |
| `Esc` | Close the open sheet |

## How the data is stored

One key, `serveapp.v1`:

```jsonc
{
  "version": 1,
  "activeId": "s_ab12c3",            // the session currently running, or null
  "sessions": [
    {
      "id": "s_ab12c3",
      "name": "Flat serves — court 3",
      "startedAt": 1756750000000,     // epoch ms
      "endedAt": 1756753600000,       // null while the session is live
      "serves": [1756750012000, ...]  // one timestamp per serve
    }
  ]
}
```

Because serves are timestamps rather than a bare number, the app can show
duration, serves per minute and per-day rollups without storing anything extra.

Data lives only in that browser on that device. Clearing site data wipes it, so
use **⋮ → Export backup** before you do.

## Layout

```
index.html               markup and view shells
src/main.js               entry point — imports styles.css and app.js
src/styles.css            all styling
src/store.js               storage, sessions, undo stack, stats
src/app.js                 rendering, views, interaction
src/xlsx.js                minimal .xlsx writer, loaded on demand (Export)
public/sw.js               offline cache (served as-is, unbundled)
public/manifest.webmanifest  install metadata
public/icons/               app icons
vite.config.js            build config
vercel.json               deploy headers
```

`src/` is processed and bundled by Vite (hashed filenames, minified). `public/`
is copied to the build output unchanged — that's required for `sw.js` and
`manifest.webmanifest`, which need stable, predictable URLs.
