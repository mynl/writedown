# Plan: Batch K, background-work safeguards, git tree marks on user events, and editor items K.02 to K.06

Written 2026-10-29, at version 2.32.0, after the git-status loop diagnosed and removed in 2.32.0
(`dev/done/plan-bounded-watcher-remove-git-tree-marks.md`). Covers Batch K of
`writedown-issues.md`: K.07 and K.08 (sections 1 to 5) and K.02 to K.06 (sections 6 to 10); K.01
is pended by the author and not in this plan. This plan stands alone: no conversation context is
needed to review or implement it. The Batch K table and its developer notes in
`writedown-issues.md` hold the original diagnoses; where they differ, this plan wins.

**Status: ruled 2026-10-29, ready for review and execution.** Every item has a ruling.

Ten steps in two version bumps:

| Bump | Step | Item | What | Where |
|:--|:--|:--|:--|:--|
| first | **[guidelines]** | K.08 | General rules for background work, for every software project | `V:\dev\CLAUDE.md`, the execute-plan skill, `CLAUDE.md` here |
| first | **[tripwire]** | K.08 | Every subprocess counted; a runaway rate is logged and shown | new `src-tauri/src/tripwire.rs`, every spawn site |
| first | **[app-home]** | K.08 | `WRITEDOWN_HOME` relocates `~/.writedown/`, so a test run cannot touch the real one | `config.rs`, `instance.rs` |
| first | **[idle-check]** | K.08 | A script that measures idle cost of a release build under synthetic load | new `scripts/idle-check.ps1` |
| first | **[tree-marks]** | K.07 | Git tree marks back, refreshed only on user events, bounded and lock-free | `git.rs`, store, tree, commands, config, help |
| second | **[find-bottom]** | K.04 | The find panel opens at the bottom of the editor | `src/editor/Editor.tsx` |
| second | **[word-count]** | K.03 | Palette "Word Count" | new `src/editor/wordCount.ts`, `src/commands.ts` |
| second | **[jump-back]** | K.02 | Alt+- and Alt+Shift+- move through the places you navigated from, per file | new `src/editor/jumpHistory.ts`, `editorView.ts`, keymap, registry |
| second | **[preview-font]** | K.05 | STIX Two Text in the Markdown and Quarto preview, configurable, aligned table figures | `package.json`, `src/App.css`, config |
| second | **[word-dictionary]** | K.06 | Windows stop overwriting each other's Tab-completion words | `src/editor/wordFreq.ts`, `src-tauri/src/wordfreq.rs` |

**Two minor version bumps**, each one commit with one CHANGELOG section, per the batched-release
delta in `CLAUDE.md`. The first carries the safeguards and the feature they were built to guard,
in the order above, so the safeguards exist first. The second carries the editor items, smallest
first; it lands after the first so the idle check and the tripwire already guard it. Two bumps
rather than one keep the safeguards bisectable apart from five unrelated editor changes. Versions
are assigned at execution. [guidelines] also edits two files outside any repository (no commit).

**Author's rulings (2026-10-29):**

- K.08: all three safeguards (rule, idle check, tripwire), and the guidelines written broadly, for
  background work in general rather than for git alone.
- K.07: tree marks come back, refreshed only on user events; no periodic timer ("things aren't
  changing much in the background").
- K.01 (math in the HTML preview): keep pended.
- K.02: "within current file (but remember across files)": one history per file, kept while you
  work in other files, and never a jump between files ("ST does that and it is annoying").
  Navigation only, not every place the caret rested: "we are trying to pick up navigation rather
  than all the micro-caret rest points".
- K.04: agreed, bottom, no config option.
- K.05: "this is for the rendered views created by Writedown. If you load an HTML page you honor
  its style specification."
- K.06: "fix the overwrite, leave limits", confirmed.
- K.03: prose only, as recommended, confirmed.

---

## Why: what went wrong in I.02

From 2.23.0 (issue I.02) to 2.31.1, every file-watcher event re-armed a `git status` sweep over
every project root. `git status` takes the repository's optional `index.lock` to refresh the index
and deletes it again; the watcher reported both, and the report re-armed the next sweep. The loop
never ended while a repository sat under a root. Measured on 2.31.1: about 46% of one core for
hours, 33 `git.exe` starts in 5 seconds, and `index.lock` collisions with commits made by other
programs.

The I.02 scope statement (`writedown-issues.md`, I.02) concluded "one `git status` on a warm repo
is ~10–30 ms, async, so speed at rest is untouched", on two premises that were false:

1. **"`git status` is read-only."** It writes `index.lock`. That write landed under a watched root.
2. **"10–30 ms per call, so idle cost is fine."** The cost per call was right, but nobody bounded
   or measured the call rate, which the watcher set, and which had no limit. A trailing debounce
   delays work; it does not bound how often the work runs.

Nobody measured the claim. The process had no step that would have: the scope statement asked for
scope, failure modes and external dependencies, not for rate, writes and feedback. The fix is to
ask those questions at design time ([guidelines]), measure before handover ([idle-check]), and
make a runaway loop loud at run time ([tripwire]).

---

## 1. [guidelines] Rules for background work

### 1a. `V:\dev\CLAUDE.md`: new section, for every software project

Insert after "Code style" (the last section). Proposed text:

```markdown
## Background work and performance claims

Added 2026-10-29. Writedown ran `git status` in a loop for weeks: each run took the repository's
`index.lock`, the file watcher reported it, and the report started the next run. The design had
concluded "speed at rest is untouched" from a 10–30 ms cost per call; nobody bounded or measured
how often it ran.

- **Background work** is anything that runs without a keypress: file watchers, timers, polling,
  store subscriptions that start work, retries, startup scans, and every subprocess any of them
  start.
- **A performance claim is a measurement.** "No impact", "negligible" and "fast" appear only with a
  number measured on a release build under realistic load. Idle cost is the cost per run times the
  runs per minute; state both, and the measured total.
- **Every scope statement for background work carries a background-cost line:** what triggers it;
  the highest rate it can run, and the mechanism that enforces that rate; the cost of one run and
  what it grows with; everything it writes (files, locks, caches, logs, network); and whether any
  of those writes can reach its own trigger.
- **No self-triggering.** Work whose writes can reach its own trigger is a loop until shown
  otherwise. Prefer triggers only a person can fire (focus, save, a command, opening something) to
  triggers the disk, the network or a timer can fire.
- **"Read-only" is verified, never assumed.** Many tools write while reading: `git status` takes
  `index.lock`, Python writes `__pycache__`, most CLIs keep caches and logs. Use the tool's
  no-write switch where it has one (`GIT_OPTIONAL_LOCKS=0`, `PYTHONDONTWRITEBYTECODE=1`).
- **Rates are bounded by a mechanism.** A trailing debounce delays work and bounds nothing.
  Background work runs one at a time (single-flight), keeps a minimum interval between runs, and
  every subprocess it starts has a timeout.
- **Idle cost follows what is on screen**, never the size of the inputs or roots, nor the write
  rate of other programs. An app given a whole drive and then left alone is idle.
- **Runaway work is loud.** Count background runs and subprocess starts; past a limit, log it and
  show it in the UI. A silent loop that costs a core for hours is the failure to design against.
- **Idle check before handover** whenever a change touches a watcher, timer, poller, a subscription
  that starts work, a subprocess or a startup scan: a release build, a realistic synthetic load, a
  minute left alone, CPU and child processes measured. Each project's `CLAUDE.md` names its
  command.
```

### 1b. The execute-plan skill (`C:\Users\steve\.claude\skills\execute-plan\SKILL.md`)

Two additions, so the review and the bump enforce 1a.

In section 3 (the review), after **Simplicity**:

```markdown
**Background cost.** If the plan adds or changes anything that runs without a keypress (a watcher
handler, a timer, polling, a subscription that starts work, a subprocess, a startup scan), it
carries the background-cost line `V:\dev\CLAUDE.md` requires: trigger, highest rate and what
enforces it, cost per run and what it grows with, what it writes, and whether those writes can
reach the trigger. A missing line, a rate bounded only by a debounce, or a "read-only" tool never
checked for writes is a stop.
```

In section 6 (hygiene at each bump), under **Run the gate**:

```markdown
When the change touches background work, the project's idle check is part of the gate, run on a
release build. A failure is reported with its numbers.
```

### 1c. This repository's `CLAUDE.md`: new section "Background work"

Insert after "Locked decisions". Lands in the first bump's commit (it names the script and module this plan
adds).

```markdown
## Background work

The general rules are in `V:\dev\CLAUDE.md` ("Background work and performance claims"). Here:

- **The file watcher never starts work proportional to the roots and never starts a subprocess.**
  It re-lists folders the tree has listed and reloads open files; Rust drops every other event
  (2.32.0, `watch.rs`).
- **Every subprocess starts through `tripwire::command(kind, exe)`**, which counts it; a test fails
  on any other `Command::new` outside test code. A rate past the kind's limit is logged and shown
  on the error bar.
- **Every git call is lock-free** (`GIT_OPTIONAL_LOCKS=0`, set in `git.rs`).
- **Idle check:** `npm run tauri build`, then `pwsh scripts/idle-check.ps1`. Part of the gate for
  any change that touches background work. It opens a window for about two minutes under its own
  `WRITEDOWN_HOME`, so the real `~/.writedown/` is never touched.
```

---

## 2. [tripwire] Count every subprocess; make a runaway rate loud

**Current behavior.** Subprocesses start from eight sites with a bare `Command::new`: `git.rs`
(two, `run_git` and `run_git_stdin`), `external.rs` (three), `lib.rs` (`new_window`), `render.rs`
(Python kernels), `search.rs` (`rg`), `update.rs` (`curl.exe`). Nothing counts them; the 2.31.1
loop started about 400 `git.exe` a minute and nothing noticed.

**Change.**

- New `src-tauri/src/tripwire.rs`:
  - `pub fn command(kind: &'static str, exe: impl AsRef<OsStr>) -> std::process::Command`: counts
    one start of `kind`, then returns `Command::new(exe)`. Each spawn site changes one line.
  - Per kind, a fixed 60-second window: the count resets when a minute has passed since the
    window opened. Counting is a mutex-guarded map of small structs; it runs once per subprocess
    start, never per keystroke.
  - Past the kind's limit, once per kind per process: append a line to the error log
    (`~/.writedown/logs/`, through the existing writer `config::log_error` uses) and emit a
    `tripwire` event `{ kind, count, limit }`. The `AppHandle` comes from a `OnceLock` set in
    `setup`; a start before that (the launcher) counts but cannot emit.
- Limits per minute, about three times the highest legitimate rate (the executor confirms each
  site's peak before fixing the number):

  | kind | sites | legitimate peak | limit |
  |:--|:--|:--|:--|
  | `git` | gutter on open and save, blame, tree marks | tree marks at most 6 sweeps a minute × 2 calls × roots | 120 |
  | `rg` | Find in Files, on Enter | user-paced | 60 |
  | `python` | kernel starts | pool warm-up, a restart | 30 |
  | every other kind | open externally, build, new window, update check | user-paced | 30 |

- `src/App.tsx`: listen for `tripwire` and set the error bar: "Background work is running away: 412
  git starts in the last minute (limit 120). Writedown keeps working; the details are in
  ~/.writedown/logs. Please report it."

**Tests (Rust).** The window counts and trips exactly once past the limit, and resets after a
minute (time injected, no sleeping). A guard test reads every `src/*.rs` through
`env!("CARGO_MANIFEST_DIR")`, drops each file's `#[cfg(test)]` module, and fails on any
`Command::new(` outside `tripwire.rs` (the junction helper in `files.rs` tests stays legal).

**Background cost.** Trigger: a subprocess start. Rate: that of the starts it counts. Cost: one
mutex and a map lookup. Writes: at most one log line per kind per session. Cannot reach its own
trigger (it starts nothing).

**Considered and rejected.** Sampling the process's own CPU and warning above a threshold: typing,
rendering and search use CPU legitimately, so the limit would need an idle detector; counting
starts catches the loop class that actually happened, at a fraction of the complexity. Counting
`fs-change` emits: already bounded at four a second by the 2.32.0 batch, so a limit would never
trip.

## 3. [app-home] `WRITEDOWN_HOME`

**Current behavior.** `~/.writedown/` is fixed: `config::writedown_dir` uses the home directory,
and `instance::instances_dir` (the launcher's window registry, which runs before Tauri) uses
`USERPROFILE`. A test launch of the real exe would write a session, a last-workspace entry and a
registry entry into the author's own `~/.writedown/`, and the next cold start would reopen the
test's deleted folder.

**Change.** When `WRITEDOWN_HOME` is set and non-empty, it replaces `~/.writedown/` in both
functions (one shared helper that needs no `AppHandle`). The dev-tree convention names this
variable `<APP>_HOME`. Nothing else changes. Outside the app home and not relocated: the WebView2
data folder and the window-state plugin's file under `%APPDATA%`, and the personal dictionary
default; the idle check kills its process rather than closing it, so the window-state plugin
saves nothing, and it never adds a dictionary word.

**Background cost.** None (a lookup at startup).

## 4. [idle-check] `scripts/idle-check.ps1`

A PowerShell script that measures what an idle release build costs while other programs write
under its roots. It automates live check 1 of the 2.32.0 plan, and is the gate [guidelines] calls
for.

**Usage.** `pwsh scripts/idle-check.ps1 [-Exe <path>] [-Seconds 60] [-KeepFixture]`. `-Exe`
defaults to `target\release\writedown.exe`, derived from `$PSScriptRoot`. Exit code 0 on pass, 1
on fail, with a small results table.

**Fixture (synthetic, generated, nothing committed).** Under `$env:TEMP\writedown-idle-<stamp>\`:

- `home\`: the `WRITEDOWN_HOME` for the run (default config written by `ensure_setup`).
- `work\repo\`: `git init`, about 200 small `.md` files in 10 folders, one commit under a fixed
  test identity (`-c user.name=… -c user.email=…`), then 3 files modified and 2 untracked, so
  tree marks exist. A `.gitignore` with `target/`.
- `work\repo\target\`: build churn, ignored by git.
- `work\other\`: a plain folder.

**Run.**

1. Launch `writedown.exe work work\repo` with `WRITEDOWN_HOME` set for the child. Two directory
   arguments open an unsaved two-folder project (nested roots included) in a new window: the
   launcher always opens a new window for a directory argument (`instance.rs`, rule 4), so the
   author's own windows are untouched.
2. Settle for 15 seconds: startup listing, the first tree-marks sweep, WebView2 start.
3. **Phase A, 60 s, churn outside the visible set.** A background writer (a second `pwsh`, so its
   own processes are not children of Writedown) every 100 ms writes a file in
   `work\repo\target\build\` and in `work\repo\docs\deep\` (neither listed), and every 2 s runs
   `git -C work\repo status` (taking `index.lock`, as the old loop did) and
   `git -C work\repo commit --allow-empty -m tick` (another program committing).
4. **Phase B, 30 s, add churn in a listed folder:** also a file written in `work\repo\` (a root)
   every 500 ms, which legitimately reaches `fs-change` and re-lists that folder.
5. Kill the Writedown process tree and the writer; delete the fixture unless `-KeepFixture`.

**Measured.**

- **CPU** of the whole process tree: `writedown.exe` plus its descendants (the WebView2
  processes, where the frontend's JavaScript runs; the 2.31.1 diagnosis measured only
  `writedown.exe`). `TotalProcessorTime` summed at each phase's start and end; the delta over
  elapsed time is a percentage of one core.
- **git starts**: every 100 ms, the `git.exe` processes whose parent is the Writedown PID
  (`Get-CimInstance Win32_Process`); distinct PIDs counted. Sampling can miss a single fast call,
  but never a loop, which is what this guards against.
- **Tripwire**: any `tripwire` line in `home\logs\` fails the run.

**Pass.** Phase A: under 1% of one core, no git starts. Phase B: under 5% of one core, no git
starts. If the baseline (step 4 below) already fails, stop and report the numbers: do not tune
the limits to pass.

**Background cost.** Not applicable: a developer script, run by hand.

## 5. [tree-marks] Git tree marks, refreshed on user events only

**Current behavior (2.32.0).** None: removed. Before 2.32.0, the tree tinted modified/renamed files
amber, added/untracked green and deleted red, and folders containing changes carried a dot; on by
default, `[git] tree_marks`, palette **Git: Tree Marks On / Off**; refreshed by every watcher
event, every save and every change of roots. The full implementation is in commit `753ef17`
(2.31.1); restore from there, with the changes below.

**Change.**

- **Triggers, all fired by the person, none by the disk:**
  1. The window regains focus (the `focus` listener in `src/App.tsx`, beside `recheckActive` and
     `refreshVisibleDirs`). Covers the usual case: a commit or an edit in another program, then
     back to Writedown.
  2. A save of ours, 2 seconds later (coalesces Save All, and the save-on-blur when leaving the
     window).
  3. The roots change: a project opened, switched or closed, a folder added or removed. The store
     subscription on `projFolders` / `root`, which also calls `setInstanceRoots`.
  4. Palette **Git: Refresh Tree Marks** (new), and **Git: Tree Marks On**.
  The file watcher is **not** a trigger: `onFsChange` gets no git call back.
- **Bounded, in one scheduler** (`requestGitMarks(manual?)` in `src/store.ts`): single-flight (a
  request during a sweep sets one "again" flag); at most one sweep per 10 seconds (a request inside
  the interval schedules one run at its end, a single timer); a manual request skips the interval
  but not single-flight. Marks off: requests do nothing.
- **One Rust command per sweep:** `git_tree_status(roots: Vec<String>)` replaces the old per-root
  `git_status(root)`. For each root, `rev-parse --show-toplevel`; roots in the same repository are
  swept once; then `git status --porcelain -z` per repository with `-C <toplevel>`. Each `git`
  call has a 3-second timeout (spawn, then `try_wait` until the deadline, then kill); a repository
  that times out is skipped and named in the reply, and the frontend says so once per session in
  the footer. An `AtomicBool` makes the command itself single-flight (a call during a sweep returns
  at once with `skipped: true`), as a second line of defense behind the scheduler.
- **Lock-free.** `run_git` already sets `GIT_OPTIONAL_LOCKS=0` (2.32.0), so `git status` writes
  nothing: no `index.lock`, no collision with a commit elsewhere, and no write a watcher could
  report. Tradeoff: git cannot refresh its stat cache, so in a repository whose index is stale each
  status re-checks the changed files; a commit or a `git status` from a terminal refreshes it.
- **Which repositories:** one per project root, as before. A root that is not inside a repository
  (a whole drive, `V:\dev`) contributes nothing, so repositories nested under such a root get no
  marks unless they are roots themselves. Extending marks to repositories found under listed
  folders is a possible follow-up, not this plan.
- **Restored as in 2.31.1:** the `gitMarks` / `gitDirMarks` / `gitTreeOverride` state, the
  `FileTree.tsx` selectors and row class, the "Git marks in the tree" CSS block (with
  `.tree-row.active .tree-name { color: inherit }`), the palette **Git: Tree Marks On / Off**, the
  once-per-session footer note when no root is in a repository, `[git] tree_marks = true` in the
  default config with a comment naming the four triggers, `git_tree_marks` in `EditorSettings`
  (Rust and `api.ts`). Reverse the 2.32.0 test assertion that the default config has no
  `tree_marks`.
- `HELP.md` "Git marks": tree marks back, the four triggers, "they do not follow changes made by
  other programs while Writedown has focus; switching away and back, or **Git: Refresh Tree
  Marks**, updates them", and the lock-free sentence kept.

**Background cost.**

- Triggers: focus, save (+2 s), roots change, palette. All fired by the person.
- Highest rate: one sweep per 10 s, enforced by the scheduler, backed by the Rust single-flight
  flag. A sweep is 2 git starts per root (`rev-parse`, `status`), so with 5 roots at most 60 a
  minute, and that only if focus or saves arrive every 10 s for a whole minute.
- Cost per sweep: per repository 10 to a few hundred ms of `git status`, off the UI thread, capped
  at 3 s by the timeout.
- Writes: nothing (`GIT_OPTIONAL_LOCKS=0`).
- Can its writes reach its trigger? No: it writes nothing, and no trigger comes from the disk.

**What it won't do.** Marks do not change while Writedown keeps focus and another program changes
git state (a background commit by another session); they catch up on the next save, focus change
or refresh command. Renames show as renamed only where git reports them so. Deleted files have no
row to tint.

---

## 6. [find-bottom] The find panel at the bottom (K.04)

**Current behavior.** `search({ top: true, scrollToMatch: … })` in `src/editor/Editor.tsx` (line
178) has put Find and Replace at the top of the editor since 1.6.0. CodeMirror's default, and
Sublime's place, is the bottom; Go to Line (Ctrl+G, CodeMirror's `showDialog`) already opens at
the bottom.

**Change.** `top: false`. No config option (author, 2026-10-29). If `HELP.md` names the panel's
position, update it.

**Background cost.** None.

## 7. [word-count] Palette "Word Count" (K.03)

**Current behavior.** Nothing counts words.

**Change.**

- New `src/editor/wordCount.ts`, pure and with no imports:
  `countWords(text: string): { words: number; characters: number }`, applying the rule below.
- `src/commands.ts`: palette command **Word Count**. Scope: when any selection range spans more
  than one line, the text of every non-empty selection range; otherwise the whole document. The
  result goes to the status bar through `showStatusMessage`: "Word count, selection: 1,234 words,
  7,890 characters" (or "document"), integers comma-separated.
- **Counting rule (author, 2026-10-29): prose only.**
  Removed before counting: the YAML front matter at the top, fenced code blocks (``` and `~~~`,
  Python cells included), HTML comments and tags, display math (`$$ … $$`), and link and image
  targets (the `(…)` after `]`). Inline math (`$…$`) counts as one word, a citation (`@key`) as
  one. A word is a maximal run of letters and digits (`\p{L}`, `\p{N}`), with an internal
  apostrophe or hyphen keeping the run together (`don't`, `well-known`). Characters: the code
  points of the text kept, spaces included, line breaks excluded.
- **Verification.** No frontend test runner exists. The executor checks `countWords` with a
  throwaway node script in the session scratchpad (Node 26 runs the `.ts` module directly) on:
  a plain sentence; front matter alone (0 words); a Python cell between two paragraphs (cell
  excluded); `don't` and `well-known` (one word each); `$x^2$` (one); a `$$` block (none); a
  table row `| alpha | beta |` (two); `[text](http://example.com/a/b)` (one). Results go in the
  execution log.

**Background cost.** An explicit command only; one pass over the text, a few ms for a long
document; writes nothing.

## 8. [jump-back] Alt+- and Alt+Shift+- through the places you navigated from (K.02)

**Rulings (2026-10-29):** one history per file, kept while you work in other files, and Alt+-
never moves to another file ("ST does that and it is annoying"). Navigation only: "we are trying
to pick up navigation rather than all the micro-caret rest points".

**How Sublime does it, and why this differs.** Sublime's jump history (`history_list.py` in its
Default package, read 2026-10-29) records on every selection change and every tab switch, in one
list per window that crosses files. Repeats of the same command within one second merge into one
record, so each typing burst, run of arrow presses, click or find becomes a stop. That
fine-grained, cross-file history is what the rulings reject. Kept from Sublime: positions move
with edits (it stores them as regions in the buffer), a run of the same command leaves one
record, recording after a step back drops the forward part, and back and forward are never
themselves recorded.

**Current behavior.** No caret history. Alt+- and Alt+Shift+- are unbound; Ctrl+- is font zoom.

**Change.**

- New `src/editor/jumpHistory.ts`: a module-level map from normalized path to `{ list, index }`,
  positions as document offsets, at most 100 per file and 200 files (least recently used
  dropped), session only, never persisted. The record, merge, truncate, back, forward, map and
  clamp logic are pure functions; the editor wiring is a thin layer over them.
- **What gets recorded: the place you navigated FROM**, for these navigations only:
  1. `jumpToLine` (`src/editor/editorView.ts`, line 167), the one helper behind outline clicks,
     Find in Files hits and palette go-tos (`Outline.tsx`, `Palette.tsx`, the pending jump in
     `Editor.tsx`): one call at its top records the caret before the move. A jump into a file
     just opened, whose caret is still at its start and whose history is empty, records nothing.
  2. Find next and previous (F3, Shift+F3, Enter in the find panel): CodeMirror tags these
     transactions `userEvent: "select.search"`, so an `EditorView.updateListener` records
     `tr.startState.selection.main.head`. Select All Matches (`select.search.matches`) is not
     navigation and is skipped.
  3. Go to Line (Ctrl+G): CodeMirror's dialog moves the caret with no `userEvent`, so the record
     is made when the `gotoLine` registry command runs, at the place Ctrl+G was pressed.
  4. Ctrl+Home and Ctrl+End: today these come from CodeMirror's default keymap (through
     `basicSetup`), not from Writedown's registry. Add registry actions `docStart` and `docEnd`,
     bound in `DEFAULT_KEYS`, which record and then run CodeMirror's `cursorDocStart` and
     `cursorDocEnd`. The Shift variants (extend the selection) stay as they are and record
     nothing.
- **Never recorded:** typing, arrows, PageUp and PageDown, Home and End, mouse clicks and drags,
  scrolling, undo and redo, and the moves Alt+- and Alt+Shift+- make.
- **Merging:** a run of the same navigation records only where it started (if the newest record
  came from the same kind of navigation and the caret is still exactly where that navigation left
  it, nothing is recorded, so ten F3 presses leave one record). A record on the same line as the
  newest one is skipped. Recording after a step back drops the forward part, as a browser does.
- **Positions move with edits:** on each document change in the active file, its positions are
  mapped through the change (`tr.changes.mapPos`). When a change replaces the whole document (a
  file reloaded after an outside edit), positions keep their line and column instead. A file
  edited outside Writedown while not active clamps its positions to the new length.
- **Back (Alt+-):** at the newest end, first record the current place (so forward can return to
  it), then move to the previous entry, centered. At the oldest entry, a status note "Start of
  jump history". **Forward (Alt+Shift+-)** the reverse, with "End of jump history".
- Keymap `{ key: "Alt+-", action: "jumpBack" }` and `{ key: "Alt+Shift+-", action: "jumpForward" }`;
  registry entries "Jump Back" and "Jump Forward" (palette too). Check at build how the keymap
  parser and CodeMirror name these keys: with Shift held the key arrives as `_` on a US layout,
  so the forward binding may need CodeMirror's `Alt-_` form. Both must work, and `[keys]` must
  rebind them.
- **Verification.** The pure functions are checked with a throwaway node script, as in
  [word-count]: a run of the same kind records once; the same line is skipped; a record after a
  step back drops the forward part; back at the newest end records the current place; mapping
  through an insertion above and a deletion around a position; a whole-document replacement keeps
  line and column; clamping. The keys and each navigation source are checked live.

**Background cost.** Trigger: navigation commands (fired by the person) for recording; each
document change in the active file for mapping, which puts the mapping on the typing path. Cost:
at most 100 `mapPos` calls per edit (microseconds), and one `userEvent` check per selection
change. Writes nothing.

**What it won't do.** A click far away, PageDown or scrolling is not a jump and leaves no record.
Alt+- never opens or switches to another file. The history ends with the session.

## 9. [preview-font] STIX Two Text in Writedown's own preview (K.05)

**Ruling (2026-10-29):** the font applies to the views Writedown renders, the Live and Rendered
tabs of Markdown and Quarto documents. An HTML file's preview keeps the page's own styles, as now.

**Current behavior.** `.preview` in `src/App.css` (about line 703) sets
`font-family: system-ui, -apple-system, "Segoe UI", sans-serif`; both tabs draw through it
(`src/preview/Preview.tsx`). STIX Two, the house kit's text face, is not installed on DOOB.

**Change.**

- **Bundle the font**, so it works on any machine and never touches the network:
  `npm install @fontsource/stix-two-text` (5.3.0, OFL-1.1, checked 2026-10-29), importing its 400,
  400-italic, 600, 700 and 700-italic stylesheets in `src/main.tsx`. Vite copies the woff2 files
  into `dist/`; the unicode-range subsets mean only the scripts a document uses are loaded.
  Regenerate `THIRD-PARTY-NOTICES.md` with `pwsh scripts/generate-notices.ps1`.
- `.preview { font-family: var(--preview-font, "STIX Two Text", serif); }`. Code and `pre` keep
  `var(--mono)`; KaTeX keeps its own fonts; headings follow the body font (the kit's Lato
  headings are out of scope).
- **Aligned figures:** `.preview td, .preview th { font-variant-numeric: lining-nums tabular-nums; }`,
  which also covers tables printed by Python cells (`greater_tables` output) unless their own CSS
  says otherwise. Verify the bundled font carries `tnum`: in the stub-runtime boot, a cell holding
  `1111` and one holding `0000` measure the same width. If they do not, stop and report rather
  than switch fonts silently.
- **Config `[preview] font_family`** (unset: STIX Two Text), through `EditorSettings` (the
  `config.rs` field and parse, the `api.ts` type), applied by `loadTheme` as the `--preview-font`
  variable, the way `--tree-font` is. The default template gets a `[preview]` section with the key
  commented out and a one-line comment. `default_config_is_valid_toml_and_honest` asserts today
  that `[preview]` is absent ("decorative"); it now asserts the section exists.
- **Look-and-feel check:** STIX Two's x-height is smaller than Segoe UI's, so 15 px may read
  small. Check it with the author in the `npm run tauri dev` loop and raise the default
  (`--wd-preview-font-size` fallback in `App.css`, `15 + previewZoom` in `Preview.tsx`) only if
  asked.

**Background cost.** None; the webview loads the font files once.

## 10. [word-dictionary] Windows stop overwriting each other's words (K.06)

**Current behavior.** `src/editor/wordFreq.ts`: each window loads `~/.writedown/word-frequency.json`
once, keeps the store in memory, and 5 s after a scan writes its whole store back
(`word_freq_save`, a plain `std::fs::write` in `src-tauri/src/wordfreq.rs`). With two windows
open, the later write erases what the other window scanned since it loaded. The limits stay as
they are (author, 2026-10-29): the 50 most recently scanned files, 250 words per file, words of 5
letters or more.

**Change.**

- `scheduleSave` in `wordFreq.ts`: when the 5-second timer fires, load the file again, merge with
  a pure `mergeStores(disk, mine)` (for each file path the entry with the larger `scanned` wins,
  then the existing prune to the 50 newest), save the merge, and adopt it as this window's store
  (`aggregate = null`, rebuilt at the next Tab as now). Each window then also picks up the others'
  words at its next save. The format stays owned by `wordFreq.ts`; Rust handles text only.
- `word_freq_save` writes atomically: a temporary file in the same folder, then a rename (the
  pattern `files::write_file` uses; extract a small shared helper if that is clean, else the same
  few lines in `wordfreq.rs`). A reader then never sees a half-written file, which would parse as
  empty and turn the merge back into the old overwrite.
- A file that exists but fails to parse during the merge is not saved over: log it to
  `~/.writedown/logs/` (the line names the file; deleting it starts a fresh dictionary) and keep
  the in-memory store. A corrupt dictionary is reported, never silently replaced.
- **Accepted race:** two windows whose timers fire within the same few milliseconds can still lose
  one scan, never a whole store. A lock file would close it, and locks are what this batch
  removes.
- **Verification.** `mergeStores` is checked with a throwaway node script (disjoint stores; the
  same path newer on either side; the prune keeps the 50 newest); the atomic write gets a Rust
  unit test (writes, replaces, leaves no temporary file).

**Background cost.** Trigger: the existing save, 5 s after a scan; scans run on opening and saving
a file. Rate: at most one save per 5 s per window. Cost: one read, parse, merge and write of a
file of at most about 50 × 250 words, a few hundred KB. Writes: `~/.writedown/word-frequency.json`.
Can that reach a trigger? Only the file watcher could receive it, and only if `~/.writedown/` were
a folder listed in the tree; it would then re-list that folder, which writes nothing. No loop.

---

## Acceptance

**Gates, at each of the two bumps:** `npm run build`; `cargo test` with the working directory
`src-tauri/` (never `--manifest-path` from the repo root); `npx madge --circular --extensions
ts,tsx src/main.tsx`; the headless smoke-boot of `dist/` (plain boot and stub-runtime boot, as in
the 2.32.0 execution log).

**Idle check** (each run on a fresh `npm run tauri build`):

1. **Baseline**, after [tripwire] and [app-home], before [tree-marks]: must pass. A failure here is
   a 2.32.0 problem: stop and report it.
2. **First bump**, after [tree-marks]: must pass with marks on (the default). The settle period
   includes the startup sweep; the two phases must show no git starts.
3. **Second bump**, after [word-dictionary]: must pass ([word-dictionary] changes background
   work, [jump-back] sits on the typing path).

Every result (CPU per phase, git starts, tripwire lines) goes into the execution log.

**Rust unit tests.** First bump: the tripwire window and limit; the `Command::new` guard;
`WRITEDOWN_HOME` resolution (set, empty, unset); `git_tree_status` parsing restored from the
2.31.1 `state_of` tests; the repository dedupe (two roots in one repository, one sweep); the
timeout kills a stuck child (a `git` stand-in that sleeps, or skipped with a note if none can be
made portably). Second bump: the atomic write in `wordfreq.rs`; the `[preview]` section in the
default config test.

**Node checks** (throwaway scripts, results in the execution log): `countWords`, the jump-history
functions, `mergeStores`.

**Live checks (author, release build).** First bump:

1. Opening a project with roots in repositories shows the marks.
2. An edit in another editor, then back to Writedown: the mark appears.
3. A commit in a terminal, then back: the marks clear.
4. A save in Writedown: the mark updates within about 2 s (up to 10 s if a sweep just ran).
5. **Git: Tree Marks Off** clears them; **On** brings them back; **Git: Refresh Tree Marks** works.
6. AGGREGATE (with whole drives as folders) left alone for a minute: Task Manager shows no
   `git.exe` children and Writedown near 0% CPU.
7. A commit in `aggregate` from another session while Writedown is open never fails with
   "index.lock exists".

Second bump:

8. Ctrl+F and Ctrl+H open at the bottom of the editor; F3 still centers the match.
9. **Word Count** on a document, and on a selection over several lines; a selection within one
   line counts the whole document.
10. In a long file: an outline click, a Ctrl+G and a run of F3 presses, then Alt+- returns
    through those starting places in reverse (one stop for the whole F3 run) and Alt+Shift+-
    goes forward. Clicks, arrows and PageDown in between leave no stops. Type a paragraph above
    a recorded place, then Alt+-: it lands on the same text. Switch to another file and back:
    Alt+- still walks the first file's history, and never jumps to another file.
11. The Live and Rendered tabs show STIX Two Text and a numeric table lines up;
    `[preview] font_family = "Georgia"` in config.toml changes it on save; an HTML file's preview
    still uses the page's own fonts.
12. With two windows open, words learned from a file opened in one window are offered by Tab in
    the other after both have saved.

## CHANGELOG sketch

First bump:

- **Added:** git tree marks are back, refreshed when you return to Writedown, 2 s after a save,
  when the project's folders change, and on **Git: Refresh Tree Marks**; never from file activity,
  at most once per 10 s, and lock-free.
- **Added:** a runaway rate of subprocess starts is logged and shown on the error bar.
- **Added:** `WRITEDOWN_HOME` moves `~/.writedown/` elsewhere (used by the idle check).
- **Added (developer):** `scripts/idle-check.ps1` measures the idle cost of a release build.

Second bump:

- **Added:** **Word Count** in the palette, for the selection or the whole document, prose only.
- **Added:** Alt+- and Alt+Shift+- step back and forward through the places you navigated from
  (outline, Find in Files, Find, Go to Line, Ctrl+Home and Ctrl+End), within the current file;
  each file keeps its own history.
- **Changed:** the find panel opens at the bottom of the editor, as in Sublime.
- **Changed:** the preview sets text in STIX Two Text, the house kit's face, with table figures
  aligned; `[preview] font_family` changes it. HTML files keep their own styles.
- **Fixed:** with several windows open, Tab completion's word dictionary no longer loses the words
  one window learned when another saves.

## Out of scope

- K.01, math in the HTML preview: pended by the author (the K.01 notes in `writedown-issues.md`
  keep the design).
- Marks for repositories nested under a root that is not itself in a repository.
- A periodic refresh of the marks (ruled out by the author, 2026-10-29).
- A tripwire for frontend work (store subscriptions, React render loops); the counted resource
  here is subprocess starts.
- Raising the word-dictionary limits, and a "learn this project" command (author, 2026-10-29).
- The house kit's Lato headings in the preview.

## Working notes for the executor

- `writedown-issues.md` is committed with CRLF line endings; most sources are LF. Edit it with the
  Edit tool only: `sed -i` from Git Bash rewrites every line ending and turns a ten-line change
  into a whole-file diff (it happened while this plan was written, and was reverted).
- At each bump, tick the Batch K items in `writedown-issues.md` (✅ in the item row) with the
  version they landed in, as in Batch J.

## Execution log

Executed from 2026-10-29, from 2.32.0. Review found every named file, symbol and snippet as
described (spawn sites, `writedown_dir`, `instances_dir`, `jumpToLine` at line 167, `search({ top:
true })` at line 178, `.preview` font at line 707, the focus listener, the roots subscription, the
word-frequency pair, the 2.31.1 tree-marks code); no name collisions for `tripwire`,
`git_tree_status`, `requestGitMarks`, `countWords`, `mergeStores`, `jumpBack`, `jumpForward`,
`docStart`, `docEnd`, `WRITEDOWN_HOME`. No blockers.

### First bump

**Divergences**

- **[guidelines] wrapping.** The execute-plan skill wraps at 80 columns, so its two additions are
  rewrapped to match; the words are the plan's. `V:\dev\CLAUDE.md` and the skill are outside any
  repository and are not committed.
- **[tripwire] report through a callback.** `tripwire::init` takes a closure (set in `setup` in
  `lib.rs`, which logs through `config::log_error` and emits `tripwire`) instead of storing the
  `AppHandle`. With the handle stored and `emit` called inside `tripwire.rs`, every spawn site,
  ignored tests included, linked the Tauri runtime into the test binary, which then would not load
  (`STATUS_ENTRYPOINT_NOT_FOUND`, the comctl32 v6 manifest the test exe lacks). Clean HEAD's test
  binary links no Tauri runtime at all; the callback keeps it that way.
- **[tripwire] message.** The trip fires the moment the count passes the limit, so the count is
  always limit + 1; the log line and the error bar give the seconds since the window opened
  instead ("121 git starts in 14 s (limit 120 a minute)"), which says how fast it is running.
- **[tripwire] limits.** Peaks confirmed: `git`, tree marks at most 6 sweeps a minute of one
  `rev-parse` per root and one `status` per repository, the gutter two per open, save or tab switch
  while on, blame three or four per request; `rg` one per query on Enter; `python` up to
  `max_kernels` at warm-up plus restarts; the rest one per command. Kept 120 / 60 / 30 / 30. 120
  `git` equals ten roots in ten repositories swept every 10 s for a whole minute, so it is about
  three times the five-root peak the plan names, not three times any project size; the 2.31.1 loop
  ran at about 400 a minute.
- **[tripwire] kinds:** `git`, `rg`, `python`, `viewer` (`open_external`), `shell`, `build`,
  `window` (`new_window`), `update` (`curl.exe`).
- **[idle-check] own WebView2 data folder.** The script also sets `WEBVIEW2_USER_DATA_FOLDER`
  under the fixture. A host using the default data folder joins the browser process of any
  Writedown window already open, so the test window's frontend would run outside the measured
  tree (and under the author's process). The script fails if the tree holds no
  `msedgewebview2.exe`.
- **[idle-check] git sampling** uses `Get-Process -Name git` and its `Parent` (PowerShell 7),
  faster than a CIM query; the CIM query builds the process tree at each phase's start and end.

**Idle check 1, baseline** (2026-10-29, release build of 2.32.0 plus [tripwire] and [app-home],
before [tree-marks]): settle 15 s 4.82% of one core; phase A 60 s 0.36%, 0 git starts; phase B
30 s 1.09%, 0 git starts; tree of 7 processes, 6 of them WebView2; no tripwire line. Pass. The real
`~/.writedown/` was untouched (`session.json` older than the run, `instances/` empty) and the
fixture was deleted.

- **[tree-marks] timeout.** `run_timed` reads stdout on its own thread (a large `status` cannot
  stall git against a full pipe while the deadline is polled every 5 ms) and at the deadline kills
  the whole tree with `taskkill /T /F`: the `git.exe` on PATH is Git for Windows' launcher, and
  killing it alone leaves the real git running. `taskkill` is its own tripwire kind. The test
  stands `cmd /C ping -n 30` in for git; it returns at the 0.5 s deadline and no `ping.exe`
  survives it. The 3 s timeout applies to the sweep's two calls only; the gutter and blame keep
  their untimed calls (a blame on a long history can take longer than 3 s).
- **[tree-marks] one command builder.** `git_command` builds every git call (tripwire, `-C`,
  `GIT_OPTIONAL_LOCKS=0`, no console window) for `run_git`, `run_git_stdin` and the sweep.
- **[tree-marks] dedupe tests.** The dedupe is a pure `push_unique` (case-insensitive), tested
  alone; a second test sweeps a real temporary repository with two roots inside it and one
  outside (one repository swept, two entries, no `index.lock` left), and skips with a note where
  git is not on PATH.
- **[tree-marks] folder dots** roll up to the drive instead of stopping at the swept root, since a
  sweep is now per repository, not per root. A root above a repository (the idle check's `work`
  above `work\repo`) also gets its dot; folders above the roots are never drawn.
- **[tree-marks] scheduler details.** A request with no roots clears the marks without spending
  the 10 s interval, so the first real sweep is not delayed by a focus event that arrived before
  the project loaded. A store subscription re-requests when `[git] tree_marks` flips in
  config.toml, so turning it off clears the marks at once.
- **[tree-marks] footer notes** reworded without a dash ("git tree marks off: no repository among
  the project's folders (or git not found; set [git] exe in config.toml)"), and a second
  once-per-session note names repositories skipped by the timeout.

**Idle check 2, first bump** (release build of 2.33.0, marks on), run twice: settle 16.92% and
9.06% of one core, with 1 and 3 git starts sampled (the startup sweep); phase A 0.39% and 0.80%,
0 git starts; phase B 3.78% and 1.29%, 0 git starts; no tripwire line. Pass. Phase B's spread
between runs (1.09% at baseline, 3.78%, 1.29%) is WebView2 noise, not a trend; phase A's 0.80%
is the closest any run came to its 1% limit.

**Gates (2026-10-29, all green):** `npm run build` (inside `npm run tauri build`): tsc and vite,
built. `cargo test` (cwd `src-tauri/`): 97 passed, 0 failed, 15 ignored; no warnings. New:
`tripwire::tests::{window_trips_once_and_resets, every_spawn_goes_through_the_tripwire}`,
`config::tests::writedown_home_resolution`, `git::tests::{porcelain_codes_map_to_states,
porcelain_parses_to_absolute_paths, roots_in_one_repository_dedupe,
tree_status_sweeps_each_repository_once, timeout_kills_a_stuck_child}`.
`npx madge --circular --extensions ts,tsx src/main.tsx`: no circular dependency. Headless
smoke-boot of `dist/` in Edge: the plain boot stops at the expected `getCurrentWindow()`
ErrorBoundary (2 KB DOM); the stub-runtime boot renders the layout with the status bar, and the
console holds only "no backend" rejections. (Edge must be pointed at `localhost`, not
`127.0.0.1`: `vite preview` listens on the IPv6 loopback.)

**Left for the author:** live checks 1 to 7 on a release build.
