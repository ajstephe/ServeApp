/* ==========================================================
   store.js — data layer for ServeApp
   Everything lives in localStorage, so the app works offline
   and needs no account. Shape:

   {
     version: 1,
     goal: 50,
     activeId: "s_ab12" | null,
     sessions: [
       { id, name, startedAt, endedAt|null, serves: [epochMs, ...] }
     ]
   }
   ========================================================== */

export const Store = (() => {
  const KEY = 'serveapp.v1';
  const UNDO_LIMIT = 200;

  let state = load();
  const undoStack = [];   // { type, sessionId, ts } — newest last
  const listeners = [];

  function blank() {
    return { version: 1, goal: 50, activeId: null, sessions: [] };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.sessions)) return blank();
      const merged = Object.assign(blank(), parsed);
      // Sessions saved before overheads existed won't have the array.
      merged.sessions.forEach((s) => { if (!Array.isArray(s.overheads)) s.overheads = []; });
      return merged;
    } catch (err) {
      console.warn('ServeApp: could not read saved data', err);
      return blank();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('ServeApp: could not save data', err);
    }
  }

  function emit() {
    save();
    listeners.forEach((fn) => fn(state));
  }

  function uid() {
    return 's_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  /* ── date helpers (all local time, never UTC) ─────────── */
  function dayKey(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function defaultName(ts) {
    const h = new Date(ts).getHours();
    const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
    return `${part} session`;
  }

  /* ── reads ───────────────────────────────────────────── */
  const get = () => state;
  const getGoal = () => state.goal || 50;
  const sessions = () => state.sessions;
  const byId = (id) => state.sessions.find((s) => s.id === id) || null;
  const active = () => (state.activeId ? byId(state.activeId) : null);
  const canUndo = () => undoStack.length > 0;

  function sessionsOn(key) {
    return state.sessions
      .filter((s) => dayKey(s.startedAt) === key)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  /** { '2026-09-01': 84, ... } */
  function dailyTotals() {
    const totals = {};
    state.sessions.forEach((s) => {
      const k = dayKey(s.startedAt);
      totals[k] = (totals[k] || 0) + s.serves.length;
    });
    return totals;
  }

  /** Same shape as dailyTotals(), but counting overheads. */
  function dailyOverheadTotals() {
    const totals = {};
    state.sessions.forEach((s) => {
      const k = dayKey(s.startedAt);
      totals[k] = (totals[k] || 0) + s.overheads.length;
    });
    return totals;
  }

  function totalOn(key) {
    return sessionsOn(key).reduce((n, s) => n + s.serves.length, 0);
  }

  function totalOverheadsOn(key) {
    return sessionsOn(key).reduce((n, s) => n + s.overheads.length, 0);
  }

  /* ── writes ──────────────────────────────────────────── */
  function startSession(name, ts = Date.now()) {
    const s = { id: uid(), name: (name || '').trim() || defaultName(ts), startedAt: ts, endedAt: null, serves: [], overheads: [] };
    // Only one session runs at a time.
    const current = active();
    if (current) current.endedAt = current.endedAt || ts;
    state.sessions.push(s);
    state.activeId = s.id;
    emit();
    return s;
  }

  function endSession(id = state.activeId) {
    const s = byId(id);
    if (!s) return null;
    s.endedAt = Date.now();
    if (state.activeId === id) state.activeId = null;
    emit();
    return s;
  }

  function resumeSession(id) {
    const s = byId(id);
    if (!s) return null;
    const current = active();
    if (current && current.id !== id) current.endedAt = current.endedAt || Date.now();
    s.endedAt = null;
    state.activeId = id;
    emit();
    return s;
  }

  /** Counts one serve, auto-starting a session when none is running. */
  function addServe(ts = Date.now()) {
    let s = active();
    if (!s) s = startSession(null, ts);
    s.serves.push(ts);
    undoStack.push({ type: 'serve', sessionId: s.id, ts });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    emit();
    return s;
  }

  /** Counts one overhead, auto-starting a session when none is running. */
  function addOverhead(ts = Date.now()) {
    let s = active();
    if (!s) s = startSession(null, ts);
    s.overheads.push(ts);
    undoStack.push({ type: 'overhead', sessionId: s.id, ts });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    emit();
    return s;
  }

  /** Reverses the most recent counted serve or overhead. Returns
   *  { session, type } for whichever it was. */
  function undo() {
    const op = undoStack.pop();
    if (!op) return null;
    const s = byId(op.sessionId);
    if (!s) return undo();          // session was deleted — skip to the next op
    const arr = op.type === 'overhead' ? s.overheads : s.serves;
    const i = arr.lastIndexOf(op.ts);
    if (i !== -1) arr.splice(i, 1);
    else arr.pop();
    emit();
    return { session: s, type: op.type };
  }

  function renameSession(id, name) {
    const s = byId(id);
    if (!s) return;
    s.name = (name || '').trim() || defaultName(s.startedAt);
    emit();
  }

  function deleteSession(id) {
    state.sessions = state.sessions.filter((s) => s.id !== id);
    if (state.activeId === id) state.activeId = null;
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (undoStack[i].sessionId === id) undoStack.splice(i, 1);
    }
    emit();
  }

  function adjust(id, delta) {
    const s = byId(id);
    if (!s) return;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) s.serves.push(Date.now());
    } else {
      for (let i = 0; i < -delta && s.serves.length; i++) s.serves.pop();
    }
    emit();
  }

  function setGoal(n) {
    state.goal = Math.max(1, Math.round(Number(n) || 50));
    emit();
  }

  function clearAll() {
    state = blank();
    undoStack.length = 0;
    emit();
  }

  /* ── stats ───────────────────────────────────────────── */
  function stats() {
    const all = state.sessions;
    const total = all.reduce((n, s) => n + s.serves.length, 0);
    const totalOverheads = all.reduce((n, s) => n + s.overheads.length, 0);
    const totals = dailyTotals();
    const days = Object.keys(totals);
    const counted = all.filter((s) => s.serves.length > 0);

    let bestDay = 0, bestDayKey = null;
    days.forEach((k) => { if (totals[k] > bestDay) { bestDay = totals[k]; bestDayKey = k; } });

    let bestSession = 0, bestSessionName = null;
    all.forEach((s) => { if (s.serves.length > bestSession) { bestSession = s.serves.length; bestSessionName = s.name; } });

    // Current streak of consecutive days with at least one serve.
    let streak = 0;
    const cursor = new Date();
    if (!totals[dayKey(cursor.getTime())]) cursor.setDate(cursor.getDate() - 1); // today may not have started yet
    while (totals[dayKey(cursor.getTime())]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return {
      total,
      totalOverheads,
      sessionCount: all.length,
      avgPerSession: counted.length ? Math.round(total / counted.length) : 0,
      bestDay, bestDayKey,
      bestSession, bestSessionName,
      activeDays: days.length,
      streak,
    };
  }

  function exportJSON() {
    return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  }

  /** Merges an exported file back in, skipping sessions already present. */
  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.sessions)) throw new Error('Not a ServeApp backup');
    const seen = new Set(state.sessions.map((s) => s.id));
    let added = 0;
    data.sessions.forEach((s) => {
      if (!s || seen.has(s.id) || !Array.isArray(s.serves)) return;
      state.sessions.push({
        id: s.id || uid(),
        name: s.name || defaultName(s.startedAt || Date.now()),
        startedAt: s.startedAt || Date.now(),
        endedAt: s.endedAt || null,
        serves: s.serves.filter((n) => typeof n === 'number'),
        overheads: Array.isArray(s.overheads) ? s.overheads.filter((n) => typeof n === 'number') : [],
      });
      added++;
    });
    if (typeof data.goal === 'number') state.goal = data.goal;
    state.activeId = null;
    emit();
    return added;
  }

  const subscribe = (fn) => { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); };

  return {
    get, getGoal, setGoal, sessions, byId, active, sessionsOn, dailyTotals, totalOn,
    dailyOverheadTotals, totalOverheadsOn,
    startSession, endSession, resumeSession, addServe, addOverhead, undo, canUndo,
    renameSession, deleteSession, adjust, clearAll,
    stats, dayKey, exportJSON, importJSON, subscribe,
  };
})();
