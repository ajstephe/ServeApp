/* ==========================================================
   app.js — views, rendering and interaction
   ========================================================== */

import { Store } from './store.js';

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const RING_LEN = 2 * Math.PI * 110;   // r=110 in the SVG viewBox
  let calCursor = startOfMonth(new Date());
  let selectedDay = Store.dayKey(Date.now());
  let clockTimer = null;

  /* ── formatting helpers ──────────────────────────────── */
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function fmtDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60), s = total % 60;
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function fmtDayLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = Store.dayKey(Date.now());
    const yesterday = Store.dayKey(Date.now() - 86400000);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function sessionLength(s) {
    const end = s.endedAt || Date.now();
    return end - s.startedAt;
  }

  function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* ── toast ───────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1900);
  }

  function buzz(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
  }

  /* ── bottom sheet ────────────────────────────────────── */
  function openSheet(html, wire) {
    const back = $('#sheetBackdrop');
    const sheet = $('#sheet');
    back.classList.remove('is-closing');
    sheet.classList.remove('is-closing');
    sheet.style.transform = '';
    $('#sheetBody').innerHTML = html;
    back.hidden = false;
    if (wire) wire($('#sheetBody'));
  }

  function closeSheet() {
    const back = $('#sheetBackdrop');
    if (back.hidden || back.classList.contains('is-closing')) return;
    const sheet = $('#sheet');
    back.classList.add('is-closing');
    sheet.classList.add('is-closing');
    sheet.addEventListener('animationend', () => {
      back.hidden = true;
      back.classList.remove('is-closing');
      sheet.classList.remove('is-closing');
      sheet.style.transform = '';
      $('#sheetBody').innerHTML = '';
    }, { once: true });
  }

  $('#sheetBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'sheetBackdrop') closeSheet();
  });

  // Drag the grabber (or the sheet's own empty space) down to dismiss it,
  // the way an iOS modal sheet does.
  (() => {
    const sheet = $('#sheet');
    const grabber = $('#sheetGrabber');
    let startY = 0, dy = 0, dragging = false;

    function onDown(e) {
      if (e.target !== grabber && e.target !== sheet) return;
      dragging = true; dy = 0;
      startY = e.clientY;
      sheet.classList.add('dragging-sheet');
      sheet.style.transition = 'none';
      sheet.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging-sheet');
      sheet.style.transition = '';
      if (dy > 110) closeSheet();
      else sheet.style.transform = '';
    }
    sheet.addEventListener('pointerdown', onDown);
    sheet.addEventListener('pointermove', onMove);
    sheet.addEventListener('pointerup', onUp);
    sheet.addEventListener('pointercancel', onUp);
  })();

  // Keep an open sheet clear of the on-screen keyboard. A focused input
  // inside a fixed-position sheet is the classic case where mobile Safari
  // doesn't shrink the layout viewport for the keyboard, so a bottom sheet
  // sized against `inset: 0` ends up rendered partly underneath it. The
  // VisualViewport API reports the actually-visible area even then, so the
  // gap between it and the full layout viewport is exactly the keyboard's
  // height — feed that back in as padding to push the sheet up above it.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    };
    vv.addEventListener('resize', updateKeyboardInset);
    vv.addEventListener('scroll', updateKeyboardInset);
  }

  /* ── COUNT view ──────────────────────────────────────── */
  const CTA_ICON = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>';
  const PLUS_ICON = '<path d="M12 5v14M5 12h14"/>';

  function renderCount() {
    const s = Store.active();
    const goal = Store.getGoal();
    const count = s ? s.serves.length : 0;

    $('#tapCount').textContent = count;
    $('#overheadsCount').textContent = s ? s.overheads.length : 0;
    $('#tapBtn').classList.toggle('is-idle', !s);
    $('#overheadsBtn').classList.toggle('is-idle', !s);
    $('#sessionName').textContent = s ? s.name : 'No active session';
    $('#liveDot').classList.toggle('live', !!s);
    $('#endSessionBtn').hidden = !s;
    $('#sessionStrip').classList.toggle('is-tappable', !!s);
    $('#goalBtn').textContent = goal;

    const pct = Math.min(1, count / goal);
    $('#ringFill').style.strokeDashoffset = String(RING_LEN * (1 - pct));

    $('#undoBtn').hidden = !s;
    $('#undoBtn').disabled = !Store.canUndo();
    $('#actionRow').classList.toggle('is-idle', !s);
    $('#newSessionBtn').classList.toggle('pill-btn-cta', !s);
    $('#newSessionIcon').innerHTML = s ? PLUS_ICON : CTA_ICON;
    $('#newSessionBtn').lastChild.textContent = s ? ' New session' : ' Start Session';

    const todayKey = Store.dayKey(Date.now());
    $('#statToday').textContent = Store.totalOn(todayKey);
    $('#statSessionsToday').textContent = Store.sessionsOn(todayKey).length;
    $('#statAll').textContent = Store.stats().total;

    tickClock();
  }

  function tickClock() {
    const s = Store.active();
    if (!s) {
      $('#sessionClock').textContent = '00:00';
      $('#sessionRate').textContent = '0.0 / min';
      $('#tapHint').textContent = 'start a session to begin';
      return;
    }
    const elapsed = sessionLength(s);
    $('#sessionClock').textContent = fmtDuration(elapsed);
    const mins = elapsed / 60000;
    const rate = mins > 0.1 ? s.serves.length / mins : 0;
    $('#sessionRate').textContent = `${rate.toFixed(1)} / min`;

    // Once serving has started, the instructional hint gives way to a live
    // between-serve timer — the overall session clock above already covers
    // "how long have I been going"; this covers "how long since my last one".
    const hint = $('#tapHint');
    if (s.serves.length) {
      const sinceLast = Date.now() - s.serves[s.serves.length - 1];
      hint.textContent = `${fmtDuration(sinceLast)} since last serve`;
    } else {
      hint.textContent = 'tap anywhere in the circle';
    }
  }

  function spawnFx(count) {
    const layer = $('#fxLayer');

    const plus = document.createElement('span');
    plus.className = 'float-plus';
    plus.textContent = '+1';
    plus.style.left = `${44 + Math.random() * 12}%`;
    plus.style.top = '30%';
    layer.appendChild(plus);
    setTimeout(() => plus.remove(), 900);

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    layer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 720);

    const btn = $('#tapBtn');
    btn.classList.remove('bump');
    void btn.offsetWidth;               // restart the animation
    btn.classList.add('bump');

    const digits = $('#tapCount');
    digits.classList.remove('tick');
    void digits.offsetWidth;
    digits.classList.add('tick');

    if (count === Store.getGoal()) {
      toast(`🎾 Goal reached — ${count} serves!`);
      buzz([0, 40, 60, 40]);
    }
  }

  function countServe() {
    const s = Store.addServe();
    spawnFx(s.serves.length);
    buzz(12);
  }

  function countOverhead() {
    Store.addOverhead();
    const btn = $('#overheadsBtn');
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
    const digits = $('#overheadsCount');
    digits.classList.remove('tick');
    void digits.offsetWidth;
    digits.classList.add('tick');
    buzz(12);
  }

  $('#tapBtn').addEventListener('click', countServe);
  $('#overheadsBtn').addEventListener('click', countOverhead);

  // The session strip doubles as a shortcut into the active session's serve
  // log — everywhere else in the app, tapping a row for detail is already
  // the pattern. The End button inside it stays its own separate target.
  $('#sessionStrip').addEventListener('click', (e) => {
    if (e.target.closest('#endSessionBtn')) return;
    const s = Store.active();
    if (s) renderServeLog(s.id);
  });

  $('#undoBtn').addEventListener('click', () => {
    const result = Store.undo();
    if (!result) return toast('Nothing to undo');
    const { session: s, type } = result;
    buzz(20);
    const count = type === 'overhead' ? s.overheads.length : s.serves.length;
    toast(`Removed one ${type} — ${s.name} at ${count}`);
  });

  $('#endSessionBtn').addEventListener('click', () => {
    const s = Store.active();
    if (!s) return;
    Store.endSession();
    toast(`Session saved — ${plural(s.serves.length, 'serve')}`);
  });

  $('#newSessionBtn').addEventListener('click', () => promptNewSession());

  $('#goalBtn').addEventListener('click', () => {
    openSheet(`
      <h3>Session goal</h3>
      <p class="sub">The ring around the counter fills as you approach it.</p>
      <input class="field" id="goalInput" type="number" inputmode="numeric" min="1" value="${Store.getGoal()}" />
      <div class="sheet-actions">
        <button class="btn-secondary" data-close>Cancel</button>
        <button class="btn-primary" id="goalSave">Save</button>
      </div>`, (root) => {
      const input = root.querySelector('#goalInput');
      input.focus(); input.select();
      root.querySelector('#goalSave').addEventListener('click', () => {
        Store.setGoal(input.value);
        closeSheet();
        toast(`Goal set to ${Store.getGoal()}`);
      });
    });
  });

  function promptNewSession() {
    const running = Store.active();
    openSheet(`
      <h3>${running ? 'Start a new session' : 'Start a session'}</h3>
      <p class="sub">${running ? `“${esc(running.name)}” will be saved and closed.` : 'Give it a name, or just hit start.'}</p>
      <input class="field" id="nameInput" type="text" placeholder="e.g. Flat serves — court 3" />
      <div class="sheet-actions">
        <button class="btn-secondary" data-close>Cancel</button>
        <button class="btn-primary" id="startBtn">Start</button>
      </div>`, (root) => {
      const input = root.querySelector('#nameInput');
      const go = () => {
        const s = Store.startSession(input.value);
        closeSheet();
        toast(`${s.name} started`);
      };
      root.querySelector('#startBtn').addEventListener('click', go);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      input.focus();
    });
  }

  /* ── SESSIONS view ───────────────────────────────────── */
  function renderSessions() {
    const list = $('#sessionList');
    const all = Store.sessions();
    $('#sessionsCount').textContent = all.length;
    openRow = null;

    if (!all.length) {
      list.innerHTML = `<div class="empty"><strong>No sessions yet</strong>Head to Count and start tapping — a session begins on your first serve.</div>`;
      return;
    }

    const byDay = {};
    all.forEach((s) => {
      const k = Store.dayKey(s.startedAt);
      (byDay[k] = byDay[k] || []).push(s);
    });

    list.innerHTML = Object.keys(byDay)
      .sort((a, b) => b.localeCompare(a))
      .map((k) => {
        const rows = byDay[k].sort((a, b) => b.startedAt - a.startedAt);
        const total = rows.reduce((n, s) => n + s.serves.length, 0);
        return `<div class="day-group">
          <div class="section-header"><span>${fmtDayLabel(k)} · ${plural(rows.length, 'session')}</span><span class="total">${total}</span></div>
          <div class="grouped-list">${rows.map(sessionCard).join('')}</div>
        </div>`;
      }).join('') + '<p class="swipe-hint">Tap a session to edit it — swipe left to delete.</p>';
  }

  function sessionCard(s) {
    const live = Store.active() && Store.active().id === s.id;
    const total = s.serves.length + s.overheads.length;
    const meta = `${fmtTime(s.startedAt)}${s.endedAt ? ` – ${fmtTime(s.endedAt)}` : ''} · ${fmtDuration(sessionLength(s))}${live ? ' · live' : ''}`;
    const tally = `${plural(s.serves.length, 'serve')} · ${plural(s.overheads.length, 'overhead')} · <span class="row-tally-total">${total} total</span>`;
    return `<div class="row-wrap" data-id="${s.id}">
      <button class="row-delete-action" data-act="delete" aria-label="Delete ${esc(s.name)}">Delete</button>
      <article class="row${live ? ' live' : ''}" data-id="${s.id}" data-act="edit">
        <span class="row-count">${s.serves.length}</span>
        <div class="row-body">
          <div class="row-title">${esc(s.name)}</div>
          <div class="row-sub">${meta}</div>
          <div class="row-tally">${tally}</div>
        </div>
        <svg class="row-chevron" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>
      </article>
    </div>`;
  }

  /* Swipe-left-to-delete on session rows, iOS list style: drag a row to
     reveal a Delete button behind it; a plain tap opens Edit; tapping an
     already-open row closes it instead of opening Edit. Only one row is
     open at a time, and delegation means freshly rendered rows need no
     re-wiring. */
  const ROW_OPEN = -92;
  let openRow = null;

  function closeOpenRow() {
    if (!openRow) return;
    openRow.style.transform = '';
    openRow.dataset.open = '';
    openRow = null;
  }

  (() => {
    let dragEl = null, startX = 0, startY = 0, dx = 0, deciding = true, horizontal = false;

    document.addEventListener('pointerdown', (e) => {
      const row = e.target.closest('.row');
      const onDeleteAction = e.target.closest('.row-delete-action');
      // The delete button lives beside .row, not inside it (it's revealed
      // from underneath), so a tap on it isn't a tap on `row` — without this
      // check it read as "tapped outside the open row" and closed the row
      // out from under the tap before the click could ever reach the button.
      if (openRow && row !== openRow && !onDeleteAction) closeOpenRow();
      if (!row || onDeleteAction) return;
      dragEl = row; startX = e.clientX; startY = e.clientY; dx = 0;
      deciding = true; horizontal = false;
    });

    document.addEventListener('pointermove', (e) => {
      if (!dragEl) return;
      const ex = e.clientX - startX, ey = e.clientY - startY;
      if (deciding) {
        if (Math.abs(ex) < 6 && Math.abs(ey) < 6) return;
        horizontal = Math.abs(ex) > Math.abs(ey);
        deciding = false;
        if (horizontal) { dragEl.classList.add('dragging'); dragEl.setPointerCapture(e.pointerId); }
        else { dragEl = null; return; }
      }
      const base = dragEl.dataset.open ? ROW_OPEN : 0;
      dx = Math.max(ROW_OPEN - 12, Math.min(0, base + ex));
      dragEl.style.transform = `translateX(${dx}px)`;
    });

    function release() {
      if (!dragEl) return;
      dragEl.classList.remove('dragging');
      const wasDragged = !deciding && horizontal;
      if (wasDragged) {
        if (dx <= ROW_OPEN / 2) {
          dragEl.style.transform = `translateX(${ROW_OPEN}px)`;
          dragEl.dataset.open = '1';
          openRow = dragEl;
        } else {
          dragEl.style.transform = '';
          dragEl.dataset.open = '';
          if (openRow === dragEl) openRow = null;
        }
      } else if (dragEl.dataset.open) {
        closeOpenRow();
      } else {
        editSession(dragEl.dataset.id);
      }
      dragEl = null;
    }
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
  })();

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeSheet(); return; }

    const del = e.target.closest('.row-delete-action');
    if (del) { confirmDelete(del.closest('.row-wrap').dataset.id); return; }
  });

  function editSession(id) {
    const s = Store.byId(id);
    if (!s) return;
    const live = Store.active() && Store.active().id === id;
    openSheet(`
      <h3>Edit session</h3>
      <p class="sub">${fmtDayLabel(Store.dayKey(s.startedAt))} · ${fmtTime(s.startedAt)}</p>
      <input class="field" id="nameInput" type="text" value="${esc(s.name)}" />
      <div class="sheet-actions" style="grid-template-columns: auto 1fr auto; align-items:center;">
        <button class="adj-btn" data-adj="-1" aria-label="Remove one serve">−</button>
        <div class="adj-count" id="adjCount">${s.serves.length}</div>
        <button class="adj-btn" data-adj="1" aria-label="Add one serve">+</button>
      </div>
      <button class="ghost-btn" id="viewLogBtn" style="width:100%; margin: 12px 0 4px;">📈 View serve log</button>
      <div class="sheet-actions" style="margin-top:12px;">
        <button class="btn-secondary" id="resumeBtn">${live ? 'End session' : 'Resume'}</button>
        <button class="btn-primary" id="saveBtn">Save</button>
      </div>`, (root) => {
      root.querySelectorAll('[data-adj]').forEach((b) => {
        b.addEventListener('click', () => {
          Store.adjust(id, Number(b.dataset.adj));
          root.querySelector('#adjCount').textContent = Store.byId(id).serves.length;
        });
      });
      root.querySelector('#viewLogBtn').addEventListener('click', () => renderServeLog(id));
      root.querySelector('#resumeBtn').addEventListener('click', () => {
        if (live) { Store.endSession(id); toast('Session ended'); }
        else { Store.resumeSession(id); toast(`Resumed ${Store.byId(id).name}`); }
        closeSheet();
      });
      root.querySelector('#saveBtn').addEventListener('click', () => {
        Store.renameSession(id, root.querySelector('#nameInput').value);
        closeSheet();
        toast('Session updated');
      });
    });
  }

  /* ── Serve log ───────────────────────────────────────── */
  // Every serve's timestamp is already recorded (that's how the app derives
  // duration and rate elsewhere) — this just surfaces it directly: each
  // serve in order, with the gap since the one before it.
  function renderServeLog(id) {
    const s = Store.byId(id);
    if (!s) return;
    const serves = s.serves;
    const gaps = [];
    for (let i = 1; i < serves.length; i++) gaps.push(serves[i] - serves[i - 1]);
    const avgGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const fastest = gaps.length ? Math.min(...gaps) : 0;
    const slowest = gaps.length ? Math.max(...gaps) : 0;

    const items = serves.map((ts, i) => ({
      n: i + 1,
      ts,
      gap: i === 0 ? null : ts - serves[i - 1],
    }));

    const rows = items.map((it) => `
      <div class="log-row">
        <span class="log-index">${it.n}</span>
        <span class="log-time">${fmtTime(it.ts)}</span>
        <span class="log-gap">${it.gap === null ? 'First serve' : '+' + fmtDuration(it.gap)}</span>
      </div>`).join('');

    openSheet(`
      <h3>Serve log</h3>
      <p class="sub">${esc(s.name)} · ${fmtDayLabel(Store.dayKey(s.startedAt))}${s.overheads.length ? ` · ${plural(s.overheads.length, 'overhead')}` : ''}</p>
      <div class="log-summary">
        <div><span class="log-summary-num">${serves.length}</span><span class="log-summary-lbl">Serves</span></div>
        <div><span class="log-summary-num">${gaps.length ? fmtDuration(avgGap) : '—'}</span><span class="log-summary-lbl">Avg gap</span></div>
        <div><span class="log-summary-num">${gaps.length ? fmtDuration(fastest) : '—'}</span><span class="log-summary-lbl">Fastest</span></div>
        <div><span class="log-summary-num">${gaps.length ? fmtDuration(slowest) : '—'}</span><span class="log-summary-lbl">Slowest</span></div>
      </div>
      ${serves.length
        ? `<div class="log-list">${rows}</div>`
        : `<div class="empty">No serves logged yet.</div>`}
      <div class="sheet-actions" style="grid-template-columns: 1fr; margin-top: 14px;">
        <button class="btn-secondary" data-close>Close</button>
      </div>`);
  }

  function confirmDelete(id) {
    const s = Store.byId(id);
    if (!s) return;
    openSheet(`
      <h3>Delete this session?</h3>
      <p class="sub">“${esc(s.name)}” with ${plural(s.serves.length, 'serve')} will be removed. This can't be undone.</p>
      <div class="sheet-actions">
        <button class="btn-secondary" data-close>Keep it</button>
        <button class="btn-primary destructive" id="confirmDel">Delete</button>
      </div>`, (root) => {
      root.querySelector('#confirmDel').addEventListener('click', () => {
        Store.deleteSession(id);
        closeSheet();
        toast('Session deleted');
      });
    });
  }

  /* ── CALENDAR view ───────────────────────────────────── */
  function renderCalendar() {
    const totals = Store.dailyTotals();
    const overheadTotals = Store.dailyOverheadTotals();
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = Store.dayKey(Date.now());

    $('#calMonth').textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });

    let monthTotal = 0, monthDays = 0, monthMax = 0, monthOverheads = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const k = Store.dayKey(new Date(year, month, d).getTime());
      const n = totals[k] || 0;
      if (n) { monthTotal += n; monthDays++; }
      if (n > monthMax) monthMax = n;
      monthOverheads += overheadTotals[k] || 0;
    }
    $('#calSummary').textContent = monthTotal
      ? `${monthTotal} serves over ${plural(monthDays, 'day')}${monthOverheads ? ` · ${plural(monthOverheads, 'overhead')}` : ''}`
      : 'No serves logged this month';

    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-cell blank"></div>');

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const k = Store.dayKey(date.getTime());
      const n = totals[k] || 0;
      const lvl = n === 0 ? 0 : Math.min(4, Math.ceil((n / (monthMax || 1)) * 4));
      const classes = [
        'cal-cell', `lvl-${lvl}`,
        k === todayKey ? 'today' : '',
        k === selectedDay ? 'selected' : '',
        date > new Date() && k !== todayKey ? 'future' : '',
      ].filter(Boolean).join(' ');
      cells.push(`<button class="${classes}" data-day="${k}" aria-label="${k}, ${plural(n, 'serve')}">
        <span class="d">${d}</span>${n ? `<span class="c">${n}</span>` : ''}
      </button>`);
    }

    $('#calGrid').innerHTML = cells.join('');
    $$('#calGrid [data-day]').forEach((cell) => {
      cell.addEventListener('click', () => {
        selectedDay = cell.dataset.day;
        renderCalendar();
        $('#dayPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });

    renderDayPanel();
  }

  function renderDayPanel() {
    const rows = Store.sessionsOn(selectedDay);
    const total = rows.reduce((n, s) => n + s.serves.length, 0);
    const panel = $('#dayPanel');
    openRow = null;

    if (!rows.length) {
      panel.innerHTML = `<div class="section-header"><span>${fmtDayLabel(selectedDay)}</span><span class="total">0</span></div>
        <div class="empty">Nothing logged on this day.</div>`;
      return;
    }

    panel.innerHTML = `<div class="section-header">
        <span>${fmtDayLabel(selectedDay)} · ${plural(rows.length, 'session')}</span><span class="total">${total}</span>
      </div>
      <div class="grouped-list">${rows.map(sessionCard).join('')}</div>`;
  }

  $('#prevMonth').addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  $('#nextMonth').addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  /* ── STATS view ──────────────────────────────────────── */
  function renderStats() {
    const st = Store.stats();
    $('#sTotal').textContent = st.total;
    $('#sSessions').textContent = st.sessionCount;
    $('#sAvg').textContent = st.avgPerSession;
    $('#sBest').textContent = st.bestDay;
    $('#sDays').textContent = st.activeDays;
    $('#sStreak').textContent = st.streak;
    $('#sOverheads').textContent = st.totalOverheads;

    const totals = Store.dailyTotals();
    const overheadTotals = Store.dailyOverheadTotals();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = Store.dayKey(d.getTime());
      days.push({ k, n: totals[k] || 0, label: d.toLocaleDateString([], { weekday: 'narrow' }) });
    }
    const max = Math.max(1, ...days.map((d) => d.n));
    const chartOverheads = days.reduce((n, d) => n + (overheadTotals[d.k] || 0), 0);
    $('#chartTotal').textContent = `${days.reduce((n, d) => n + d.n, 0)} serves${chartOverheads ? ` · ${plural(chartOverheads, 'overhead')}` : ''}`;
    $('#chart').innerHTML = days.map((d, i) => `
      <div class="bar-wrap" title="${d.k}: ${plural(d.n, 'serve')}">
        <span class="bar-val">${d.n || ''}</span>
        <div class="bar${d.n ? '' : ' zero'}" style="height:${d.n ? Math.max(4, (d.n / max) * 100) : 2}%; animation-delay:${i * 28}ms"></div>
        <span class="bar-lbl">${d.label}</span>
      </div>`).join('');

    $('#bestList').innerHTML = [
      ['Best single session', st.bestSession ? `${st.bestSession} — ${esc(st.bestSessionName)}` : '—'],
      ['Best day', st.bestDayKey ? `${st.bestDay} — ${fmtDayLabel(st.bestDayKey)}` : '—'],
      ['Serves per active day', st.activeDays ? Math.round(st.total / st.activeDays) : 0],
      ['Current streak', plural(st.streak, 'day')],
      ['Total overheads', st.totalOverheads],
    ].map(([k, v]) => `<li><span class="k">${k}</span><span class="v">${v}</span></li>`).join('');
  }

  /* ── Excel export ────────────────────────────────────── */
  // The xlsx builder (and its jszip dependency) are only pulled in when
  // this actually runs, via a dynamic import — most sessions never touch
  // it, so it shouldn't cost anyone bundle size on every load.
  async function exportXLSXFile() {
    const { buildWorkbook } = await import('./xlsx.js');

    const sessions = [...Store.sessions()].sort((a, b) => a.startedAt - b.startedAt);
    const sessionRows = sessions.map((s) => {
      const durationMin = sessionLength(s) / 60000;
      const rate = durationMin > 0.1 ? s.serves.length / durationMin : 0;
      return [
        Store.dayKey(s.startedAt),
        s.name,
        fmtTime(s.startedAt),
        s.endedAt ? fmtTime(s.endedAt) : '',
        Math.round(durationMin * 10) / 10,
        s.serves.length,
        Math.round(rate * 10) / 10,
        s.overheads.length,
        s.endedAt ? 'Completed' : 'Live',
      ];
    });

    const totals = Store.dailyTotals();
    const overheadTotals = Store.dailyOverheadTotals();
    const dayRows = Object.keys(totals).sort()
      .map((k) => [k, totals[k], overheadTotals[k] || 0, Store.sessionsOn(k).length]);

    const st = Store.stats();
    const summaryRows = [
      ['Total serves', st.total],
      ['Total overheads', st.totalOverheads],
      ['Total sessions', st.sessionCount],
      ['Avg serves / session', st.avgPerSession],
      ['Best day', st.bestDayKey || '—'],
      ['Best day serves', st.bestDay],
      ['Best session', st.bestSessionName || '—'],
      ['Best session serves', st.bestSession],
      ['Active days', st.activeDays],
      ['Current streak (days)', st.streak],
      ['Exported', new Date().toLocaleString()],
    ];

    const blob = await buildWorkbook([
      {
        name: 'Sessions',
        columns: [
          { header: 'Date', width: 12 },
          { header: 'Session', width: 26 },
          { header: 'Start', width: 10 },
          { header: 'End', width: 10 },
          { header: 'Duration (min)', width: 14 },
          { header: 'Serves', width: 9 },
          { header: 'Serves/min', width: 11 },
          { header: 'Overheads', width: 11 },
          { header: 'Status', width: 11 },
        ],
        rows: sessionRows,
      },
      {
        name: 'Daily Totals',
        columns: [
          { header: 'Date', width: 12 },
          { header: 'Total Serves', width: 13 },
          { header: 'Total Overheads', width: 15 },
          { header: 'Sessions', width: 10 },
        ],
        rows: dayRows,
      },
      {
        name: 'Summary',
        columns: [
          { header: 'Metric', width: 22 },
          { header: 'Value', width: 24 },
        ],
        rows: summaryRows,
      },
    ]);

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `serveapp-export-${Store.dayKey(Date.now())}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    closeSheet();
    toast('Excel file downloaded');
  }

  /* ── data menu ───────────────────────────────────────── */
  $('#menuBtn').addEventListener('click', () => {
    openSheet(`
      <h3>Your data</h3>
      <p class="sub">Everything is stored on this device only. Export a backup before clearing your browser data.</p>
      <ul class="sheet-menu">
        <li><button id="exportBtn">⬇︎ Export backup (.json)</button></li>
        <li><button id="exportXlsxBtn">📊 Export as Excel (.xlsx)</button></li>
        <li><button id="importBtn">⬆︎ Import backup</button></li>
        <li><button id="clearBtn" class="destructive">Delete all data</button></li>
        <li><button data-close>Close</button></li>
      </ul>
      <input type="file" id="importFile" accept="application/json,.json" hidden />`, (root) => {
      root.querySelector('#exportBtn').addEventListener('click', () => {
        const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `serveapp-backup-${Store.dayKey(Date.now())}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        closeSheet();
        toast('Backup downloaded');
      });

      root.querySelector('#exportXlsxBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Preparing…';
        try {
          await exportXLSXFile();
        } catch (err) {
          toast("Couldn't build the Excel file");
        } finally {
          btn.disabled = false;
          btn.textContent = '📊 Export as Excel (.xlsx)';
        }
      });

      const file = root.querySelector('#importFile');
      root.querySelector('#importBtn').addEventListener('click', () => file.click());
      file.addEventListener('change', () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const added = Store.importJSON(String(reader.result));
            closeSheet();
            toast(`Imported ${plural(added, 'session')}`);
          } catch (err) {
            toast("That file isn't a ServeApp backup");
          }
        };
        reader.readAsText(f);
      });

      root.querySelector('#clearBtn').addEventListener('click', () => {
        openSheet(`
          <h3>Delete everything?</h3>
          <p class="sub">All sessions and serve counts on this device will be erased.</p>
          <div class="sheet-actions">
            <button class="btn-secondary" data-close>Cancel</button>
            <button class="btn-primary destructive" id="confirmClear">Delete all</button>
          </div>`, (r2) => {
          r2.querySelector('#confirmClear').addEventListener('click', () => {
            Store.clearAll();
            closeSheet();
            toast('All data cleared');
          });
        });
      });
    });
  });

  /* ── tabs ────────────────────────────────────────────── */
  const SUBTITLES = {
    count: 'Tap. Track. Improve.',
    sessions: 'Every set you have logged',
    calendar: 'Your practice, month by month',
    stats: 'The long view',
  };

  function showView(name) {
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${name}`));
    $$('.tab').forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $('#topbarSub').textContent = SUBTITLES[name];
    if (name === 'calendar') renderCalendar();
    if (name === 'stats') renderStats();
    if (name === 'sessions') renderSessions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

  /* ── condensing large-title header ────────────────────── */
  let scrollTicking = false;
  function updateTopbar() {
    scrollTicking = false;
    $('.topbar').classList.toggle('is-condensed', window.scrollY > 24);
  }
  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateTopbar);
  }, { passive: true });

  /* ── keyboard shortcuts (handy on a laptop) ──────────── */
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (!$('#view-count').classList.contains('is-active')) return;
      e.preventDefault();
      countServe();
    }
    if ((e.key === 'z' || e.key === 'Z') && !e.metaKey && !e.ctrlKey) $('#undoBtn').click();
    if (e.key === 'Escape') closeSheet();
  });

  /* ── boot ────────────────────────────────────────────── */
  function renderAll() {
    renderCount();
    if ($('#view-sessions').classList.contains('is-active')) renderSessions();
    if ($('#view-calendar').classList.contains('is-active')) renderCalendar();
    if ($('#view-stats').classList.contains('is-active')) renderStats();
  }

  Store.subscribe(renderAll);
  renderAll();

  clockTimer = setInterval(() => {
    if ($('#view-count').classList.contains('is-active')) tickClock();
  }, 1000);

  // Keep counts honest when the app is left open across midnight.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline cache is optional */ });
    });
  }
})();
