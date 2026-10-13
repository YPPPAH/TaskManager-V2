# TaskManager-V2

A small, fast task manager and day planner that runs entirely in your browser. No accounts, no server, no build step — open `index.html` and start. Everything you enter is saved in the browser's `localStorage`, and you can export/import it as JSON at any time.

Two sections, switched from the header:

- **Tasks** — the to-do list: categories, priorities, due dates, overdue tracking.
- **Schedule** — time blocks for your day (e.g. *Homework 15:00–20:00*) with reminders before each switch.

## Running it

- **Just open it:** double-click `index.html` (works from the file system).
- **Or serve it** (useful on phones on the same network):
  ```sh
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

There are no dependencies and nothing to install.

## Tasks

**Tasks**
- Title, notes, category, priority and due date.
- Quick-add bar with inline syntax: `Pay rent #Home !high @tomorrow`.
- Click the flag on a task to cycle its priority; click the title to edit.
- Complete / un-complete, delete with **Undo**.
- Search across titles, notes and category names.
- Sort by due date, priority, newest or title. Completed tasks always sink to the bottom.

**Categories**
- Create as many as you like, each with a colour.
- A **toggle switch per category** shows or hides its tasks (plus a toggle for tasks with no category). *All* / *None* buttons flip every switch at once.
- When exactly one category is switched on, new tasks default to it.
- Deleting a category keeps its tasks and moves them to "No category".

**Importance**
- Four levels: Low, Normal, High, Urgent — shown as a coloured flag on every task.
- Filter the list by priority; sort by priority.

**Overdue tracking**
- An **overdue counter** in the header (red badge) and in the stats row, plus a dedicated *Overdue* view. The browser tab title shows the count too, e.g. `(3) Tasks`.
- Overdue tasks are marked with a red stripe and "N days overdue"; tasks due today get an amber stripe.
- The counter rolls over correctly at midnight, even if the tab stays open.

**Views**
- *All tasks*, *Today* (due today + overdue), *Upcoming*, *Overdue*, *Completed*.
- Stats tiles (Active · Due today · Overdue · Completed) double as shortcuts to the matching view.
- Optional "Show completed" toggle for the All / Today / Upcoming views.

## Schedule

**Time blocks**
- Each block has a title, start and end time, a colour and optional notes.
- A block either **repeats every week** on the weekdays you pick (e.g. Homework, Mon–Thu 15:00–20:00) or happens **once on a date**.
- Blocks on the same day can't overlap — you get a clear message naming the clash.
- Optionally **link a task** to a block ("work on …"). Linking never completes the task: it's only completed when you tick it off in Tasks. The *Now* card offers a "Mark done" shortcut and a link to open the task. From a task's editor, "Schedule time" creates a block for it.

**Day view**
- **Now card**: the current block with a progress bar and "ends in …", what's up next, and the linked task.
- A week strip to pick a day (dots show that day's blocks), with ‹ › to move between weeks and a *Today* button.
- A 24-hour timeline bar with the blocks drawn to scale and a red "now" marker; click a segment to edit.
- The list of blocks for that day — the current one is highlighted, past ones dimmed.

**Reminders**
- Fire *X minutes before* each switch: before a block starts, before it ends, or "A → B" when one block runs straight into the next. Choose 0 (at the switch), 5, 10, 15, 30 or 60 minutes in the sidebar.
- Delivered as a **system notification** (after you allow them with *Enable notifications*), an **in-page toast**, and an optional **sound**. "Send a test reminder" checks everything is working.
- With sound on, the alarm **rings until you stop it** — click *Stop* on the toast, click the notification, or press `Esc`. As a safety net it stops by itself after 10 minutes (`ALARM_MAX_MS` in `js/app.js`). Browsers only allow sound after you've interacted with the page once, so open the app and click anything before relying on it.
- Each block has a "Remind me" switch so you can mute individual blocks.
- **Reminders only fire while the page is open in a tab.** There's no server behind this app, so nothing can wake it when it's closed. Keep the tab open (it can be in the background) and the app polls every 20 seconds.
- A reminder is delivered once per day per moment, even if you reload the page, and it is skipped (not fired late) if the moment is more than two minutes past — for example after the laptop wakes from sleep.

## Data (lives in the browser)

- The **Data & backup** section sits collapsed at the bottom of the sidebar — click it to open.
- Saved automatically to `localStorage`; changes sync across open tabs.
- **Export JSON** (full backup, re-importable, includes tasks, categories and time blocks) and **Export CSV** (tasks, for spreadsheets).
- **Import JSON** via the sidebar button or by dragging a file anywhere onto the page.
  - *Merge*: adds new tasks/categories/blocks; an item that already exists (same ID) is updated when the imported copy is newer. Categories are matched by ID, then by name.
  - *Replace*: wipes the browser's data and loads the file instead.
  - Imports and "Clear all data" can be undone for a few seconds.
- "Load sample tasks" on the empty first screen fills in a few tasks and a sample schedule.

## Nice to have

- Light / dark theme (follows the OS until you pick one).
- Responsive layout — the sidebar becomes a drawer on small screens.
- Keyboard shortcuts (press `?` in the app).

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `T` / `S` | Switch to Tasks / Schedule |
| `N` | New task (or new block, in Schedule) |
| `A` | Jump to the quick-add box |
| `/` | Search |
| `Esc` | Stop a ringing alarm / clear search / close dialogs |
| `Ctrl`/`⌘` + `Enter` | Save the task, category or block you are editing |
| `?` | Show shortcuts & tips |

## Quick-add syntax

| Token | Effect |
| --- | --- |
| `#Work` | Put the task in an existing category (case-insensitive, spaces ignored: `#sideprojects` matches "Side Projects") |
| `!low` `!normal` `!high` `!urgent` | Priority (`!1`–`!4` also work, 1 = urgent, `!!` = urgent) |
| `@today` `@tomorrow` | Due date |
| `@mon` … `@sun` / `@monday` … | Next occurrence of that weekday |
| `@+3` | Due in 3 days |
| `@2026-12-31` | Exact date |

Tokens that don't match anything stay in the title.

## Data format

Exports look like this (the same shape is used in `localStorage` under the key `taskmanager-v2`, plus a `settings` object):

```json
{
  "app": "TaskManager-V2",
  "version": 2,
  "exportedAt": "2026-10-13T09:30:00.000Z",
  "categories": [
    { "id": "c_abc123", "name": "Work", "color": "#3b82f6", "enabled": true, "createdAt": "…" }
  ],
  "tasks": [
    {
      "id": "t_def456",
      "title": "Send the quarterly report",
      "notes": "",
      "categoryId": "c_abc123",
      "priority": "high",
      "dueDate": "2026-10-15",
      "completed": false,
      "completedAt": null,
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "blocks": [
    {
      "id": "b_ghi789",
      "title": "Homework",
      "start": "15:00",
      "end": "20:00",
      "days": [1, 2, 3, 4],
      "date": null,
      "color": "#8b5cf6",
      "taskId": "t_def456",
      "notes": "",
      "notify": true,
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

- `priority` is one of `low`, `normal`, `high`, `urgent`.
- `dueDate` is a plain `YYYY-MM-DD` (no time zone surprises); `null` means no date.
- Block `start`/`end` are `HH:MM` (24-hour, end after start, same day). `days` are weekdays with `0` = Sunday … `6` = Saturday; when `date` is set the block happens once on that day and `days` is ignored.
- Imports are validated and cleaned: unknown fields are dropped, bad values fall back to defaults, and references to missing categories or tasks are cleared. Hand-edited files are fine.

## Project layout

```
index.html      markup for the app shell and the dialogs
css/styles.css  all styling; design tokens (colours, radii…) at the top, dark theme in [data-theme="dark"]
js/app.js       all behaviour: storage & validation, derived data, rendering, actions, dialogs, import/export, schedule & reminders
```

`app.js` is organised top-to-bottom as: constants → helpers → persistence/normalisation → derived data → rendering → actions → dialogs → import/export → schedule (blocks, day view, reminders) → toasts → events → init. Rendering is a straightforward "state → HTML" re-render, so most tweaks are a one-place change.

## Ideas for later

Sub-tasks, recurring tasks, drag-to-reorder, tags, a weekly calendar grid for the schedule, PWA/offline install with service-worker notifications that work while the tab is closed.
