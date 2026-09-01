# 🎾 ServeApp

A tap-to-count tracker for tennis serves. Big button, instant undo, one entry per
practice session, and a calendar that shows how much work you have actually put in.

No accounts, no network, no build step — it is plain HTML, CSS and JavaScript, and
every serve is stored on the device in `localStorage`.

## Features

- **One-tap counting.** A large dial in the middle of the screen; each tap logs a
  serve with a timestamp, a ripple and a short haptic buzz.
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
- **Session goal.** Set a target (default 50) and the ring around the dial fills
  as you close in on it.
- **Backup.** Export everything to a `.json` file and import it back on another
  device or browser.
- **Offline / installable.** A service worker caches the app shell, so it runs
  with no signal — on court, in airplane mode.

## Run it

Any static file server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from the filesystem works too, though the service
worker (offline mode) only registers over `http://` or `https://`.

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
  "goal": 50,
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
css/styles.css           all styling
js/store.js              storage, sessions, undo stack, stats
js/app.js                rendering, views, interaction
sw.js                    offline cache
manifest.webmanifest     install metadata
icons/                   app icons
```
