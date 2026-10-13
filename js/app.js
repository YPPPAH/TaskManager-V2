/* ==========================================================================
   Tasks — application logic
   Plain browser JavaScript: no build step, no dependencies. All data is kept
   in localStorage under STORAGE_KEY (see README.md for the format).
   ========================================================================== */
(() => {
  'use strict';

  // ---------- Constants ----------

  const STORAGE_KEY = 'taskmanager-v2';
  const SCHEMA_VERSION = 1;
  const UNDO_MS = 6000;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

  const PRIORITIES = {
    low:    { label: 'Low',    rank: 0 },
    normal: { label: 'Normal', rank: 1 },
    high:   { label: 'High',   rank: 2 },
    urgent: { label: 'Urgent', rank: 3 },
  };
  const PRIORITY_ORDER = ['low', 'normal', 'high', 'urgent'];

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

  const DEFAULT_SETTINGS = {
    theme: 'system',          // 'system' | 'light' | 'dark'
    view: 'all',              // key of VIEWS
    sort: 'due',              // one of SORTS
    priorityFilter: 'all',    // 'all' | priority key
    showCompleted: false,     // include completed tasks in All / Today / Upcoming
    showUncategorized: true,  // toggle for tasks without a category
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
  };

  function icon(name, size) {
    const s = size || 16;
    return `<svg class="icon" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  }

  // ---------- DOM & state ----------

  const el = {};
  document.querySelectorAll('[id]').forEach(node => { el[node.id] = node; });

  let data = loadData(); // { version, categories, tasks, settings }

  const ui = {
    today: todayStr(),
    search: '',
    editingTaskId: null,
    editingCategoryId: null,
    pendingImport: null,
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
    const out = { version: SCHEMA_VERSION, categories: [], tasks: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
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
    return {
      id: normalizeId(t.id, 't'),
      title,
      notes: String(t.notes == null ? '' : t.notes).slice(0, 2000),
      categoryId: typeof t.categoryId === 'string' && catIds.has(t.categoryId) ? t.categoryId : null,
      priority: normalizePriority(t.priority),
      dueDate: isDateStr(t.dueDate) ? t.dueDate : null,
      completed,
      completedAt: completed ? isoOr(t.completedAt, created) : null,
      createdAt: created,
      updatedAt: isoOr(t.updatedAt, created),
    };
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

  // ---------- Rendering ----------

  function render() {
    ui.today = todayStr();
    const counts = computeCounts();
    renderTopbar(counts);
    renderViews(counts);
    renderCategories(counts);
    renderStats(counts);
    renderToolbar();
    renderList();
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
    updateSettings({ view: key });
  }

  function setCategoryEnabled(id, enabled) {
    if (id === '__none__') { updateSettings({ showUncategorized: enabled }); return; }
    const c = getCategory(id);
    if (!c) return;
    c.enabled = enabled;
    commit();
  }

  function setAllCategories(enabled) {
    data.categories.forEach(c => { c.enabled = enabled; });
    updateSettings({ showUncategorized: enabled });
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
    t.completed = !t.completed;
    t.completedAt = t.completed ? nowIso() : null;
    t.updatedAt = nowIso();
    commit();
    if (t.completed && !isVisibleNow(id)) {
      toast(`Completed “${truncate(t.title)}”`, { action: 'Undo', onAction: () => toggleComplete(id) });
    }
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
        updateSettings({ view: 'all', priorityFilter: 'all', showUncategorized: c ? data.settings.showUncategorized : true });
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
      dueDate: parsed.dueDate || defaultDueDate(),
    });
    el.quickAddInput.value = '';
    if (t) notifyIfHidden(t);
  }

  /** "Pay rent #Home !high @tomorrow" → { title: 'Pay rent', categoryId, priority: 'high', dueDate } */
  function parseQuickAdd(text) {
    const out = { title: '', categoryId: null, priority: null, dueDate: null };
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
    fillCategorySelect(t ? t.categoryId : (d.categoryId || defaultCategoryId()));
    el.taskTitle.value = t ? t.title : (d.title || '');
    el.taskNotes.value = t ? t.notes : '';
    el.taskDue.value = t ? (t.dueDate || '') : (d.dueDate || defaultDueDate() || '');
    setRadio(el.taskForm, 'priority', t ? t.priority : (d.priority || 'normal'));
    el.taskDialog.showModal();
    el.taskTitle.focus();
  }

  function fillCategorySelect(selectedId) {
    el.taskCategory.innerHTML = ['<option value="">No category</option>']
      .concat(data.categories.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`))
      .join('');
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
    const fields = {
      title,
      notes: el.taskNotes.value.trim(),
      categoryId: el.taskCategory.value || null,
      dueDate: isDateStr(el.taskDue.value) ? el.taskDue.value : null,
      priority: getRadio(el.taskForm, 'priority') || 'normal',
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
    renderSwatches(c ? c.color : CATEGORY_COLORS[data.categories.length % CATEGORY_COLORS.length]);
    el.categoryDialog.showModal();
    el.categoryName.focus();
  }

  function renderSwatches(selected) {
    const isPreset = CATEGORY_COLORS.includes(selected);
    el.categoryColors.innerHTML = CATEGORY_COLORS.map(c => `
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
    };
    downloadFile(`tasks-${ui.today}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast(`Exported ${plural(data.tasks.length, 'task')} as JSON`);
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const header = ['id', 'title', 'notes', 'category', 'priority', 'due_date', 'completed', 'completed_at', 'created_at', 'updated_at'];
    const rows = data.tasks.map(t => {
      const c = getCategory(t.categoryId);
      return [t.id, t.title, t.notes, c ? c.name : '', t.priority, t.dueDate || '', t.completed ? 'yes' : 'no', t.completedAt || '', t.createdAt, t.updatedAt];
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
      if (!incoming.tasks.length && !incoming.categories.length) {
        toast('No tasks or categories were found in that file.', { type: 'error' });
        return;
      }
      ui.pendingImport = incoming;
      el.importSummary.textContent = `“${file.name}” contains ${plural(incoming.tasks.length, 'task')} and ${plural(incoming.categories.length, 'category', 'categories')}.`;
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
      data = { version: SCHEMA_VERSION, categories: inc.categories, tasks: inc.tasks, settings: data.settings };
      summary = `Replaced everything with ${plural(inc.tasks.length, 'task')} and ${plural(inc.categories.length, 'category', 'categories')}`;
    } else {
      const r = mergeInto(data, inc);
      summary = `Imported ${plural(r.added, 'new task')}, updated ${r.updated}, left ${r.unchanged} unchanged`;
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
    return r;
  }

  async function clearAllData() {
    const ok = await confirmDialog({
      title: 'Clear all data?',
      message: `This removes ${plural(data.tasks.length, 'task')} and ${plural(data.categories.length, 'category', 'categories')} from this browser. You can undo for a few seconds afterwards.`,
      okLabel: 'Clear everything',
      danger: true,
    });
    if (!ok) return;
    const snapshot = data;
    data = normalizeData({ settings: data.settings });
    commit();
    toast('All data cleared', { action: 'Undo', onAction: () => { data = snapshot; commit(); } });
  }

  // ---------- Sample data ----------

  function loadSampleData() {
    const wanted = [['Work', '#3b82f6'], ['Personal', '#22c55e'], ['Home', '#f97316'], ['Health', '#ec4899']];
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
      { title: 'Water the plants', categoryId: cat.Home, priority: 'low', dueDate: d(-2), completed: true },
    ];
    const ids = categoryIdSet();
    const base = Date.now();
    samples.forEach((s, i) => {
      const t = normalizeTask(Object.assign({}, s, { createdAt: new Date(base - i * 60000).toISOString() }), ids);
      if (t) data.tasks.push(t);
    });
    commit();
    toast(`Loaded ${plural(samples.length, 'sample task')}`);
  }

  // ---------- Toasts ----------

  function toast(message, opts) {
    const o = opts || {};
    const node = document.createElement('div');
    node.className = 'toast' + (o.type === 'error' ? ' toast-error' : '');
    node.setAttribute('role', 'status');
    node.innerHTML = `<span class="toast-msg"></span>${o.action ? `<button type="button" class="toast-action">${escapeHtml(o.action)}</button>` : ''}<button type="button" class="toast-close" aria-label="Dismiss">${icon('x', 14)}</button>`;
    node.querySelector('.toast-msg').textContent = message;

    const remove = () => {
      clearTimeout(timer);
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 180);
    };
    const timer = setTimeout(remove, o.duration || (o.action ? UNDO_MS : 3500));
    if (o.action) node.querySelector('.toast-action').addEventListener('click', () => { remove(); if (o.onAction) o.onAction(); });
    node.querySelector('.toast-close').addEventListener('click', remove);

    el.toasts.appendChild(node);
    while (el.toasts.children.length > 3) el.toasts.firstElementChild.remove();
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
      case 'reset-filters':  data.categories.forEach(c => { c.enabled = true; }); updateSettings({ showUncategorized: true, priorityFilter: 'all' }); break;
      case 'show-completed': updateSettings({ showCompleted: true }); break;
    }
  }

  function onKeydown(e) {
    if (e.defaultPrevented) return;

    if (document.querySelector('dialog[open]')) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (el.taskDialog.open) { e.preventDefault(); submitForm(el.taskForm); }
        else if (el.categoryDialog.open) { e.preventDefault(); submitForm(el.categoryForm); }
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
      case 'n': case 'N': e.preventDefault(); openTaskDialog(); break;
      case 'a': case 'A': e.preventDefault(); el.quickAddInput.focus(); break;
      case '/':           e.preventDefault(); el.searchInput.focus(); el.searchInput.select(); break;
      case '?':           e.preventDefault(); el.helpDialog.showModal(); break;
    }
  }

  function hasFiles(e) {
    return !!(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0);
  }

  function bindEvents() {
    // Top bar
    el.brand.addEventListener('click', e => { e.preventDefault(); setView('all'); });
    el.newTaskBtn.addEventListener('click', () => openTaskDialog());
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
    });
    el.taskDeleteBtn.addEventListener('click', () => {
      const id = ui.editingTaskId;
      el.taskDialog.close();
      if (id) deleteTask(id);
    });

    // Category dialog
    el.categoryForm.addEventListener('submit', onCategoryFormSubmit);
    el.categoryColors.addEventListener('input', e => {
      if (e.target.type !== 'color') return;
      const label = e.target.closest('.swatch');
      label.style.setProperty('--cat', e.target.value);
      label.querySelector('input[type="radio"]').checked = true;
    });
    el.categoryDeleteBtn.addEventListener('click', () => {
      const id = ui.editingCategoryId;
      el.categoryDialog.close();
      if (id) deleteCategory(id);
    });

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
    document.addEventListener('visibilitychange', () => { if (!document.hidden && todayStr() !== ui.today) render(); });

    // Follow the OS theme while no explicit choice is saved
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemTheme = () => { if (data.settings.theme === 'system') { applyTheme(); render(); } };
    if (mq.addEventListener) mq.addEventListener('change', onSystemTheme); else mq.addListener(onSystemTheme);

    // Stay in sync when another tab of this app changes the data
    window.addEventListener('storage', e => {
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
})();
