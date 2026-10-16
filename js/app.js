/* ==========================================================================
   Tasks — application logic
   Plain browser JavaScript: no build step, no dependencies. All data is kept
   in localStorage under STORAGE_KEY (see README.md for the format).
   ========================================================================== */
(() => {
  'use strict';

  // ---------- Constants ----------

  const STORAGE_KEY = 'taskmanager-v2';
  const SCHEMA_VERSION = 2;
  const UNDO_MS = 6000;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

  const PRIORITIES = {
    low:    { label: 'Low',    rank: 0 },
    normal: { label: 'Normal', rank: 1 },
    high:   { label: 'High',   rank: 2 },
    urgent: { label: 'Urgent', rank: 3 },
  };
  const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];
  const REPEAT_UNITS = ['day', 'week', 'month', 'year'];
  const REPEAT_MAX_EVERY = 99;

  const CATEGORY_COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#64748b',
  ];

  const VIEWS = {
    all:       { label: 'All tasks', icon: 'inbox' },
    today:     { label: 'Today',     icon: 'today' },
    upcoming:  { label: 'Upcoming',  icon: 'calendar' },
    overdue:   { label: 'Overdue',   icon: 'alert' },
    completed: { label: 'Completed', icon: 'check-circle' },
  };
  const VIEW_KEYS = Object.keys(VIEWS);
  const SORTS = ['due', 'priority', 'created', 'title'];
  const THEMES = ['system', 'light', 'dark'];
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MODES = ['tasks', 'schedule'];
  const REMIND_OPTIONS = [0, 5, 10, 15, 30, 60]; // minutes before a block switch
  const REMIND_TOLERANCE_MIN = 2;                 // still fire up to this long after the moment (timer throttling, wake from sleep)
  const FIRED_KEY = STORAGE_KEY + ':fired';
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];          // 0 = Sunday, as in Date#getDay
  const WEEKDAY_SHORT = ALL_DAYS.map(i => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })); // 2023-01-01 was a Sunday
  const WEEKDAY_LONG = ALL_DAYS.map(i => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'long' }));

  const DEFAULT_SETTINGS = {
    theme: 'system',          // 'system' | 'light' | 'dark'
    view: 'all',              // key of VIEWS
    sort: 'due',              // one of SORTS
    priorityFilter: 'all',    // 'all' | priority key
    showCompleted: false,     // include completed tasks in All / Today / Upcoming
    showUncategorized: true,  // toggle for tasks without a category
    mode: 'tasks',            // 'tasks' | 'schedule'
    remindMinutes: 10,        // schedule reminders fire this many minutes before a block starts / ends
    reminderSound: true,      // also play a short sound with each reminder
    focus: null,              // Tasks narrowed to one category by the running block: { categoryId, blockId, snapshot }
  };

  const ICON_PATHS = {
    'check':        '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/>',
    'flag':         '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    'trash':        '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6h12"/><path d="M10 11v6M14 11v6"/>',
    'edit':         '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    'calendar':     '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'today':        '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none"/>',
    'inbox':        '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'alert':        '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    'sun':          '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    'moon':         '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    'x':            '<path d="M18 6 6 18M6 6l12 12"/>',
    'plus':         '<path d="M12 5v14M5 12h14"/>',
    'clock':        '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'bell':         '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    'bell-off':     '<path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.9 17.9 0 0 1 18 8M6.26 6.26A6 6 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.33-5M2 2l20 20"/>',
    'chevron-left': '<path d="m15 18-6-6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'repeat':       '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  };

  function icon(name, size) {
    const s = size || 16;
    return `<svg class="icon" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  }

  // ---------- DOM & state ----------

  const el = {};
  document.querySelectorAll('[id]').forEach(node => { el[node.id] = node; });

  let data = loadData(); // { version, categories, tasks, blocks, settings }

  const ui = {
    today: todayStr(),
    search: '',
    editingTaskId: null,
    editingCategoryId: null,
    pendingImport: null,
    editingBlockId: null,
    scheduleDate: todayStr(), // the day shown in the schedule view
    fired: loadFired(),       // reminder keys already delivered today
  };

  // ---------- Small helpers ----------

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function nowIso() { return new Date().toISOString(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return toDateStr(new Date()); }
  function parseDateStr(s) {
    const p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]); // local midnight
  }
  function isDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = parseDateStr(s);
    return !isNaN(d.getTime()) && toDateStr(d) === s;
  }
  function addDays(dateStr, n) {
    const d = parseDateStr(dateStr);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }
  function daysFromToday(dateStr) {
    return Math.round((parseDateStr(dateStr) - parseDateStr(ui.today)) / 86400000);
  }
  function isoOr(value, fallback) {
    if (typeof value === 'string' && value && !isNaN(Date.parse(value))) return new Date(value).toISOString();
    return fallback;
  }
  function isHexColor(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function plural(n, word, pluralWord) {
    return n + ' ' + (n === 1 ? word : (pluralWord || word + 's'));
  }
  function truncate(s, n) {
    const max = n || 40;
    return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
  }
  function getTask(id) { return data.tasks.find(t => t.id === id) || null; }
  function getCategory(id) { return data.categories.find(c => c.id === id) || null; }
  function categoryIdSet() { return new Set(data.categories.map(c => c.id)); }
  function submitForm(form) {
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  // Clock-time helpers. Block times are stored as 'HH:MM'; maths is done in minutes since midnight.
  function isHm(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function hmToMin(s) { const p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function minToHm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function weekdayOf(dateStr) { return parseDateStr(dateStr).getDay(); }
  function startOfWeek(dateStr) { return addDays(dateStr, -((weekdayOf(dateStr) + 6) % 7)); } // Monday
  function fmtTime(min) {
    return new Date(2000, 0, 1, Math.floor(min / 60), Math.floor(min % 60)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtHour(h) { return new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }); }
  /** "at the switch", "5 min before", "1 hour before" */
  function fmtLead(min) {
    if (!min) return 'at the switch';
    if (min % 60 === 0) return (min === 60 ? '1 hour' : (min / 60) + ' hours') + ' before';
    return min + ' min before';
  }

  function fmtDuration(min) {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r} min`;
  }
  function fmtRange(b) { return `${fmtTime(hmToMin(b.start))}–${fmtTime(hmToMin(b.end))}`; }
  function fmtDays(days) {
    if (days.length === 7) return 'Every day';
    const key = days.join(',');
    if (key === '1,2,3,4,5') return 'Weekdays';
    if (key === '0,6') return 'Weekends';
    return days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WEEKDAY_SHORT[d]).join(', ');
  }
  function getBlock(id) { return data.blocks.find(b => b.id === id) || null; }
  function taskIdSet() { return new Set(data.tasks.map(t => t.id)); }

  // ---------- Persistence & normalization ----------

  function loadData() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (e) { console.warn('Tasks: could not read saved data', e); }
    return normalizeData(raw);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) {
      console.error(e);
      toast('Could not save — browser storage may be full or blocked.', { type: 'error' });
    }
  }

  function commit() { save(); render(); }

  /** Turns anything (saved data, an imported file, nothing) into a valid data object. */
  function normalizeData(raw) {
    const out = { version: SCHEMA_VERSION, categories: [], tasks: [], blocks: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
    if (!raw || typeof raw !== 'object') return out;

    const catIds = new Set();
    if (Array.isArray(raw.categories)) {
      for (const c of raw.categories) {
        const cat = normalizeCategory(c, out.categories.length);
        if (cat && !catIds.has(cat.id)) { catIds.add(cat.id); out.categories.push(cat); }
      }
    }
    const taskIds = new Set();
    if (Array.isArray(raw.tasks)) {
      for (const t of raw.tasks) {
        const task = normalizeTask(t, catIds);
        if (task && !taskIds.has(task.id)) { taskIds.add(task.id); out.tasks.push(task); }
      }
    }
    const blockIds = new Set();
    if (Array.isArray(raw.blocks)) {
      for (const b of raw.blocks) {
        const block = normalizeBlock(b, out.blocks.length, taskIds, catIds);
        if (block && !blockIds.has(block.id)) { blockIds.add(block.id); out.blocks.push(block); }
      }
    }
    if (raw.settings && typeof raw.settings === 'object') out.settings = normalizeSettings(raw.settings);
    return out;
  }

  function normalizeId(v, prefix) {
    return typeof v === 'string' && ID_RE.test(v) ? v : uid(prefix);
  }

  function normalizeCategory(c, index) {
    if (!c || typeof c !== 'object') return null;
    const name = String(c.name == null ? '' : c.name).trim().slice(0, 40);
    if (!name) return null;
    return {
      id: normalizeId(c.id, 'c'),
      name,
      color: isHexColor(c.color) ? c.color.toLowerCase() : CATEGORY_COLORS[(index || 0) % CATEGORY_COLORS.length],
      enabled: c.enabled !== false,
      createdAt: isoOr(c.createdAt, nowIso()),
    };
  }

  function normalizeTask(t, catIds) {
    if (!t || typeof t !== 'object') return null;
    const title = String(t.title == null ? '' : t.title).trim().slice(0, 200);
    if (!title) return null;
    const created = isoOr(t.createdAt, nowIso());
    const completed = t.completed === true || t.completed === 'true' || t.completed === 1;
    const repeat = normalizeRepeat(t.repeat);
    const dueDate = isDateStr(t.dueDate) ? t.dueDate : (repeat ? todayStr() : null); // a repeating task needs a date to count from
    if (repeat && repeat.unit === 'week' && !repeat.days.length) repeat.days = [weekdayOf(dueDate)];
    return {
      id: normalizeId(t.id, 't'),
      title,
      notes: String(t.notes == null ? '' : t.notes).slice(0, 2000),
      categoryId: typeof t.categoryId === 'string' && catIds.has(t.categoryId) ? t.categoryId : null,
      priority: normalizePriority(t.priority),
      dueDate,
      repeat,                                                             // null, or { every, unit, days, from }
      seriesId: typeof t.seriesId === 'string' && ID_RE.test(t.seriesId) ? t.seriesId : null, // completed copies point at the repeating task
      completed,
      completedAt: completed ? isoOr(t.completedAt, created) : null,
      createdAt: created,
      updatedAt: isoOr(t.updatedAt, created),
    };
  }

  function normalizeBlock(b, index, taskIds, catIds) {
    if (!b || typeof b !== 'object') return null;
    const title = String(b.title == null ? '' : b.title).trim().slice(0, 80);
    if (!title || !isHm(b.start) || !isHm(b.end) || hmToMin(b.end) <= hmToMin(b.start)) return null;
    const date = isDateStr(b.date) ? b.date : null;
    let days = Array.isArray(b.days)
      ? Array.from(new Set(b.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((x, y) => x - y)
      : ALL_DAYS.slice();
    if (!days.length) days = ALL_DAYS.slice();
    const created = isoOr(b.createdAt, nowIso());
    const rm = b.remindMinutes == null || b.remindMinutes === '' ? NaN : Number(b.remindMinutes);
    return {
      id: normalizeId(b.id, 'b'),
      title,
      start: b.start,
      end: b.end,
      days,              // weekdays the block repeats on (ignored when `date` is set)
      date,              // 'YYYY-MM-DD' for a one-off block, otherwise null
      color: isHexColor(b.color) ? b.color.toLowerCase() : CATEGORY_COLORS[(index || 0) % CATEGORY_COLORS.length],
      taskId: typeof b.taskId === 'string' && taskIds.has(b.taskId) ? b.taskId : null,
      categoryId: typeof b.categoryId === 'string' && catIds.has(b.categoryId) ? b.categoryId : null,
      notes: String(b.notes == null ? '' : b.notes).slice(0, 500),
      notify: b.notify !== false,                                       // false = muted, no reminders at all
      remindMinutes: Number.isInteger(rm) && rm >= 0 && rm <= 1440 ? rm : null, // own lead time; null = use the default
      createdAt: created,
      updatedAt: isoOr(b.updatedAt, created),
    };
  }

  function normalizeRepeat(r) {
    if (!r || typeof r !== 'object' || !REPEAT_UNITS.includes(r.unit)) return null;
    const every = Math.min(REPEAT_MAX_EVERY, Math.max(1, Math.round(Number(r.every)) || 1));
    const days = r.unit === 'week' && Array.isArray(r.days)
      ? Array.from(new Set(r.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))).sort((x, y) => x - y)
      : [];
    return { every, unit: r.unit, days, from: r.from === 'done' ? 'done' : 'due' };
  }

  function normalizePriority(p) {
    if (typeof p === 'number' && isFinite(p)) return PRIORITY_ORDER[Math.max(0, Math.min(3, Math.round(p)))];
    const s = String(p == null ? '' : p).toLowerCase();
    if (s === 'medium' || s === 'med') return 'normal';
    return PRIORITY_ORDER.includes(s) ? s : 'normal';
  }

  function normalizeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS);
    if (THEMES.includes(s.theme)) out.theme = s.theme;
    if (VIEW_KEYS.includes(s.view)) out.view = s.view;
    if (SORTS.includes(s.sort)) out.sort = s.sort;
    if (s.priorityFilter === 'all' || PRIORITY_ORDER.includes(s.priorityFilter)) out.priorityFilter = s.priorityFilter;
    if (typeof s.showCompleted === 'boolean') out.showCompleted = s.showCompleted;
    if (typeof s.showUncategorized === 'boolean') out.showUncategorized = s.showUncategorized;
    if (MODES.includes(s.mode)) out.mode = s.mode;
    if (REMIND_OPTIONS.includes(s.remindMinutes)) out.remindMinutes = s.remindMinutes;
    if (typeof s.reminderSound === 'boolean') out.reminderSound = s.reminderSound;
    if (s.focus && typeof s.focus === 'object' && typeof s.focus.categoryId === 'string') {
      const snap = s.focus.snapshot && typeof s.focus.snapshot === 'object' ? s.focus.snapshot : {};
      const enabled = {};
      if (snap.enabled && typeof snap.enabled === 'object') Object.keys(snap.enabled).forEach(k => { enabled[k] = snap.enabled[k] !== false; });
      out.focus = {
        categoryId: s.focus.categoryId,
        blockId: typeof s.focus.blockId === 'string' ? s.focus.blockId : null,
        snapshot: { enabled, showUncategorized: snap.showUncategorized !== false },
      };
    }
    return out;
  }

  // ---------- Derived data ----------

  function isOverdue(t) { return !t.completed && !!t.dueDate && t.dueDate < ui.today; }

  function categoryVisible(t) {
    if (!t.categoryId) return data.settings.showUncategorized;
    const c = getCategory(t.categoryId);
    return c ? c.enabled : data.settings.showUncategorized;
  }

  function matchesPriority(t) {
    const f = data.settings.priorityFilter;
    return f === 'all' || t.priority === f;
  }

  function matchesView(t, view) {
    const showDone = data.settings.showCompleted;
    switch (view) {
      case 'today':
        return !!t.dueDate && (t.completed ? showDone && t.dueDate === ui.today : t.dueDate <= ui.today);
      case 'upcoming':
        return !!t.dueDate && t.dueDate > ui.today && (!t.completed || showDone);
      case 'overdue':
        return isOverdue(t);
      case 'completed':
        return t.completed;
      default:
        return !t.completed || showDone;
    }
  }

  function matchesSearch(t) {
    const q = ui.search.trim().toLowerCase();
    if (!q) return true;
    if (t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)) return true;
    const c = getCategory(t.categoryId);
    return !!c && c.name.toLowerCase().includes(q);
  }

  function visibleTasks() {
    const view = data.settings.view;
    return data.tasks
      .filter(t => matchesView(t, view) && categoryVisible(t) && matchesPriority(t) && matchesSearch(t))
      .sort(compareTasks);
  }

  function isVisibleNow(id) { return visibleTasks().some(t => t.id === id); }

  const rank = t => PRIORITIES[t.priority].rank;
  const byPriorityDesc = (a, b) => rank(b) - rank(a);
  const byCreatedDesc = (a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0);
  function byDueAsc(a, b) {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
  }

  function compareTasks(a, b) {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed) { // most recently completed first
      const ca = a.completedAt || '', cb = b.completedAt || '';
      return cb < ca ? -1 : cb > ca ? 1 : 0;
    }
    switch (data.settings.sort) {
      case 'priority': return byPriorityDesc(a, b) || byDueAsc(a, b) || byCreatedDesc(a, b);
      case 'created':  return byCreatedDesc(a, b);
      case 'title':    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || byCreatedDesc(a, b);
      default:         return byDueAsc(a, b) || byPriorityDesc(a, b) || byCreatedDesc(a, b);
    }
  }

  function computeCounts() {
    const c = { active: 0, completed: 0, overdue: 0, today: 0, upcoming: 0, uncategorized: 0, perCategory: {} };
    for (const t of data.tasks) {
      if (t.completed) { c.completed++; continue; }
      c.active++;
      if (t.dueDate) {
        if (t.dueDate < ui.today) c.overdue++;
        else if (t.dueDate === ui.today) c.today++;
        else c.upcoming++;
      }
      if (t.categoryId && getCategory(t.categoryId)) c.perCategory[t.categoryId] = (c.perCategory[t.categoryId] || 0) + 1;
      else c.uncategorized++;
    }
    return c;
  }

  function viewCount(key, c) {
    switch (key) {
      case 'all':       return c.active;
      case 'today':     return c.overdue + c.today;
      case 'upcoming':  return c.upcoming;
      case 'overdue':   return c.overdue;
      case 'completed': return c.completed;
    }
    return 0;
  }

  function formatShortDate(dateStr) {
    const d = parseDateStr(dateStr);
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  // ---------- Repeating tasks ----------

  function daysBetween(a, b) { return Math.round((parseDateStr(b) - parseDateStr(a)) / 86400000); }

  /** base + n months, keeping base's day of month where the target month has it (Jan 31 → Feb 28 → Mar 31). */
  function addMonthsClamped(dateStr, n) {
    const d = parseDateStr(dateStr);
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), last));
    return toDateStr(target);
  }

  /** First date of the series anchored at `base` that is strictly after `after`. */
  function nextOccurrence(r, base, after) {
    if (r.unit === 'day') {
      const n = Math.floor(Math.max(0, daysBetween(base, after)) / r.every) + 1;
      return addDays(base, n * r.every);
    }
    if (r.unit === 'week') {
      const days = r.days.length ? r.days : [weekdayOf(base)];
      const week0 = startOfWeek(base);
      let d = after;
      for (let i = 0; i < r.every * 7 + 7; i++) {
        d = addDays(d, 1);
        const weeks = daysBetween(week0, startOfWeek(d)) / 7;
        if (days.includes(weekdayOf(d)) && ((weeks % r.every) + r.every) % r.every === 0) return d;
      }
      return addDays(after, 1); // unreachable; keeps the function total
    }
    const step = r.unit === 'month' ? r.every : r.every * 12;
    for (let n = 1; n < 100000; n++) {
      const d = addMonthsClamped(base, n * step);
      if (d > after) return d;
    }
    return addDays(after, 1);
  }

  /** Where a repeating task goes after being ticked off: never earlier than today. */
  function nextDueAfterCompletion(t) {
    const r = t.repeat;
    if (r.from === 'done') return nextOccurrence(r, ui.today, ui.today);
    const due = t.dueDate || ui.today;
    return nextOccurrence(r, due, due >= ui.today ? due : addDays(ui.today, -1));
  }

  /** "Daily", "Every 2 weeks on Mon, Thu", "Monthly" … */
  function repeatLabel(r) {
    const unitWord = { day: 'days', week: 'weeks', month: 'months', year: 'years' }[r.unit];
    const once = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[r.unit];
    let label = r.every === 1 ? once : `Every ${r.every} ${unitWord}`;
    if (r.unit === 'week' && r.days.length) {
      const ordered = [1, 2, 3, 4, 5, 6, 0].filter(d => r.days.includes(d));
      if (ordered.length === 7) label = r.every === 1 ? 'Daily' : label + ' on every day';
      else if (ordered.join() === '1,2,3,4,5') label += ' on weekdays';
      else if (ordered.join() === '6,0') label += ' at weekends';
      else label += ' on ' + ordered.map(d => WEEKDAY_SHORT[d]).join(', ');
    }
    return label;
  }

  function dueInfo(t) {
    const n = daysFromToday(t.dueDate);
    const d = parseDateStr(t.dueDate);
    const info = { label: formatShortDate(t.dueDate), cls: '', title: d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) };
    if (t.completed) return info;
    if (n < -1)       { info.label = (-n) + ' days overdue'; info.cls = 'overdue'; }
    else if (n === -1) { info.label = 'Yesterday'; info.cls = 'overdue'; }
    else if (n === 0)  { info.label = 'Today'; info.cls = 'today'; }
    else if (n === 1)  { info.label = 'Tomorrow'; info.cls = 'soon'; }
    else if (n < 7)    { info.label = d.toLocaleDateString(undefined, { weekday: 'long' }); info.cls = 'soon'; }
    return info;
  }

  // ---------- Schedule: derived data ----------

  function blocksForDate(dateStr) {
    const wd = weekdayOf(dateStr);
    return data.blocks
      .filter(b => (b.date ? b.date === dateStr : b.days.includes(wd)))
      .sort((a, b) => hmToMin(a.start) - hmToMin(b.start) || hmToMin(a.end) - hmToMin(b.end));
  }

  /** Minutes before its start/end that a block wants a reminder, or null when the block is muted. */
  function reminderLead(b) {
    if (!b.notify) return null;
    return b.remindMinutes == null ? data.settings.remindMinutes : b.remindMinutes;
  }

  /**
   * The moments of a day that trigger a reminder: a block starting, a block ending, or one block
   * switching straight into the next. Each event carries the lead time of the block it is about —
   * for a switch that is the incoming block — so every block can have its own setting. Muted blocks
   * produce no events; a switch into a muted block falls back to the outgoing block's end reminder.
   */
  function scheduleEvents(dateStr) {
    const blocks = blocksForDate(dateStr);
    const events = [];
    blocks.forEach((b, i) => {
      const prev = blocks[i - 1], next = blocks[i + 1];
      const lead = reminderLead(b);
      const joinsPrev = !!prev && prev.end === b.start;
      const joinsNext = !!next && next.start === b.end;
      if (lead != null && !joinsPrev) events.push({ kind: 'start', at: hmToMin(b.start), block: b, next: null, lead });
      if (joinsNext && reminderLead(next) != null) {
        events.push({ kind: 'switch', at: hmToMin(b.end), block: b, next, lead: reminderLead(next) });
      } else if (lead != null) {
        events.push({ kind: 'end', at: hmToMin(b.end), block: b, next: next || null, lead });
      }
    });
    return events;
  }

  function currentBlockInfo(now) {
    const blocks = blocksForDate(ui.today);
    return {
      blocks,
      current: blocks.find(b => hmToMin(b.start) <= now && now < hmToMin(b.end)) || null,
      next: blocks.find(b => hmToMin(b.start) > now) || null,
    };
  }

  function blocksShareDay(a, b) {
    if (a.date && b.date) return a.date === b.date;
    if (a.date) return b.days.includes(weekdayOf(a.date));
    if (b.date) return a.days.includes(weekdayOf(b.date));
    return a.days.some(d => b.days.includes(d));
  }
  function blocksConflict(a, b) {
    return blocksShareDay(a, b) && hmToMin(a.start) < hmToMin(b.end) && hmToMin(b.start) < hmToMin(a.end);
  }

  // ---------- Rendering ----------

  function render() {
    const today = todayStr();
    if (today !== ui.today) {
      if (ui.scheduleDate === ui.today) ui.scheduleDate = today;
      ui.today = today;
    }
    const counts = computeCounts();
    renderTopbar(counts);
    renderMode();
    renderViews(counts);
    renderCategories(counts);
    renderStats(counts);
    renderToolbar();
    renderList();
    renderSchedule();
    renderReminderSettings();
  }

  function renderMode() {
    const mode = data.settings.mode;
    document.body.dataset.mode = mode;
    el.tasksPanel.hidden = mode !== 'tasks';
    el.schedulePanel.hidden = mode !== 'schedule';
    el.modeSwitch.querySelectorAll('[data-mode]').forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    const label = mode === 'schedule' ? 'New block' : 'New task';
    el.newTaskBtn.querySelector('.btn-label').textContent = label;
    el.newTaskBtn.title = label + ' (N)';
  }

  function renderTopbar(counts) {
    const n = counts.overdue;
    el.overdueBadge.hidden = n === 0;
    el.overdueBadge.innerHTML = `${icon('alert', 15)} <strong>${n}</strong> <span class="badge-label">overdue</span>`;
    document.title = (n ? `(${n}) ` : '') + 'Tasks';

    const dark = resolvedTheme() === 'dark';
    el.themeToggle.innerHTML = icon(dark ? 'sun' : 'moon', 18);
    el.themeToggle.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    el.themeToggle.setAttribute('aria-label', el.themeToggle.title);
  }

  function renderViews(counts) {
    const current = data.settings.view;
    el.viewsNav.innerHTML = VIEW_KEYS.map(key => {
      const v = VIEWS[key];
      const n = viewCount(key, counts);
      const cls = ['view-btn', key === current ? 'active' : '', key === 'overdue' && n ? 'has-overdue' : ''].join(' ');
      return `<button type="button" class="${cls}" data-view="${key}" aria-current="${key === current ? 'page' : 'false'}">
        ${icon(v.icon, 17)}<span>${v.label}</span>${n ? `<span class="count">${n}</span>` : ''}
      </button>`;
    }).join('');
  }

  function renderCategories(counts) {
    const rows = data.categories.map(c => `
      <li class="category-item ${c.enabled ? '' : 'off'}" style="--cat:${c.color}">
        <label class="switch" title="${c.enabled ? 'Hide' : 'Show'} tasks in ${escapeHtml(c.name)}">
          <input type="checkbox" data-toggle-category="${c.id}" ${c.enabled ? 'checked' : ''} aria-label="Show ${escapeHtml(c.name)}">
          <span class="switch-track"></span>
        </label>
        <span class="cat-dot"></span>
        <button type="button" class="cat-name" data-edit-category="${c.id}" title="Edit ${escapeHtml(c.name)}">${escapeHtml(c.name)}</button>
        <span class="count" title="Active tasks">${counts.perCategory[c.id] || 0}</span>
      </li>`);

    if (data.categories.length || counts.uncategorized) {
      const on = data.settings.showUncategorized;
      rows.push(`
      <li class="category-item muted-item ${on ? '' : 'off'}">
        <label class="switch" title="${on ? 'Hide' : 'Show'} tasks without a category">
          <input type="checkbox" data-toggle-category="__none__" ${on ? 'checked' : ''} aria-label="Show tasks without a category">
          <span class="switch-track"></span>
        </label>
        <span class="cat-dot"></span>
        <span class="cat-name">No category</span>
        <span class="count" title="Active tasks">${counts.uncategorized}</span>
      </li>`);
    }

    el.categoryList.innerHTML = rows.join('')
      || '<li class="category-empty">No categories yet. Add one to group tasks and switch them on or off.</li>';
  }

  function renderStats(counts) {
    const tiles = [
      { view: 'all',       label: 'Active',    value: counts.active },
      { view: 'today',     label: 'Due today', value: counts.today,   cls: counts.today ? 'warn' : '' },
      { view: 'overdue',   label: 'Overdue',   value: counts.overdue, cls: counts.overdue ? 'alert' : '' },
      { view: 'completed', label: 'Completed', value: counts.completed },
    ];
    el.stats.innerHTML = tiles.map(t => `
      <button type="button" class="stat ${t.cls || ''} ${data.settings.view === t.view ? 'active' : ''}" data-view="${t.view}" title="Show ${VIEWS[t.view].label.toLowerCase()}">
        <span class="stat-value">${t.value}</span><span class="stat-label">${t.label}</span>
      </button>`).join('');
  }

  function renderToolbar() {
    const s = data.settings;
    el.sortSelect.value = s.sort;
    el.priorityFilter.value = s.priorityFilter;
    el.showCompleted.checked = s.showCompleted;
    el.showCompletedWrap.hidden = s.view === 'completed' || s.view === 'overdue';
    renderFocusBanner();
  }

  function renderList() {
    const tasks = visibleTasks();
    el.viewTitle.innerHTML = `${escapeHtml(VIEWS[data.settings.view].label)} <span class="muted">${tasks.length}</span>`;
    el.taskList.innerHTML = tasks.map(taskRowHtml).join('');
    renderEmptyState(tasks.length);
  }

  function taskRowHtml(t) {
    const cat = getCategory(t.categoryId);
    const due = t.dueDate ? dueInfo(t) : null;
    const p = PRIORITIES[t.priority];
    const rowCls = ['task', t.completed ? 'done' : '', due && due.cls === 'overdue' ? 'overdue' : '', due && due.cls === 'today' ? 'due-today' : ''].join(' ');
    const meta = [];
    if (cat) meta.push(`<span class="cat-chip" style="--cat:${cat.color}">${escapeHtml(cat.name)}</span>`);
    if (due) meta.push(`<span class="due ${due.cls}" title="Due ${escapeHtml(due.title)}">${icon('calendar', 13)}${escapeHtml(due.label)}</span>`);
    if (t.repeat) meta.push(`<span class="repeat-tag" title="Repeats ${escapeHtml(repeatLabel(t.repeat).toLowerCase())}${t.repeat.from === 'done' ? ', counted from the day you complete it' : ''}">${icon('repeat', 13)}${escapeHtml(repeatLabel(t.repeat))}</span>`);
    else if (t.seriesId) meta.push(`<span class="repeat-tag" title="A completed round of a repeating task">${icon('repeat', 13)}repeating</span>`);
    if (t.notes) meta.push(`<span class="notes-preview">${escapeHtml(t.notes)}</span>`);

    return `
      <li class="${rowCls}" data-id="${t.id}">
        <button type="button" class="check" data-action="toggle" role="checkbox" aria-checked="${t.completed}" aria-label="${t.completed ? 'Mark as not completed' : 'Mark as completed'}">${icon('check', 14)}</button>
        <button type="button" class="flag p-${t.priority}" data-action="priority" title="Priority: ${p.label} (click to change)" aria-label="Priority: ${p.label}. Click to change.">${icon('flag', 16)}</button>
        <div class="task-body" data-action="edit">
          <button type="button" class="task-title" data-action="edit">${escapeHtml(t.title)}</button>
          ${meta.length ? `<div class="task-meta">${meta.join('')}</div>` : ''}
        </div>
        <div class="task-actions">
          <button type="button" class="icon-btn sm" data-action="edit" title="Edit" aria-label="Edit task">${icon('edit', 15)}</button>
          <button type="button" class="icon-btn sm danger" data-action="delete" title="Delete" aria-label="Delete task">${icon('trash', 15)}</button>
        </div>
      </li>`;
  }

  function renderEmptyState(visibleCount) {
    if (visibleCount > 0) { el.emptyState.hidden = true; return; }
    const s = data.settings;
    let html;

    if (data.tasks.length === 0) {
      html = `<div class="empty-icon">🗒️</div><h3>No tasks yet</h3>
        <p>Add your first task above, or load a few sample tasks to see how everything looks.</p>
        <button type="button" class="btn btn-ghost" data-action="load-sample">Load sample tasks</button>`;
    } else if (ui.search.trim()) {
      html = `<h3>No matches</h3><p>Nothing in this view matches “${escapeHtml(ui.search.trim())}”.</p>
        <button type="button" class="btn btn-ghost" data-action="clear-search">Clear search</button>`;
    } else {
      const messages = {
        all:       ['All clear', 'No active tasks. Enjoy the quiet, or add something above.'],
        today:     ['Nothing due today', 'No tasks are due or overdue today.'],
        upcoming:  ['Nothing scheduled', 'No tasks have a due date in the future.'],
        overdue:   ['Nothing overdue 🎉', 'You are all caught up.'],
        completed: ['Nothing completed yet', 'Tasks you tick off will show up here.'],
      };
      const m = messages[s.view];
      html = `<h3>${m[0]}</h3><p>${m[1]}</p>`;

      const hiddenByFilters = data.tasks.filter(t => matchesView(t, s.view) && !(categoryVisible(t) && matchesPriority(t))).length;
      if (hiddenByFilters > 0) {
        html += `<p class="hint" style="margin-top:8px">${plural(hiddenByFilters, 'task')} in this view ${hiddenByFilters === 1 ? 'is' : 'are'} hidden by the category toggles or the priority filter.</p>
          <button type="button" class="btn btn-ghost" data-action="reset-filters">Show ${hiddenByFilters === 1 ? 'it' : 'them'}</button>`;
      } else if (s.view === 'all' && !s.showCompleted) {
        const done = data.tasks.filter(t => t.completed).length;
        if (done) html += `<p class="hint" style="margin-top:8px">${plural(done, 'completed task')} ${done === 1 ? 'is' : 'are'} hidden.</p>
          <button type="button" class="btn btn-ghost" data-action="show-completed">Show completed</button>`;
      }
    }
    el.emptyState.innerHTML = html;
    el.emptyState.hidden = false;
  }

  // ---------- Theme ----------

  function resolvedTheme() {
    const t = data.settings.theme;
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() { document.documentElement.setAttribute('data-theme', resolvedTheme()); }
  function toggleTheme() { updateSettings({ theme: resolvedTheme() === 'dark' ? 'light' : 'dark' }); }

  // ---------- Actions: settings & categories ----------

  function updateSettings(patch) {
    Object.assign(data.settings, patch);
    applyTheme();
    commit();
  }

  function setView(key) {
    if (!VIEW_KEYS.includes(key)) return;
    updateSettings({ view: key, mode: 'tasks' });
  }

  /** opts.focus: when moving Schedule → Tasks, narrow Tasks to the running block's category (see focusForCurrentBlock). */
  function setMode(mode, opts) {
    if (!MODES.includes(mode) || mode === data.settings.mode) return;
    if (mode === 'tasks' && opts && opts.focus) focusForCurrentBlock();
    updateSettings({ mode });
  }

  // Changing the category switches by hand always ends a block focus, so it never fights the user's choices.
  function setCategoryEnabled(id, enabled) {
    data.settings.focus = null;
    if (id === '__none__') { updateSettings({ showUncategorized: enabled }); return; }
    const c = getCategory(id);
    if (!c) return;
    c.enabled = enabled;
    commit();
  }

  function setAllCategories(enabled) {
    data.settings.focus = null;
    data.categories.forEach(c => { c.enabled = enabled; });
    updateSettings({ showUncategorized: enabled });
  }

  // ---------- Schedule → Tasks category focus ----------
  // Switching to Tasks while a block with a category is running shows only that category. The toggles
  // from before are kept in settings.focus.snapshot so "Show everything again" restores them exactly.

  function currentToggleSnapshot() {
    const enabled = {};
    data.categories.forEach(c => { enabled[c.id] = c.enabled; });
    return { enabled, showUncategorized: data.settings.showUncategorized };
  }

  function focusForCurrentBlock() {
    const b = currentBlockInfo(nowMinutes()).current;
    const cat = b && b.categoryId ? getCategory(b.categoryId) : null;
    const focus = data.settings.focus;
    if (!cat) { if (focus) restoreFocusSnapshot(); return; }
    if (focus && focus.categoryId === cat.id) { focus.blockId = b.id; return; }
    data.settings.focus = { categoryId: cat.id, blockId: b.id, snapshot: focus ? focus.snapshot : currentToggleSnapshot() };
    data.categories.forEach(c => { c.enabled = c.id === cat.id; });
    data.settings.showUncategorized = false;
  }

  function restoreFocusSnapshot() {
    const focus = data.settings.focus;
    if (!focus) return;
    const snap = focus.snapshot;
    data.categories.forEach(c => { c.enabled = Object.prototype.hasOwnProperty.call(snap.enabled, c.id) ? !!snap.enabled[c.id] : true; });
    data.settings.showUncategorized = snap.showUncategorized;
    data.settings.focus = null;
  }

  function exitFocus() {
    if (!data.settings.focus) return;
    restoreFocusSnapshot();
    commit();
  }

  function renderFocusBanner() {
    const focus = data.settings.focus;
    const cat = focus ? getCategory(focus.categoryId) : null;
    el.focusBanner.hidden = !cat;
    if (!cat) return;
    const b = focus.blockId ? getBlock(focus.blockId) : null;
    el.focusBanner.innerHTML = `<span class="cat-chip" style="--cat:${cat.color}">${escapeHtml(cat.name)}</span>`
      + `<span>Showing only this category${b ? ` while “${escapeHtml(b.title)}” is on` : ''}.</span>`
      + '<button type="button" class="link-btn" data-action="exit-focus">Show everything again</button>';
  }

  function addCategory(name, color) {
    const c = normalizeCategory({ name, color }, data.categories.length);
    if (!c) return null;
    data.categories.push(c);
    commit();
    return c;
  }

  function updateCategory(id, patch) {
    const c = getCategory(id);
    if (!c) return;
    const next = normalizeCategory(Object.assign({}, c, patch), 0);
    if (!next) return;
    Object.assign(c, { name: next.name, color: next.color });
    commit();
  }

  async function deleteCategory(id) {
    const c = getCategory(id);
    if (!c) return;
    const n = data.tasks.filter(t => t.categoryId === id).length;
    const ok = await confirmDialog({
      title: `Delete “${truncate(c.name)}”?`,
      message: n ? `${plural(n, 'task')} will be kept and moved to “No category”.` : 'This category has no tasks.',
      okLabel: 'Delete category',
      danger: true,
    });
    if (!ok) return;
    data.tasks.forEach(t => { if (t.categoryId === id) { t.categoryId = null; t.updatedAt = nowIso(); } });
    data.blocks.forEach(b => { if (b.categoryId === id) { b.categoryId = null; b.updatedAt = nowIso(); } });
    if (data.settings.focus && data.settings.focus.categoryId === id) data.settings.focus = null;
    data.categories = data.categories.filter(x => x.id !== id);
    commit();
    toast(`Deleted category “${truncate(c.name)}”`);
  }

  /** When exactly one category is switched on, new tasks default to it. */
  function defaultCategoryId() {
    const on = data.categories.filter(c => c.enabled);
    return on.length === 1 ? on[0].id : null;
  }

  /** Adding from the Today / Upcoming view gives the task a date that keeps it in that view. */
  function defaultDueDate() {
    if (data.settings.view === 'today') return ui.today;
    if (data.settings.view === 'upcoming') return addDays(ui.today, 1);
    return null;
  }

  // ---------- Actions: tasks ----------

  function addTask(fields) {
    const now = nowIso();
    const t = normalizeTask(Object.assign({}, fields, { id: null, createdAt: now, updatedAt: now, completed: false }), categoryIdSet());
    if (!t) return null;
    data.tasks.push(t);
    commit();
    return t;
  }

  function updateTask(id, patch) {
    const t = getTask(id);
    if (!t) return;
    const next = normalizeTask(Object.assign({}, t, patch, { updatedAt: nowIso() }), categoryIdSet());
    if (!next) return;
    Object.assign(t, next);
    commit();
  }

  function toggleComplete(id) {
    const t = getTask(id);
    if (!t) return;
    if (!t.completed && t.repeat) { completeRecurring(t); return; }
    t.completed = !t.completed;
    t.completedAt = t.completed ? nowIso() : null;
    t.updatedAt = nowIso();
    commit();
    if (t.completed && !isVisibleNow(id)) {
      toast(`Completed “${truncate(t.title)}”`, { action: 'Undo', onAction: () => toggleComplete(id) });
    }
  }

  /** Ticking off a repeating task files a completed copy for the record and moves the task itself to its next date. */
  function completeRecurring(t) {
    const prevDue = t.dueDate;
    const next = nextDueAfterCompletion(t);
    const now = nowIso();
    const record = normalizeTask(Object.assign({}, t, { id: null, repeat: null, seriesId: t.id, completed: true, completedAt: now, updatedAt: now }), categoryIdSet());
    if (!record) return;
    data.tasks.push(record);
    t.dueDate = next;
    t.updatedAt = now;
    commit();
    toast(`Done — “${truncate(t.title)}” comes back ${formatDueWord(next)}`, {
      action: 'Undo',
      onAction: () => {
        const idx = data.tasks.findIndex(x => x.id === record.id);
        if (idx >= 0) data.tasks.splice(idx, 1);
        const live = getTask(t.id);
        if (live) { live.dueDate = prevDue; live.updatedAt = nowIso(); }
        commit();
      },
    });
  }

  function formatDueWord(dateStr) {
    const n = daysFromToday(dateStr);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    return 'on ' + parseDateStr(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function cyclePriority(id) {
    const t = getTask(id);
    if (!t) return;
    t.priority = PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(t.priority) + 1) % PRIORITY_ORDER.length];
    t.updatedAt = nowIso();
    commit();
  }

  function deleteTask(id) {
    const idx = data.tasks.findIndex(t => t.id === id);
    if (idx < 0) return;
    const removed = data.tasks.splice(idx, 1)[0];
    commit();
    toast(`Deleted “${truncate(removed.title)}”`, {
      action: 'Undo',
      onAction: () => {
        if (getTask(removed.id)) return;
        data.tasks.splice(Math.min(idx, data.tasks.length), 0, removed);
        commit();
      },
    });
  }

  /** After adding, tell the user if the task is filtered out of the current view, with a one-click fix. */
  function notifyIfHidden(t) {
    if (isVisibleNow(t.id)) return;
    toast(`Added “${truncate(t.title)}” — hidden by the current view or filters`, {
      action: 'Show',
      onAction: () => {
        ui.search = '';
        el.searchInput.value = '';
        const c = getCategory(t.categoryId);
        if (c) c.enabled = true;
        updateSettings({ view: 'all', priorityFilter: 'all', showUncategorized: c ? data.settings.showUncategorized : true, focus: null });
      },
    });
  }

  // ---------- Quick add ----------

  function quickAdd() {
    const text = el.quickAddInput.value.trim();
    if (!text) return;
    const parsed = parseQuickAdd(text);
    if (!parsed.title) { toast('Add a title for the task as well.', { type: 'error' }); return; }
    const t = addTask({
      title: parsed.title,
      notes: '',
      categoryId: parsed.categoryId || defaultCategoryId(),
      priority: parsed.priority || 'normal',
      dueDate: parsed.dueDate || (parsed.repeat ? firstOccurrenceFromToday(parsed.repeat) : defaultDueDate()),
      repeat: parsed.repeat,
    });
    el.quickAddInput.value = '';
    if (t) notifyIfHidden(t);
  }

  /** "Pay rent #Home !high @tomorrow" → { title: 'Pay rent', categoryId, priority: 'high', dueDate } */
  function parseQuickAdd(text) {
    const out = { title: '', categoryId: null, priority: null, dueDate: null, repeat: null };
    const rep = parseRepeatPhrase(text);
    if (rep) { out.repeat = rep.repeat; text = rep.rest; }
    const words = [];
    for (const token of text.split(/\s+/)) {
      if (token.length > 1) {
        const body = token.slice(1);
        if (token[0] === '#') { const c = findCategoryByToken(body); if (c) { out.categoryId = c.id; continue; } }
        if (token[0] === '!') { const p = parsePriorityToken(body.toLowerCase()); if (p) { out.priority = p; continue; } }
        if (token[0] === '@') { const d = parseDateToken(body.toLowerCase()); if (d) { out.dueDate = d; continue; } }
      }
      words.push(token);
    }
    out.title = words.join(' ').trim();
    return out;
  }

  /** "every day", "every 2 weeks", "every mon, thu", "every weekday", "daily" … → { repeat, rest } or null. */
  function parseRepeatPhrase(text) {
    const dayPat = '(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*';
    const m = text.match(new RegExp(
      '(?:^|\\s)(?:' +
        'every\\s+(?:(\\d{1,2})\\s+)?(day|week|month|year)s?' +                               // every [N] unit(s)
        '|every\\s+(weekday|weekend)s?' +
        '|every\\s+(' + dayPat + '(?:\\s*(?:,|and|&)\\s*' + dayPat + ')*)' +                // every mon, wed and fri
        '|(daily|weekly|monthly|yearly|annually)' +
      ')(?=\\s|$)', 'i'));
    if (!m) return null;
    let repeat;
    if (m[2]) repeat = { every: m[1] ? +m[1] : 1, unit: m[2].toLowerCase(), days: [] };
    else if (m[3]) repeat = { every: 1, unit: 'week', days: m[3].toLowerCase() === 'weekday' ? [1, 2, 3, 4, 5] : [0, 6] };
    else if (m[4]) {
      const days = m[4].toLowerCase().split(/\s*(?:,|and|&)\s*/).map(w => WEEKDAYS.findIndex(x => x === w || x.slice(0, 3) === w)).filter(d => d >= 0);
      repeat = { every: 1, unit: 'week', days };
    } else {
      const w = m[5].toLowerCase();
      repeat = { every: 1, unit: w === 'daily' ? 'day' : w === 'weekly' ? 'week' : w === 'monthly' ? 'month' : 'year', days: [] };
    }
    const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
    return { repeat: normalizeRepeat(repeat), rest };
  }

  /** Due date for a new repeating task without one: today, or the next of its weekdays. */
  function firstOccurrenceFromToday(r) {
    if (r.unit === 'week' && r.days.length && !r.days.includes(weekdayOf(ui.today))) return nextOccurrence(r, ui.today, ui.today);
    return ui.today;
  }

  function findCategoryByToken(tok) {
    const norm = s => s.toLowerCase().replace(/[\s_-]+/g, '');
    const n = norm(tok);
    return data.categories.find(c => norm(c.name) === n) || null;
  }

  function parsePriorityToken(tok) {
    const map = {
      low: 'low', l: 'low', '4': 'low',
      normal: 'normal', n: 'normal', med: 'normal', medium: 'normal', '3': 'normal',
      high: 'high', h: 'high', '2': 'high',
      urgent: 'urgent', u: 'urgent', '1': 'urgent', '!': 'urgent',
    };
    return Object.prototype.hasOwnProperty.call(map, tok) ? map[tok] : null;
  }

  function parseDateToken(tok) {
    if (tok === 'today' || tok === 'tod') return ui.today;
    if (tok === 'tomorrow' || tok === 'tom' || tok === 'tmr') return addDays(ui.today, 1);
    if (/^\+\d{1,3}$/.test(tok)) return addDays(ui.today, +tok.slice(1));
    if (isDateStr(tok)) return tok;
    const idx = WEEKDAYS.findIndex(w => w === tok || w.slice(0, 3) === tok);
    if (idx >= 0) {
      const diff = (idx - parseDateStr(ui.today).getDay() + 7) % 7; // 0 = today
      return addDays(ui.today, diff);
    }
    return null;
  }

  // ---------- Dialogs: task ----------

  function openTaskDialog(taskId, defaults) {
    const t = taskId ? getTask(taskId) : null;
    const d = defaults || {};
    ui.editingTaskId = t ? t.id : null;
    el.taskDialogTitle.textContent = t ? 'Edit task' : 'New task';
    el.taskSaveBtn.textContent = t ? 'Save changes' : 'Add task';
    el.taskDeleteBtn.hidden = !t;
    el.taskScheduleBtn.hidden = !t;
    fillCategorySelect(el.taskCategory, t ? t.categoryId : (d.categoryId || defaultCategoryId()));
    el.taskTitle.value = t ? t.title : (d.title || '');
    el.taskNotes.value = t ? t.notes : '';
    el.taskDue.value = t ? (t.dueDate || '') : (d.dueDate || defaultDueDate() || '');
    setRadio(el.taskForm, 'priority', t ? t.priority : (d.priority || 'normal'));
    fillRepeatFields(t ? t.repeat : (d.repeat || null));
    el.taskDialog.showModal();
    el.taskTitle.focus();
  }

  function fillRepeatFields(r) {
    el.taskRepeatUnit.value = r ? r.unit : '';
    el.taskRepeatEvery.value = r ? r.every : 1;
    el.taskRepeatFrom.value = r ? r.from : 'due';
    const due = isDateStr(el.taskDue.value) ? el.taskDue.value : ui.today;
    renderDayChips(el.taskRepeatDays, r && r.unit === 'week' && r.days.length ? r.days : [weekdayOf(due)]);
    updateRepeatFields();
  }

  /** Read the Repeat fieldset; null when the task does not repeat. */
  function readRepeatFields() {
    const unit = el.taskRepeatUnit.value;
    if (!unit) return null;
    return normalizeRepeat({
      every: +el.taskRepeatEvery.value || 1,
      unit,
      days: Array.from(el.taskRepeatDays.querySelectorAll('input:checked')).map(i => +i.value),
      from: el.taskRepeatFrom.value,
    });
  }

  function updateRepeatFields() {
    const r = readRepeatFields();
    el.taskRepeatEveryWrap.hidden = !r;
    el.taskRepeatDays.hidden = !r || r.unit !== 'week';
    el.taskRepeatOptions.hidden = !r;
    // Closed: "Daily / Weekly …"; once chosen the row reads "Every [N] day(s)".
    const every = +el.taskRepeatEvery.value || 1;
    const names = !r ? { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }
      : every === 1 ? { day: 'day', week: 'week', month: 'month', year: 'year' }
      : { day: 'days', week: 'weeks', month: 'months', year: 'years' };
    Array.from(el.taskRepeatUnit.options).forEach(o => { if (o.value) o.textContent = names[o.value]; });
    if (!r) { el.taskRepeatHint.textContent = ''; return; }
    const due = isDateStr(el.taskDue.value) ? el.taskDue.value : ui.today;
    const rr = r.unit === 'week' && !r.days.length ? Object.assign({}, r, { days: [weekdayOf(due)] }) : r;
    const next = nextOccurrence(rr, due, due);
    el.taskRepeatHint.textContent = `${repeatLabel(rr)}. Ticking it off moves it to ${r.from === 'done' ? 'the next date after that day' : 'the next date'} — from ${formatShortDate(due)} that would be ${formatShortDate(next)}.`
      + (isDateStr(el.taskDue.value) ? '' : ' Starts today, since there is no due date yet.');
  }

  function fillCategorySelect(select, selectedId) {
    select.innerHTML = ['<option value="">No category</option>']
      .concat(data.categories.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`))
      .join('');
  }

  /** Check the swatch matching a colour, falling back to the custom one. */
  function selectSwatch(container, color) {
    const preset = container.querySelector(`input[type="radio"][value="${color}"]`);
    if (preset) { preset.checked = true; return; }
    const custom = container.querySelector('.swatch.custom');
    if (!custom) return;
    custom.querySelector('input[type="radio"]').checked = true;
    custom.querySelector('input[type="color"]').value = color;
    custom.style.setProperty('--cat', color);
  }

  function setRadio(form, name, value) {
    const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }
  function getRadio(form, name) {
    const input = form.querySelector(`input[name="${name}"]:checked`);
    return input ? input.value : null;
  }

  function onTaskFormSubmit(e) {
    e.preventDefault();
    const title = el.taskTitle.value.trim();
    if (!title) { el.taskTitle.value = ''; el.taskTitle.reportValidity(); return; }
    const repeat = readRepeatFields();
    const fields = {
      title,
      notes: el.taskNotes.value.trim(),
      categoryId: el.taskCategory.value || null,
      dueDate: isDateStr(el.taskDue.value) ? el.taskDue.value : (repeat ? firstOccurrenceFromToday(repeat) : null),
      priority: getRadio(el.taskForm, 'priority') || 'normal',
      repeat,
    };
    const editingId = ui.editingTaskId;
    el.taskDialog.close();
    if (editingId) {
      updateTask(editingId, fields);
    } else {
      const t = addTask(fields);
      if (t) notifyIfHidden(t);
    }
  }

  // ---------- Dialogs: category ----------

  function openCategoryDialog(catId) {
    const c = catId ? getCategory(catId) : null;
    ui.editingCategoryId = c ? c.id : null;
    el.categoryDialogTitle.textContent = c ? 'Edit category' : 'New category';
    el.categorySaveBtn.textContent = c ? 'Save changes' : 'Add category';
    el.categoryDeleteBtn.hidden = !c;
    el.categoryName.value = c ? c.name : '';
    renderSwatches(el.categoryColors, c ? c.color : CATEGORY_COLORS[data.categories.length % CATEGORY_COLORS.length]);
    el.categoryDialog.showModal();
    el.categoryName.focus();
  }

  function renderSwatches(container, selected) {
    const isPreset = CATEGORY_COLORS.includes(selected);
    container.innerHTML = CATEGORY_COLORS.map(c => `
      <label class="swatch" style="--cat:${c}" title="${c}">
        <input type="radio" name="color" value="${c}" ${c === selected ? 'checked' : ''}><span></span>
      </label>`).join('') + `
      <label class="swatch custom" title="Custom color" ${isPreset ? '' : `style="--cat:${selected}"`}>
        <input type="radio" name="color" value="custom" ${isPreset ? '' : 'checked'}><span></span>
        <input type="color" value="${isPreset ? '#888888' : selected}" aria-label="Pick a custom color">
      </label>`;
  }

  function onCategoryFormSubmit(e) {
    e.preventDefault();
    const name = el.categoryName.value.trim();
    if (!name) { el.categoryName.value = ''; el.categoryName.reportValidity(); return; }
    const choice = getRadio(el.categoryForm, 'color');
    const custom = el.categoryColors.querySelector('input[type="color"]');
    const color = choice === 'custom' && custom ? custom.value : choice;
    const dupe = data.categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== ui.editingCategoryId);
    if (dupe) { toast(`A category called “${dupe.name}” already exists.`, { type: 'error' }); el.categoryName.focus(); return; }
    const editingId = ui.editingCategoryId;
    el.categoryDialog.close();
    if (editingId) updateCategory(editingId, { name, color });
    else addCategory(name, color);
  }

  // ---------- Dialogs: confirm & help ----------

  function confirmDialog(opts) {
    return new Promise(resolve => {
      el.confirmTitle.textContent = opts.title;
      el.confirmMessage.textContent = opts.message || '';
      el.confirmOk.textContent = opts.okLabel || 'OK';
      el.confirmOk.classList.toggle('btn-danger', !!opts.danger);
      el.confirmOk.classList.toggle('btn-primary', !opts.danger);
      const onClose = () => {
        el.confirmDialog.removeEventListener('close', onClose);
        resolve(el.confirmDialog.returnValue === 'ok');
      };
      el.confirmDialog.addEventListener('close', onClose);
      el.confirmDialog.returnValue = '';
      el.confirmDialog.showModal();
      el.confirmOk.focus();
    });
  }

  // ---------- Import / export ----------

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson() {
    const payload = {
      app: 'TaskManager-V2',
      version: SCHEMA_VERSION,
      exportedAt: nowIso(),
      categories: data.categories,
      tasks: data.tasks,
      blocks: data.blocks,
    };
    downloadFile(`tasks-${ui.today}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast(`Exported ${plural(data.tasks.length, 'task')} as JSON`);
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const header = ['id', 'title', 'notes', 'category', 'priority', 'due_date', 'repeat', 'completed', 'completed_at', 'created_at', 'updated_at'];
    const rows = data.tasks.map(t => {
      const c = getCategory(t.categoryId);
      return [t.id, t.title, t.notes, c ? c.name : '', t.priority, t.dueDate || '', t.repeat ? repeatLabel(t.repeat) : '', t.completed ? 'yes' : 'no', t.completedAt || '', t.createdAt, t.updatedAt];
    });
    const csv = [header].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
    downloadFile(`tasks-${ui.today}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
    toast(`Exported ${plural(data.tasks.length, 'task')} as CSV`);
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let raw;
      try { raw = JSON.parse(String(reader.result)); }
      catch (e) { toast(`“${truncate(file.name)}” is not valid JSON.`, { type: 'error' }); return; }
      const incoming = normalizeData(raw);
      if (!incoming.tasks.length && !incoming.categories.length && !incoming.blocks.length) {
        toast('No tasks, categories or time blocks were found in that file.', { type: 'error' });
        return;
      }
      ui.pendingImport = incoming;
      el.importSummary.textContent = `“${file.name}” contains ${plural(incoming.tasks.length, 'task')}, ${plural(incoming.categories.length, 'category', 'categories')} and ${plural(incoming.blocks.length, 'time block')}.`;
      setRadio(el.importForm, 'importMode', 'merge');
      el.importDialog.showModal();
    };
    reader.onerror = () => toast('Could not read that file.', { type: 'error' });
    reader.readAsText(file);
  }

  function applyImport(mode) {
    const inc = ui.pendingImport;
    if (!inc) return;
    const snapshot = JSON.parse(JSON.stringify(data));
    let summary;
    if (mode === 'replace') {
      data = { version: SCHEMA_VERSION, categories: inc.categories, tasks: inc.tasks, blocks: inc.blocks, settings: Object.assign({}, data.settings, { focus: null }) };
      summary = `Replaced everything with ${plural(inc.tasks.length, 'task')}, ${plural(inc.categories.length, 'category', 'categories')} and ${plural(inc.blocks.length, 'time block')}`;
    } else {
      const r = mergeInto(data, inc);
      summary = `Imported ${plural(r.added, 'new task')}, updated ${r.updated}, left ${r.unchanged} unchanged`
        + (r.blocks.added || r.blocks.updated ? `; ${r.blocks.added + r.blocks.updated} time block(s) added or updated` : '');
    }
    ui.pendingImport = null;
    el.importDialog.close();
    commit();
    toast(summary, { action: 'Undo', onAction: () => { data = snapshot; commit(); } });
  }

  /** Merge an imported data set into the current one. Categories match by ID, then by name; tasks match by ID and the newer copy wins. */
  function mergeInto(target, inc) {
    const idMap = new Map();
    for (const c of inc.categories) {
      const existing = target.categories.find(x => x.id === c.id)
        || target.categories.find(x => x.name.toLowerCase() === c.name.toLowerCase());
      if (existing) { idMap.set(c.id, existing.id); }
      else { target.categories.push(c); idMap.set(c.id, c.id); }
    }
    const r = { added: 0, updated: 0, unchanged: 0 };
    for (const t of inc.tasks) {
      t.categoryId = t.categoryId ? (idMap.get(t.categoryId) || null) : null;
      const idx = target.tasks.findIndex(x => x.id === t.id);
      if (idx < 0) { target.tasks.push(t); r.added++; }
      else if (t.updatedAt > target.tasks[idx].updatedAt) { target.tasks[idx] = t; r.updated++; }
      else r.unchanged++;
    }
    r.blocks = { added: 0, updated: 0 };
    for (const b of inc.blocks) {
      b.categoryId = b.categoryId ? (idMap.get(b.categoryId) || null) : null;
      const idx = target.blocks.findIndex(x => x.id === b.id);
      if (idx < 0) { target.blocks.push(b); r.blocks.added++; }
      else if (b.updatedAt > target.blocks[idx].updatedAt) { target.blocks[idx] = b; r.blocks.updated++; }
    }
    const ids = new Set(target.tasks.map(t => t.id));
    target.blocks.forEach(b => { if (b.taskId && !ids.has(b.taskId)) b.taskId = null; });
    return r;
  }

  async function clearAllData() {
    const ok = await confirmDialog({
      title: 'Clear all data?',
      message: `This removes ${plural(data.tasks.length, 'task')}, ${plural(data.categories.length, 'category', 'categories')} and ${plural(data.blocks.length, 'time block')} from this browser. You can undo for a few seconds afterwards.`,
      okLabel: 'Clear everything',
      danger: true,
    });
    if (!ok) return;
    const snapshot = data;
    data = normalizeData({ settings: Object.assign({}, data.settings, { focus: null }) });
    commit();
    toast('All data cleared', { action: 'Undo', onAction: () => { data = snapshot; commit(); } });
  }

  // ---------- Sample data ----------

  function loadSampleData() {
    const wanted = [['Work', '#3b82f6'], ['Personal', '#22c55e'], ['Home', '#f97316'], ['Health', '#ec4899'], ['Study', '#8b5cf6']];
    const cat = {};
    for (const [name, color] of wanted) {
      let c = data.categories.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!c) { c = normalizeCategory({ name, color }, data.categories.length); data.categories.push(c); }
      cat[name] = c.id;
    }
    const d = n => addDays(ui.today, n);
    const samples = [
      { title: 'Send the quarterly report to finance', categoryId: cat.Work, priority: 'urgent', dueDate: d(-3), notes: 'Numbers are in the shared drive under /reports/Q3.' },
      { title: 'Renew car insurance', categoryId: cat.Personal, priority: 'high', dueDate: d(-1) },
      { title: 'Prepare slides for Monday stand-up', categoryId: cat.Work, priority: 'high', dueDate: d(0) },
      { title: 'Call the dentist to book a check-up', categoryId: cat.Health, priority: 'normal', dueDate: d(0) },
      { title: 'Review open pull requests', categoryId: cat.Work, priority: 'normal', dueDate: d(1) },
      { title: 'Fix the leaking kitchen tap', categoryId: cat.Home, priority: 'normal', dueDate: d(2), notes: 'Need a 15 mm washer — check the toolbox first.' },
      { title: 'Plan weekend hike', categoryId: cat.Health, priority: 'low', dueDate: d(5) },
      { title: 'Buy a birthday present for Sam', categoryId: null, priority: 'high', dueDate: d(9) },
      { title: 'Read “Deep Work”, chapter 3', categoryId: cat.Personal, priority: 'low', dueDate: null },
      { title: 'Water the plants', categoryId: cat.Home, priority: 'low', dueDate: d(1), repeat: { every: 3, unit: 'day', from: 'done' } },
      { title: 'Weekly review', categoryId: cat.Work, priority: 'normal', dueDate: d((5 - weekdayOf(ui.today) + 7) % 7), repeat: { every: 1, unit: 'week', days: [5] } },
      { title: 'Pay rent', categoryId: cat.Home, priority: 'high', dueDate: addMonthsClamped(ui.today.slice(0, 8) + '01', 1), repeat: { every: 1, unit: 'month' } },
      { title: 'Finish maths exercises 4–6', categoryId: cat.Study, priority: 'high', dueDate: d(0) },
    ];
    const ids = categoryIdSet();
    const base = Date.now();
    const created = [];
    samples.forEach((s, i) => {
      const t = normalizeTask(Object.assign({}, s, { createdAt: new Date(base - i * 60000).toISOString() }), ids);
      if (t) { data.tasks.push(t); created.push(t); }
    });

    if (data.blocks.length === 0) {
      const maths = created.find(t => t.title.indexOf('maths') >= 0) || null;
      const sampleBlocks = [
        { title: 'Deep work', start: '09:00', end: '11:30', days: [1, 2, 3, 4, 5], color: '#3b82f6', categoryId: cat.Work, taskId: created[0] ? created[0].id : null },
        { title: 'Lunch & a walk', start: '12:30', end: '13:30', days: [1, 2, 3, 4, 5], color: '#22c55e', categoryId: cat.Health },
        { title: 'Homework', start: '15:00', end: '20:00', days: [1, 2, 3, 4], color: '#8b5cf6', categoryId: cat.Study, taskId: maths ? maths.id : null, notes: 'Phone in the other room.', remindMinutes: 15 },
        { title: 'Gym', start: '18:00', end: '19:00', days: [5], color: '#ec4899', categoryId: cat.Health, remindMinutes: 30 },
      ];
      sampleBlocks.forEach((s, i) => {
        const b = normalizeBlock(s, i, taskIdSet(), categoryIdSet());
        if (b && !data.blocks.some(x => blocksConflict(b, x))) data.blocks.push(b);
      });
    }
    commit();
    toast(`Loaded ${plural(samples.length, 'sample task')} and a sample schedule`);
  }

  // ==========================================================================
  // Schedule: time blocks, the day view and reminders
  // ==========================================================================

  // ---------- Blocks: actions ----------

  function addBlock(fields) {
    const now = nowIso();
    const b = normalizeBlock(Object.assign({}, fields, { id: null, createdAt: now, updatedAt: now }), data.blocks.length, taskIdSet(), categoryIdSet());
    if (!b) return null;
    data.blocks.push(b);
    commit();
    return b;
  }

  function updateBlock(id, patch) {
    const b = getBlock(id);
    if (!b) return;
    const next = normalizeBlock(Object.assign({}, b, patch, { updatedAt: nowIso() }), 0, taskIdSet(), categoryIdSet());
    if (!next) return;
    Object.assign(b, next);
    commit();
  }

  function deleteBlock(id) {
    const idx = data.blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const removed = data.blocks.splice(idx, 1)[0];
    commit();
    toast(`Deleted block “${truncate(removed.title)}”`, {
      action: 'Undo',
      onAction: () => {
        if (getBlock(removed.id)) return;
        data.blocks.splice(Math.min(idx, data.blocks.length), 0, removed);
        commit();
      },
    });
  }

  /** Move the day view to a day the block actually appears on, so a just-saved block is visible. */
  function revealBlock(b) {
    if (b.date) { ui.scheduleDate = b.date; return; }
    if (b.days.includes(weekdayOf(ui.scheduleDate))) return;
    for (let i = 1; i < 7; i++) {
      const d = addDays(ui.scheduleDate, i);
      if (b.days.includes(weekdayOf(d))) { ui.scheduleDate = d; return; }
    }
  }

  // ---------- Blocks: editor dialog ----------

  function suggestedStart() {
    const blocks = blocksForDate(ui.scheduleDate);
    if (blocks.length) {
      const last = hmToMin(blocks[blocks.length - 1].end);
      if (last <= 22 * 60) return minToHm(last);
    }
    if (ui.scheduleDate === ui.today) return minToHm(Math.min(Math.ceil(nowMinutes() / 60) * 60, 22 * 60));
    return '09:00';
  }

  function openBlockDialog(blockId, defaults) {
    const b = blockId ? getBlock(blockId) : null;
    const d = defaults || {};
    ui.editingBlockId = b ? b.id : null;
    el.blockDialogTitle.textContent = b ? 'Edit time block' : 'New time block';
    el.blockSaveBtn.textContent = b ? 'Save changes' : 'Add block';
    el.blockDeleteBtn.hidden = !b;
    el.blockTitle.value = b ? b.title : (d.title || '');
    const start = b ? b.start : (d.start || suggestedStart());
    el.blockStart.value = start;
    el.blockEnd.value = b ? b.end : (d.end || minToHm(Math.min(hmToMin(start) + 60, 23 * 60 + 59)));
    el.blockRepeat.checked = b ? !b.date : !d.date;
    renderDayChips(el.blockDaysWrap, b ? b.days : (d.days || [weekdayOf(ui.scheduleDate)]));
    el.blockDate.value = b && b.date ? b.date : (d.date || ui.scheduleDate);
    updateRepeatUI();
    fillCategorySelect(el.blockCategory, b ? b.categoryId : (d.categoryId || null));
    fillTaskSelect(b ? b.taskId : (d.taskId || null), el.blockCategory.value || null);
    renderSwatches(el.blockColors, b ? b.color : (d.color || CATEGORY_COLORS[(data.blocks.length + 2) % CATEGORY_COLORS.length]));
    el.blockNotes.value = b ? b.notes : '';
    fillRemindSelect(b);
    el.blockDialog.showModal();
    el.blockTitle.focus();
  }

  function renderDayChips(container, selectedDays) {
    const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
    container.innerHTML = order.map(d => `
      <label class="day-chip"><input type="checkbox" name="days" value="${d}" ${selectedDays.includes(d) ? 'checked' : ''}><span>${WEEKDAY_SHORT[d]}</span></label>`).join('');
  }

  function updateRepeatUI() {
    const repeats = el.blockRepeat.checked;
    el.blockDaysWrap.hidden = !repeats;
    el.blockDateWrap.hidden = repeats;
  }

  /** Options: follow the default, off, or one of the preset leads (plus the block's own value if it is not a preset). */
  function fillRemindSelect(b) {
    const value = !b ? '' : (!b.notify ? 'off' : (b.remindMinutes == null ? '' : String(b.remindMinutes)));
    const opts = [['', `Default (${fmtLead(data.settings.remindMinutes)})`], ['off', 'Off — no reminders for this block']]
      .concat(REMIND_OPTIONS.map(m => [String(m), fmtLead(m)]));
    if (value !== '' && value !== 'off' && !REMIND_OPTIONS.includes(+value)) opts.push([value, fmtLead(+value)]);
    el.blockRemind.innerHTML = opts.map(o => `<option value="${o[0]}" ${o[0] === value ? 'selected' : ''}>${escapeHtml(o[1])}</option>`).join('');
  }

  /** Open tasks to link to a block — only those in `categoryId` when the block has a category. The linked task is always kept. */
  function fillTaskSelect(selectedId, categoryId) {
    const cat = categoryId ? getCategory(categoryId) : null;
    const tasks = data.tasks
      .filter(t => t.id === selectedId || (!t.completed && (!cat || t.categoryId === cat.id)))
      .sort(compareTasks);
    const options = tasks.map(t => {
      const c = cat ? null : getCategory(t.categoryId);
      const label = (t.completed ? '✓ ' : '') + truncate(t.title, 60) + (c ? ` (${c.name})` : '');
      return `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    });
    if (cat && !tasks.length) options.push(`<option value="" disabled>No open tasks in ${escapeHtml(cat.name)}</option>`);
    el.blockTask.innerHTML = ['<option value="">No task</option>'].concat(options).join('');
  }

  function onBlockFormSubmit(e) {
    e.preventDefault();
    const title = el.blockTitle.value.trim();
    if (!title) { el.blockTitle.value = ''; el.blockTitle.reportValidity(); return; }
    if (!isHm(el.blockStart.value)) { el.blockStart.reportValidity(); return; }
    if (!isHm(el.blockEnd.value)) { el.blockEnd.reportValidity(); return; }
    if (hmToMin(el.blockEnd.value) <= hmToMin(el.blockStart.value)) {
      toast('The end time must be after the start time.', { type: 'error' });
      el.blockEnd.focus();
      return;
    }
    const repeats = el.blockRepeat.checked;
    const days = repeats ? Array.from(el.blockDaysWrap.querySelectorAll('input:checked')).map(i => +i.value) : ALL_DAYS;
    if (repeats && !days.length) { toast('Pick at least one weekday, or switch off “Repeats every week”.', { type: 'error' }); return; }
    const date = repeats ? null : el.blockDate.value;
    if (!repeats && !isDateStr(date)) { el.blockDate.reportValidity(); return; }

    const choice = getRadio(el.blockForm, 'color');
    const custom = el.blockColors.querySelector('input[type="color"]');
    const remind = el.blockRemind.value;
    const fields = {
      title,
      start: el.blockStart.value,
      end: el.blockEnd.value,
      days,
      date,
      taskId: el.blockTask.value || null,
      categoryId: el.blockCategory.value || null,
      color: choice === 'custom' && custom ? custom.value : choice,
      notes: el.blockNotes.value.trim(),
      notify: remind !== 'off',
      remindMinutes: remind === '' || remind === 'off' ? null : +remind,
    };
    const candidate = normalizeBlock(fields, data.blocks.length, taskIdSet(), categoryIdSet());
    const clash = candidate && data.blocks.find(x => x.id !== ui.editingBlockId && blocksConflict(candidate, x));
    if (clash) {
      const when = clash.date ? formatShortDate(clash.date) : fmtDays(clash.days);
      toast(`Overlaps with “${truncate(clash.title)}” (${fmtRange(clash)}, ${when}).`, { type: 'error', duration: 6000 });
      return;
    }

    const editingId = ui.editingBlockId;
    el.blockDialog.close();
    let saved;
    if (editingId) { updateBlock(editingId, fields); saved = getBlock(editingId); }
    else saved = addBlock(fields);
    if (saved) { revealBlock(saved); renderSchedule(); }
  }

  // ---------- Schedule: rendering ----------

  function renderSchedule() {
    const sel = ui.scheduleDate;
    const isToday = sel === ui.today;
    const now = nowMinutes();
    const blocks = blocksForDate(sel);
    const lead = data.settings.remindMinutes;
    const leadText = lead ? fmtLead(lead).replace(' before', ' before each switch') : 'at each switch';
    const selLabel = parseDateStr(sel).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const list = blocks.length
      ? `<ul class="block-list">${blocks.map(b => blockRowHtml(b, isToday ? now : null)).join('')}</ul>`
      : `<div class="empty">
           <h3>Nothing planned for ${isToday ? 'today' : WEEKDAY_LONG[weekdayOf(sel)]}</h3>
           <p>Add a time block to plan this day — for example “Homework” from 15:00 to 20:00.</p>
           <button type="button" class="btn btn-ghost" data-block-action="add">Add a block</button>
         </div>`;

    el.schedulePanel.innerHTML = `
      <div class="schedule-head">
        <div>
          <h2 class="view-title">Schedule</h2>
          <p class="hint">Plan your day in time blocks. Reminders fire ${leadText} while this page is open; each block can set its own lead.</p>
        </div>
        <button type="button" class="btn btn-primary" data-block-action="add">${icon('plus', 16)}<span>Add block</span></button>
      </div>
      ${nowCardHtml(now)}
      <div class="week-nav">
        <button type="button" class="icon-btn" data-week="-1" aria-label="Previous week">${icon('chevron-left', 18)}</button>
        <div class="day-tabs" role="tablist">${dayTabsHtml(sel)}</div>
        <button type="button" class="icon-btn" data-week="1" aria-label="Next week">${icon('chevron-right', 18)}</button>
        <button type="button" class="btn btn-ghost" data-week="today" ${isToday ? 'hidden' : ''}>Today</button>
      </div>
      <h3 class="day-title">${escapeHtml(selLabel)}${isToday ? ' <span class="muted">· today</span>' : ''}</h3>
      ${timelineHtml(blocks, isToday ? now : null)}
      ${list}
      <p class="hint schedule-foot">Blocks repeat weekly on the days you choose, or happen once on a date. Linking a task to a block does not complete it — tick it off in Tasks when it is really done.</p>`;
  }

  function dayTabsHtml(sel) {
    const monday = startOfWeek(sel);
    return ALL_DAYS.map(i => {
      const d = addDays(monday, i);
      const date = parseDateStr(d);
      const dots = blocksForDate(d).slice(0, 4).map(b => `<span class="day-dot" style="--cat:${b.color}"></span>`).join('');
      const cls = ['day-tab', d === sel ? 'active' : '', d === ui.today ? 'today' : ''].join(' ');
      return `<button type="button" class="${cls}" role="tab" aria-selected="${d === sel}" data-date="${d}" title="${escapeHtml(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}">
        <span class="day-name">${WEEKDAY_SHORT[weekdayOf(d)]}</span><span class="day-num">${date.getDate()}</span><span class="day-dots">${dots}</span>
      </button>`;
    }).join('');
  }

  function timelineHtml(blocks, now) {
    const segs = blocks.map(b => {
      const s = hmToMin(b.start), e = hmToMin(b.end);
      const past = now != null && e <= now;
      return `<button type="button" class="seg ${past ? 'past' : ''}" style="left:${(s / 1440 * 100).toFixed(3)}%;width:${((e - s) / 1440 * 100).toFixed(3)}%;--cat:${b.color}" data-block-action="edit" data-id="${b.id}" title="${escapeHtml(b.title)} · ${escapeHtml(fmtRange(b))}"><span>${escapeHtml(b.title)}</span></button>`;
    }).join('');
    const marker = now != null ? `<span class="now-marker" style="left:${(now / 1440 * 100).toFixed(3)}%" title="Now"></span>` : '';
    const ticks = [0, 3, 6, 9, 12, 15, 18, 21].map(h => `<span class="tick" style="left:${(h / 24 * 100).toFixed(3)}%">${escapeHtml(fmtHour(h))}</span>`).join('');
    return `<div class="timeline"><div class="timeline-bar">${segs}${marker}</div><div class="timeline-ticks">${ticks}</div></div>`;
  }

  function blockCategoryChip(b) {
    const c = b.categoryId ? getCategory(b.categoryId) : null;
    return c ? `<span class="cat-chip" style="--cat:${c.color}">${escapeHtml(c.name)}</span>` : '';
  }

  /** The task a block is linked to, as a clickable chip that opens the task. */
  function linkedTaskHtml(b) {
    const t = b.taskId ? getTask(b.taskId) : null;
    if (!t) return '';
    const title = t.completed ? 'Done — open task' : `${PRIORITIES[t.priority].label} priority — open task`;
    return `<button type="button" class="task-link ${t.completed ? 'done' : ''}" style="--p:var(--p-${t.priority})" data-task-open="${t.id}" title="${escapeHtml(title)}">
      <span class="task-link-icon">${icon(t.completed ? 'check-circle' : 'flag', 13)}</span><span class="task-link-text">${escapeHtml(truncate(t.title, 60))}</span></button>`;
  }

  function reminderTagHtml(b) {
    if (!b.notify) return `<span title="No reminders for this block">${icon('bell-off', 13)}muted</span>`;
    if (b.remindMinutes == null) return '';
    return `<span title="This block’s own reminder (the default is ${escapeHtml(fmtLead(data.settings.remindMinutes))})">${icon('bell', 13)}${escapeHtml(fmtLead(b.remindMinutes))}</span>`;
  }

  function blockRowHtml(b, now) {
    const s = hmToMin(b.start), e = hmToMin(b.end);
    const state = now == null ? '' : (e <= now ? 'past' : (s <= now ? 'current' : ''));
    const meta = [
      blockCategoryChip(b),
      `<span>${fmtDuration(e - s)}</span>`,
      `<span>${icon(b.date ? 'calendar' : 'repeat', 13)}${escapeHtml(b.date ? formatShortDate(b.date) + ' only' : fmtDays(b.days))}</span>`,
      linkedTaskHtml(b),
      reminderTagHtml(b),
      b.notes ? `<span class="notes-preview">${escapeHtml(b.notes)}</span>` : '',
    ].filter(Boolean).join('');
    return `
      <li class="block ${state}" data-id="${b.id}" style="--cat:${b.color}">
        <div class="block-time"><strong>${escapeHtml(fmtTime(s))}</strong><span>${escapeHtml(fmtTime(e))}</span></div>
        <div class="block-body" data-block-action="edit">
          <button type="button" class="block-title" data-block-action="edit">${escapeHtml(b.title)}</button>
          ${state === 'current' ? `<span class="now-pill">Now · ends in ${fmtDuration(e - now)}</span>` : ''}
          <div class="block-meta">${meta}</div>
        </div>
        <div class="task-actions">
          <button type="button" class="icon-btn sm" data-block-action="edit" title="Edit" aria-label="Edit block">${icon('edit', 15)}</button>
          <button type="button" class="icon-btn sm danger" data-block-action="delete" title="Delete" aria-label="Delete block">${icon('trash', 15)}</button>
        </div>
      </li>`;
  }

  function nowCardHtml(now) {
    const info = currentBlockInfo(now);
    const b = info.current;
    if (b) {
      const s = hmToMin(b.start), e = hmToMin(b.end);
      const t = b.taskId ? getTask(b.taskId) : null;
      const progress = Math.min(100, Math.max(0, (now - s) / (e - s) * 100));
      const next = info.next;
      return `
        <section class="now-card" style="--cat:${b.color}" aria-label="Current block">
          <span class="now-label">Now</span>
          <div class="now-main">
            <h3>${escapeHtml(b.title)}</h3>
            <div class="now-time">${blockCategoryChip(b)} ${escapeHtml(fmtRange(b))} · ends in ${fmtDuration(e - now)}</div>
            ${t ? `<div class="now-task"><span class="now-task-label">Work on</span>${linkedTaskHtml(b)}${t.completed ? '' : `<button type="button" class="chip-btn" data-task-done="${t.id}">Mark done</button>`}</div>` : ''}
            <div class="progress" role="progressbar" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress.toFixed(1)}%"></span></div>
          </div>
          <div class="now-next">${next
            ? `Up next: <strong>${escapeHtml(next.title)}</strong><br>${escapeHtml(fmtTime(hmToMin(next.start)))} · in ${fmtDuration(hmToMin(next.start) - now)}`
            : 'Nothing scheduled after this'}</div>
        </section>`;
    }
    if (info.next) {
      const n = info.next;
      return `
        <section class="now-card idle" style="--cat:${n.color}" aria-label="Next block">
          <span class="now-label">Up next</span>
          <div class="now-main">
            <h3>${escapeHtml(n.title)}</h3>
            <div class="now-time">${blockCategoryChip(n)} ${escapeHtml(fmtRange(n))} · starts in ${fmtDuration(hmToMin(n.start) - now)}</div>
            ${n.taskId && getTask(n.taskId) ? `<div class="now-task"><span class="now-task-label">Work on</span>${linkedTaskHtml(n)}</div>` : ''}
          </div>
          <div class="now-next">Free until then</div>
        </section>`;
    }
    return `
      <section class="now-card idle" aria-label="Current block">
        <span class="now-label">Now</span>
        <div class="now-main">
          <h3>Nothing scheduled right now</h3>
          <div class="now-time">${info.blocks.length ? 'All of today’s blocks are done.' : 'Add a block to plan your day.'}</div>
        </div>
        <div class="now-next"></div>
      </section>`;
  }

  function onSchedulePanelClick(e) {
    const openTask = e.target.closest('[data-task-open]');
    if (openTask) { openTaskDialog(openTask.dataset.taskOpen); return; }
    const doneTask = e.target.closest('[data-task-done]');
    if (doneTask) { toggleComplete(doneTask.dataset.taskDone); return; }

    const actionEl = e.target.closest('[data-block-action]');
    if (actionEl) {
      const holder = actionEl.closest('[data-id]');
      const id = holder ? holder.dataset.id : null;
      switch (actionEl.dataset.blockAction) {
        case 'add':    openBlockDialog(); break;
        case 'edit':   if (id) openBlockDialog(id); break;
        case 'delete': if (id) deleteBlock(id); break;
      }
      return;
    }
    const dayBtn = e.target.closest('[data-date]');
    if (dayBtn) { ui.scheduleDate = dayBtn.dataset.date; renderSchedule(); return; }
    const weekBtn = e.target.closest('[data-week]');
    if (weekBtn) {
      const w = weekBtn.dataset.week;
      ui.scheduleDate = w === 'today' ? ui.today : addDays(ui.scheduleDate, 7 * (+w));
      renderSchedule();
    }
  }

  // ---------- Reminders ----------
  // The page polls every 20 s. When a block start/end (minus the lead time) is reached, it shows a system
  // notification (if allowed), an in-page toast and an optional sound — once per moment per day.

  function loadFired() {
    try {
      const raw = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
      const prefix = todayStr() + '|';
      const out = {};
      if (raw && typeof raw === 'object') Object.keys(raw).forEach(k => { if (k.indexOf(prefix) === 0) out[k] = raw[k]; });
      return out;
    } catch (e) { return {}; }
  }
  function saveFired() {
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(ui.fired)); } catch (e) { /* best effort */ }
  }

  function notificationState() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  function requestNotificationPermission(onDone) {
    if (notificationState() === 'unsupported') { toast('This browser cannot show system notifications.', { type: 'error' }); return; }
    let handled = false;
    const done = () => {
      if (handled) return;
      handled = true;
      renderReminderSettings();
      const state = notificationState();
      if (state === 'granted') toast('System notifications are on.');
      else if (state === 'denied') toast('Notifications are blocked for this site — in-page alerts will still work.', { type: 'error', duration: 6000 });
      if (typeof onDone === 'function') onDone();
    };
    try {
      const p = Notification.requestPermission(done); // old Safari only supports the callback form
      if (p && typeof p.then === 'function') p.then(done);
    } catch (e) { done(); }
  }

  function showNotification(title, body, tag) {
    if (notificationState() !== 'granted') return;
    try {
      const n = new Notification(title, { body, tag });
      n.onclick = () => { try { window.focus(); } catch (e) { /* ignore */ } n.close(); stopAlarm(); };
    } catch (e) { /* e.g. Chrome on Android needs a service worker; the in-page toast still shows */ }
  }

  // ---------- Alarm sound ----------
  // A one-second pattern (two short beeps, then silence) looped by Web Audio until stopAlarm() is called.
  // Looping inside the audio engine keeps ringing even when the tab is in the background and timers are
  // throttled. The context is created on the first click/keypress so browsers allow it to make sound.

  const ALARM_MAX_MS = 10 * 60 * 1000; // safety cap: stop ringing after 10 minutes
  let audioCtx = null;
  let alarmBuffer = null;
  let alarm = null; // { source, timer, toast }

  function ensureAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }

  function buildAlarmBuffer(ctx) {
    const rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, rate, rate); // exactly one second
    const ch = buf.getChannelData(0);
    [[0, 0.15], [0.22, 0.37]].forEach(([from, to]) => {
      const a = Math.floor(from * rate), b = Math.floor(to * rate), len = to - from;
      for (let i = a; i < b; i++) {
        const t = (i - a) / rate;
        const env = Math.max(0, Math.min(1, t / 0.01, (len - t) / 0.03)); // short attack/release, no clicks
        ch[i] = Math.sin(2 * Math.PI * 880 * t) * 0.25 * env;
      }
    });
    return buf;
  }

  function alarmRinging() { return !!alarm; }

  function startAlarm() {
    if (alarm) return true;
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== 'running') return false;
    try {
      if (!alarmBuffer) alarmBuffer = buildAlarmBuffer(ctx);
      const source = ctx.createBufferSource();
      source.buffer = alarmBuffer;
      source.loop = true;
      source.connect(ctx.destination);
      source.start();
      alarm = { source, timer: setTimeout(stopAlarm, ALARM_MAX_MS), toast: null };
      document.body.classList.add('alarm-ringing');
      return true;
    } catch (e) { return false; }
  }

  function stopAlarm() {
    if (!alarm) return;
    const a = alarm;
    alarm = null; // clear first: the toast's onClose calls back into stopAlarm
    clearTimeout(a.timer);
    try { a.source.stop(); a.source.disconnect(); } catch (e) { /* already stopped */ }
    document.body.classList.remove('alarm-ringing');
    if (a.toast) a.toast.remove();
  }

  /** Show a reminder in the page: a ringing, sticky toast when sound is on, otherwise a plain one. */
  function announce(title, body) {
    const text = body ? `${title} — ${body}` : title;
    if (data.settings.reminderSound && startAlarm()) {
      if (alarm.toast) alarm.toast.remove(); // one ringing toast at a time; keep the latest text
      alarm.toast = toast(text, { sticky: true, cls: 'toast-alarm', action: 'Stop', onAction: stopAlarm, onClose: stopAlarm });
    } else {
      toast(text, { duration: 15000, action: 'Schedule', onAction: () => setMode('schedule') });
    }
  }

  function reminderText(ev, lead) {
    const b = ev.block;
    const t = b.taskId ? getTask(b.taskId) : null;
    const when = lead ? `in ${lead} min` : 'now';
    if (ev.kind === 'switch') {
      const nt = ev.next.taskId ? getTask(ev.next.taskId) : null;
      return {
        title: `${lead ? `In ${lead} min` : 'Now'}: ${b.title} → ${ev.next.title}`,
        body: `${ev.next.title} runs ${fmtRange(ev.next)}` + (nt ? ` · work on: ${nt.title}` : ''),
      };
    }
    if (ev.kind === 'start') {
      return { title: `Starting ${when}: ${b.title}`, body: fmtRange(b) + (t ? ` · work on: ${t.title}` : '') };
    }
    return {
      title: `Ending ${when}: ${b.title}`,
      body: ev.next ? `Up next: ${ev.next.title} at ${fmtTime(hmToMin(ev.next.start))}` : 'Nothing else scheduled today.',
    };
  }

  function deliverReminder(ev, lead, key) {
    const msg = reminderText(ev, lead);
    showNotification(msg.title, msg.body, key);
    announce(msg.title, msg.body);
  }

  function checkReminders() {
    if (todayStr() !== ui.today) render();
    const now = nowMinutes();
    for (const ev of scheduleEvents(ui.today)) {
      const fireAt = ev.at - ev.lead;
      if (now < fireAt || now >= fireAt + REMIND_TOLERANCE_MIN) continue;
      const key = `${ui.today}|${ev.block.id}|${ev.kind}|${ev.at}`;
      if (ui.fired[key]) continue;
      ui.fired[key] = Date.now();
      saveFired();
      deliverReminder(ev, ev.lead, key);
    }
  }

  function sendTestReminder() {
    const fire = () => {
      const system = notificationState() === 'granted';
      showNotification('Reminders are working', 'This is what a schedule reminder looks like.', 'test-' + Date.now());
      announce('Test reminder', system ? 'This is what a reminder looks like.' : 'In-page only — system notifications are off.');
    };
    if (notificationState() === 'default') requestNotificationPermission(fire);
    else fire();
  }

  function renderReminderSettings() {
    const state = notificationState();
    const texts = {
      unsupported: ['warn', 'This browser cannot show system notifications. You still get in-page alerts (and a sound) while the page is open.'],
      default:     ['', 'System notifications are off. Enable them to be alerted even when this tab is in the background.'],
      granted:     ['ok', 'System notifications are on.'],
      denied:      ['warn', 'Notifications are blocked for this site. Allow them in the browser’s site settings for system alerts; in-page alerts still work.'],
    };
    const t = texts[state] || texts.default;
    el.remindStatus.className = 'remind-status ' + t[0];
    el.remindStatus.innerHTML = `${icon(state === 'granted' ? 'bell' : 'bell-off', 14)}<span>${t[1]}</span>`;
    el.remindEnableBtn.hidden = state !== 'default';
    el.remindLead.value = String(data.settings.remindMinutes);
    el.remindSound.checked = data.settings.reminderSound;
  }

  // ---------- Toasts ----------

  /**
   * Options: type ('error'), action + onAction (button), duration (ms), sticky (no auto-dismiss),
   * cls (extra class), onClose (called once when the toast goes away for any reason).
   */
  function toast(message, opts) {
    const o = opts || {};
    const node = document.createElement('div');
    node.className = 'toast' + (o.type === 'error' ? ' toast-error' : '') + (o.cls ? ' ' + o.cls : '') + (o.sticky ? ' toast-sticky' : '');
    node.setAttribute('role', o.sticky ? 'alert' : 'status');
    node.innerHTML = `<span class="toast-msg"></span>${o.action ? `<button type="button" class="toast-action">${escapeHtml(o.action)}</button>` : ''}<button type="button" class="toast-close" aria-label="Dismiss">${icon('x', 14)}</button>`;
    node.querySelector('.toast-msg').textContent = message;

    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      clearTimeout(timer);
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 180);
      if (o.onClose) o.onClose();
    };
    const timer = o.sticky ? null : setTimeout(remove, o.duration || (o.action ? UNDO_MS : 3500));
    if (o.action) node.querySelector('.toast-action').addEventListener('click', () => { remove(); if (o.onAction) o.onAction(); });
    node.querySelector('.toast-close').addEventListener('click', remove);

    el.toasts.appendChild(node);
    // Keep the stack short, but never drop a sticky toast (e.g. a ringing alarm).
    const disposable = Array.from(el.toasts.children).filter(n => !n.classList.contains('toast-sticky'));
    while (el.toasts.children.length > 3 && disposable.length) disposable.shift().remove();
    return { node, remove };
  }

  // ---------- Sidebar (mobile) ----------

  function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', open);
    el.backdrop.hidden = !open;
    el.sidebarToggle.setAttribute('aria-expanded', String(open));
  }

  // ---------- Events ----------

  function onTaskListClick(e) {
    const actionEl = e.target.closest('[data-action]');
    const row = e.target.closest('li.task');
    if (!actionEl || !row) return;
    const id = row.dataset.id;
    switch (actionEl.dataset.action) {
      case 'toggle':   toggleComplete(id); refocus(id, 'toggle'); break;
      case 'priority': cyclePriority(id); refocus(id, 'priority'); break;
      case 'edit':     openTaskDialog(id); break;
      case 'delete':   deleteTask(id); break;
    }
  }

  /** The list is re-rendered after every change; put keyboard focus back where it was. */
  function refocus(id, action) {
    const node = el.taskList.querySelector(`li[data-id="${CSS.escape(id)}"] [data-action="${action}"]`);
    if (node) node.focus();
  }

  function onEmptyStateClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    switch (b.dataset.action) {
      case 'load-sample':    loadSampleData(); break;
      case 'clear-search':   ui.search = ''; el.searchInput.value = ''; renderList(); break;
      case 'reset-filters':  data.categories.forEach(c => { c.enabled = true; }); updateSettings({ showUncategorized: true, priorityFilter: 'all', focus: null }); break;
      case 'show-completed': updateSettings({ showCompleted: true }); break;
    }
  }

  function onKeydown(e) {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && alarmRinging()) { stopAlarm(); return; }

    if (document.querySelector('dialog[open]')) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (el.taskDialog.open) { e.preventDefault(); submitForm(el.taskForm); }
        else if (el.categoryDialog.open) { e.preventDefault(); submitForm(el.categoryForm); }
        else if (el.blockDialog.open) { e.preventDefault(); submitForm(el.blockForm); }
      }
      return; // Escape closes dialogs natively
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const target = e.target;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

    if (e.key === 'Escape') {
      if (target === el.searchInput && el.searchInput.value) { el.searchInput.value = ''; ui.search = ''; renderList(); return; }
      if (typing) { target.blur(); return; }
      setSidebar(false);
      return;
    }
    if (typing) return;

    switch (e.key) {
      case 'n': case 'N': e.preventDefault(); if (data.settings.mode === 'schedule') openBlockDialog(); else openTaskDialog(); break;
      case 'a': case 'A': e.preventDefault(); setMode('tasks'); el.quickAddInput.focus(); break;
      case '/':           e.preventDefault(); setMode('tasks'); el.searchInput.focus(); el.searchInput.select(); break;
      case 't': case 'T': e.preventDefault(); setMode('tasks', { focus: true }); break;
      case 's': case 'S': e.preventDefault(); setMode('schedule'); break;
      case '?':           e.preventDefault(); el.helpDialog.showModal(); break;
    }
  }

  function hasFiles(e) {
    return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0);
  }

  function bindEvents() {
    // Top bar
    el.brand.addEventListener('click', e => { e.preventDefault(); setView('all'); });
    el.newTaskBtn.addEventListener('click', () => (data.settings.mode === 'schedule' ? openBlockDialog() : openTaskDialog()));
    el.modeSwitch.addEventListener('click', e => {
      const b = e.target.closest('[data-mode]');
      if (b) setMode(b.dataset.mode, { focus: true });
    });
    el.focusBanner.addEventListener('click', e => { if (e.target.closest('[data-action="exit-focus"]')) exitFocus(); });
    el.themeToggle.addEventListener('click', toggleTheme);
    el.overdueBadge.addEventListener('click', () => setView('overdue'));
    el.searchInput.addEventListener('input', () => { ui.search = el.searchInput.value; renderList(); });
    el.sidebarToggle.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
    el.backdrop.addEventListener('click', () => setSidebar(false));

    // Sidebar
    el.viewsNav.addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (b) { setView(b.dataset.view); setSidebar(false); }
    });
    el.categoryList.addEventListener('change', e => {
      const input = e.target.closest('[data-toggle-category]');
      if (input) setCategoryEnabled(input.dataset.toggleCategory, input.checked);
    });
    el.categoryList.addEventListener('click', e => {
      const b = e.target.closest('[data-edit-category]');
      if (b) openCategoryDialog(b.dataset.editCategory);
    });
    el.catAllBtn.addEventListener('click', () => setAllCategories(true));
    el.catNoneBtn.addEventListener('click', () => setAllCategories(false));
    el.addCategoryBtn.addEventListener('click', () => openCategoryDialog());
    el.exportJsonBtn.addEventListener('click', exportJson);
    el.exportCsvBtn.addEventListener('click', exportCsv);
    el.importBtn.addEventListener('click', () => { el.importFile.value = ''; el.importFile.click(); });
    el.importFile.addEventListener('change', () => handleImportFile(el.importFile.files[0]));
    el.clearDataBtn.addEventListener('click', clearAllData);
    el.helpBtn.addEventListener('click', () => el.helpDialog.showModal());

    // Main area
    el.stats.addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (b) setView(b.dataset.view);
    });
    el.sortSelect.addEventListener('change', () => updateSettings({ sort: el.sortSelect.value }));
    el.priorityFilter.addEventListener('change', () => updateSettings({ priorityFilter: el.priorityFilter.value }));
    el.showCompleted.addEventListener('change', () => updateSettings({ showCompleted: el.showCompleted.checked }));
    el.quickAddForm.addEventListener('submit', e => { e.preventDefault(); quickAdd(); });
    el.taskList.addEventListener('click', onTaskListClick);
    el.emptyState.addEventListener('click', onEmptyStateClick);

    // Task dialog
    el.taskForm.addEventListener('submit', onTaskFormSubmit);
    el.taskForm.addEventListener('click', e => {
      const b = e.target.closest('[data-quick-date]');
      if (!b) return;
      const v = b.dataset.quickDate;
      el.taskDue.value = v === 'clear' ? '' : addDays(ui.today, +v);
      updateRepeatFields();
    });
    ['taskRepeatUnit', 'taskRepeatEvery', 'taskRepeatFrom', 'taskRepeatDays', 'taskDue'].forEach(id => {
      el[id].addEventListener('change', updateRepeatFields);
    });
    el.taskRepeatEvery.addEventListener('input', updateRepeatFields);
    el.taskDeleteBtn.addEventListener('click', () => {
      const id = ui.editingTaskId;
      el.taskDialog.close();
      if (id) deleteTask(id);
    });

    // Category dialog
    el.categoryForm.addEventListener('submit', onCategoryFormSubmit);
    [el.categoryColors, el.blockColors].forEach(container => container.addEventListener('input', e => {
      if (e.target.type !== 'color') return;
      const label = e.target.closest('.swatch');
      label.style.setProperty('--cat', e.target.value);
      label.querySelector('input[type="radio"]').checked = true;
    }));
    el.categoryDeleteBtn.addEventListener('click', () => {
      const id = ui.editingCategoryId;
      el.categoryDialog.close();
      if (id) deleteCategory(id);
    });

    // Schedule panel, block editor, reminders
    el.schedulePanel.addEventListener('click', onSchedulePanelClick);
    el.blockForm.addEventListener('submit', onBlockFormSubmit);
    el.blockRepeat.addEventListener('change', updateRepeatUI);
    el.blockStart.addEventListener('change', () => {
      // Keep the end after the start: default to a one-hour block.
      const start = isHm(el.blockStart.value) ? hmToMin(el.blockStart.value) : null;
      const end = isHm(el.blockEnd.value) ? hmToMin(el.blockEnd.value) : null;
      if (start != null && (end == null || end <= start)) el.blockEnd.value = minToHm(Math.min(start + 60, 23 * 60 + 59));
    });
    el.blockCategory.addEventListener('change', () => {
      // A category tints the block with its colour (the colour can still be changed afterwards)
      // and narrows the task list to that category; a linked task from another category is dropped.
      const c = getCategory(el.blockCategory.value);
      if (c) selectSwatch(el.blockColors, c.color);
      const t = getTask(el.blockTask.value);
      fillTaskSelect(t && (!c || t.categoryId === c.id) ? t.id : null, c ? c.id : null);
    });
    el.blockTask.addEventListener('change', () => {
      // Picking a task fills in its category when none is chosen yet
      const t = getTask(el.blockTask.value);
      if (!t || !t.categoryId || el.blockCategory.value) return;
      el.blockCategory.value = t.categoryId;
      const c = getCategory(t.categoryId);
      if (c) selectSwatch(el.blockColors, c.color);
      fillTaskSelect(t.id, t.categoryId);
    });
    el.blockDeleteBtn.addEventListener('click', () => {
      const id = ui.editingBlockId;
      el.blockDialog.close();
      if (id) deleteBlock(id);
    });
    el.taskScheduleBtn.addEventListener('click', () => {
      const t = getTask(ui.editingTaskId);
      el.taskDialog.close();
      if (!t) return;
      const c = getCategory(t.categoryId);
      setMode('schedule');
      openBlockDialog(null, { taskId: t.id, title: t.title, categoryId: t.categoryId, color: c ? c.color : null });
    });
    el.remindEnableBtn.addEventListener('click', () => requestNotificationPermission());
    el.remindLead.addEventListener('change', () => updateSettings({ remindMinutes: +el.remindLead.value }));
    el.remindSound.addEventListener('change', () => updateSettings({ reminderSound: el.remindSound.checked }));
    el.remindTestBtn.addEventListener('click', sendTestReminder);

    // Import / confirm dialogs
    el.importForm.addEventListener('submit', e => { e.preventDefault(); applyImport(getRadio(el.importForm, 'importMode') || 'merge'); });
    el.importDialog.addEventListener('close', () => { ui.pendingImport = null; });
    el.confirmForm.addEventListener('submit', e => { e.preventDefault(); el.confirmDialog.close('ok'); });

    // Shared dialog behaviour: Cancel buttons and clicking the backdrop close the dialog
    // (Only when the press also started on the backdrop, so drag-selecting text inside a form can't close it.)
    document.querySelectorAll('dialog').forEach(dialog => {
      let pressedOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { pressedOnBackdrop = e.target === dialog; });
      dialog.addEventListener('click', e => { if (e.target === dialog && pressedOnBackdrop) dialog.close('cancel'); });
      dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close('cancel')));
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', onKeydown);

    // Browsers only let a page make sound after the user has interacted with it: unlock audio on the first gesture
    ['pointerdown', 'keydown'].forEach(evt => document.addEventListener(evt, () => ensureAudio(), { once: true, capture: true }));

    // Drag a JSON export anywhere onto the page to import it
    let dragDepth = 0;
    document.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; document.body.classList.add('dragging-file'); } });
    document.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging-file'); } });
    document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('drop', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging-file');
      handleImportFile(e.dataTransfer.files[0]);
    });

    // Keep "today" (and therefore the overdue counter) correct across midnight
    setInterval(() => { if (todayStr() !== ui.today) render(); }, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (todayStr() !== ui.today) render();
      checkReminders();
    });

    // Schedule reminders, and keep the "Now" card live (unless the user is interacting with the panel)
    setInterval(checkReminders, 20 * 1000);
    setInterval(() => {
      if (data.settings.mode === 'schedule' && !el.schedulePanel.contains(document.activeElement)) renderSchedule();
    }, 30 * 1000);

    // Follow the OS theme while no explicit choice is saved
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemTheme = () => { if (data.settings.theme === 'system') { applyTheme(); render(); } };
    if (mq.addEventListener) mq.addEventListener('change', onSystemTheme); else mq.addListener(onSystemTheme);

    // Stay in sync when another tab of this app changes the data
    window.addEventListener('storage', e => {
      if (e.key === FIRED_KEY) { ui.fired = loadFired(); return; }
      if (e.key !== STORAGE_KEY) return;
      data = loadData();
      applyTheme();
      render();
    });
  }

  // ---------- Init ----------

  applyTheme();
  bindEvents();
  render();
  checkReminders();
})();
