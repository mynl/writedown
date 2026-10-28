# Plan: file watcher limited to the visible tree; git tree marks removed

Written 2026-10-28, at version 2.31.1, from a diagnosis of a slow Writedown window. This plan
stands alone: no conversation context is needed to review or implement it.

Three steps, **[git]**, **[watcher]** and **[tidy]**, land as ONE minor version bump (one
commit, one CHANGELOG section), per the batched-release delta in CLAUDE.md. The version is
assigned at execution.

**Author's ruling (2026-10-28):** delete the git tree marks. "The file colors and marks were
nice but not worth sacrificing speed for. This app MUST STAY FAST." The goal is that a project
may hold whole drives (`V:\`, `D:\`, `C:\`) as roots and stay idle and responsive.

---

## The problem as observed

The window with project AGGREGATE open took about a minute to open `SKILL.md` from a
double-click in the project tree, did not preview, and had been slow for a while. AGGREGATE's
roots included the whole of `V:\dev`, `V:\worktrees` and `D:\Projects\`, plus several folders
nested inside those (`V:\dev\aggregate`, `V:\worktrees\aggregate_REFACTOR`,
`D:\Projects\aggregate`, …).

Measurements on the running release build (2.31.1):

- `writedown.exe` used about 46% of one core continuously; 2,680 CPU-seconds since launch,
  4.4 hours earlier. A second window (project PMIR, two roots) was idle.
- 33 `git.exe` children in a 5-second sample: `rev-parse --show-toplevel` and
  `status --porcelain -z` against every root, back to back, without pause.
- A `FileSystemWatcher` on `V:\dev\aggregate\.git` recorded `index.lock` created and deleted
  repeatedly, for the main repository and its `aggregate_REFACTOR` worktree.
- After the author removed `V:\dev` from the project: about 2% of a core, but still 18
  `git.exe` children per 5 seconds. The git sweep sustains itself without outside churn.

## Root cause

1. **One IPC message per filesystem event, unfiltered.** `src-tauri/src/watch.rs`
   (`watch_workspace`) arms one recursive `notify` watcher over every root and emits an
   `fs-change` event for every OS notification: `.git`, `target`, `.venv`, `node_modules`,
   everything. Nested roots deliver each event twice. The cost therefore scales with the write
   rate under the roots, which with `V:\dev` as a root includes every build and every other
   Claude Code session.
2. **Every event re-arms a git sweep over every root.** `onFsChange` (`src/store.ts`, about
   line 1415) calls `refreshGitStatus()` first, for every event. That is a 1-second trailing
   debounce, after which `git_status` runs `rev-parse` and `status` for each root in turn, with
   no guard against a sweep already in flight.
3. **The sweep feeds itself.** `git status` takes the optional `index.lock` (to refresh the
   index stat cache) and deletes it. Those two events land inside a watched root, re-arm the
   debounce, and start the next sweep. The loop never ends while any repository is under a
   root.
4. **Collateral: lock collisions.** The sweep takes `index.lock` in repositories where other
   sessions commit (`aggregate`, `aggregate_REFACTOR`). A `git commit` that coincides fails with
   "index.lock exists". HELP.md lists the git features as read-only; `git status` is not
   strictly so.

The single consumer of `fs-change` is `onFsChange`, wired in `src/App.tsx` (about line 77).
It acts on exactly four things:

| Consumer | Needs events for |
|:--|:--|
| git tree marks (`refreshGitStatus`) | anything under a root (deleted by this plan) |
| tree refresh | a path whose parent folder, or which itself, is a key of `dirCache` |
| project reload | the open `.wdproj` file |
| tab reload / conflict flag | the path of an open tab |

So once the tree marks are gone, every event outside the last three rows is wasted work.

**Design principle.** Background cost is a function of the visible set (folders the tree has
listed, open tabs, the project file), never of the size of the roots or the write rate under
them.

### Also found

- **One bad root disables all watching, silently.** `watch_workspace` returns on the first
  root that fails to arm (`map_err(...)?` inside the loop), dropping the watcher for every
  root, and `applyWatch` in `src/store.ts` (about line 113) swallows the error with
  `.catch(() => {})`. A project root on a missing drive therefore means no file watching at
  all, with no message. CLAUDE.md requires failures to be surfaced.
- **The project file may not be watched.** `.wdproj` files live in `~/.writedown/projects/`,
  which is rarely under a root, and `syncExtraWatch` watches only open tabs. The project-reload
  path in `onFsChange` (issue D.11, "an edit from another editor, or from another Writedown
  instance") then never fires. Verify during implementation; fix if confirmed.
- **Overflowed event buffers are dropped without a signal.** `notify` 6.1.1's Windows backend
  (`notify-6.1.1/src/windows.rs`, `handle_event`) uses a 16 KB `ReadDirectoryChangesW` buffer
  and ignores the zero-byte completion that marks an overflow: the zeroed buffer parses as
  action 0 and falls through `_ => ()`. A burst can lose events with no trace. Existing
  backstops already cover this: window focus runs `recheckActive` and `refreshVisibleDirs`
  (`src/App.tsx`, about lines 110 to 123), and every save checks the disk stamp first (issue
  B.04), so a lost event can leave a stale view but never causes an overwrite. No change here;
  this plan does not upgrade `notify`.
- **`src/App.tsx` contains a literal NUL byte** (line 193, `ws + "<U+0000>" + …`). ripgrep and
  grep classify the file as binary and skip it, so code searches silently miss everything in
  it, including the `fs-change` listener.

---

## 1. [git] Remove the git tree marks

**Current behavior.** In a repository the tree tints modified/renamed files amber,
added/untracked green and deleted red, and folders containing changes carry a dot. On by
default; `[git] tree_marks` in config; palette **Git: Tree Marks On / Off**. Driven by
`git_status` sweeps over every root, triggered by every watcher event, every save, and every
change of roots.

**Change.** Delete the feature and everything that exists only for it.

- `src-tauri/src/git.rs`: delete `git_status`, `GitStatus`, `GitEntry`, `state_of` and the
  `state_of` tests. Keep `git_exe`, `run_git`, `run_git_stdin`, `toplevel`, `git_show_index`
  (gutter marks) and the blame code behind **Diff: When Did This Line Change**.
- `src-tauri/src/git.rs`: in `run_git` and `run_git_stdin`, set `GIT_OPTIONAL_LOCKS=0` on the
  command. None of the remaining commands (`rev-parse`, `show`, `blame`) take a lock today; the
  variable keeps it that way for any git command added later, so Writedown can never collide
  with another process's `index.lock`.
- `src-tauri/src/lib.rs`: drop `git::git_status` from the handler list.
- `src-tauri/src/config.rs`: delete the `git_tree_marks` field and its parse; delete the
  `tree_marks = true` line and its comment from the default config template (about lines 54 to
  58), rewording the `[git]` comment to cover `gutter_marks` and `exe` only. An existing
  `config.toml` that still contains `tree_marks` must load without error or warning (the
  parser ignores unknown keys as of 2.31.1; confirm).
- `src/api.ts`: delete `GitEntry`, `GitStatus`, `gitStatus`, and `git_tree_marks` from the
  editor-settings type.
- `src/store.ts`: delete `gitMarks`, `gitDirMarks`, `gitTreeOverride` (state, types,
  initial values), `gitStatusTimer`, `gitStatusNoted` and `refreshGitStatus`. Remove its three
  call sites: the top of `onFsChange`; `saveDoc` (about line 1850, keeping the gutter repaint
  beside it); the roots subscription (about line 2940, keeping `setInstanceRoots`). Reword
  that subscription's comment.
- `src/commands.ts`: delete the `git-tree-on` and `git-tree-off` commands.
- `src/tree/FileTree.tsx`: delete the `gitState` / `gitDirDot` selectors, the `git-<state>`
  class on the row, and the `tree-git-dot` span.
- `src/App.css`: delete the "Git marks in the tree" block (`.tree-row.git-*`,
  `.tree-row.active .tree-name` if nothing else needs it, `.tree-git-dot`).
- `HELP.md`: rewrite the "Git marks" section to cover gutter marks only, and state that every
  git command Writedown runs is read-only and lock-free.

`git grep -n -i "tree.marks\|gitMarks\|gitDirMarks\|gitTreeOverride\|git_status\|refreshGitStatus"`
must return nothing afterward except CHANGELOG history.

## 2. [watcher] Filter by the visible set and batch, in Rust

**Current behavior.** As in "Root cause" items 1 and 2: one recursive watcher over every root,
one `fs-change` emit per OS event, nested roots doubling events, the first failing root
disabling all watching.

**Change.** Rust holds the visible set, drops every irrelevant event before it reaches the
webview, and delivers the rest in batches. The `fs-change` payload stays `string[]`, so
`onFsChange` keeps its logic (minus the git line removed in [git]) and simply runs once per
batch instead of once per event.

**Interest set.** New command `set_watch_interest(dirs: Vec<String>, files: Vec<String>)`,
replace-all semantics, stored normalized in a `HashSet` each:

- `dirs`: the keys of `dirCache` (every folder the tree has listed and still holds, which is
  exactly the set `onFsChange` matches against today; `refreshDirs` already prunes it to
  what is reachable).
- `files`: the paths of all open tabs (scratch buffers excluded) plus the open project file.

The frontend calls it from a `useStore.subscribe` in `src/store.ts` whenever the key set of
`dirCache`, the tab paths, or `projectFile` change (compare by content, not identity; debounce
about 100 ms). These change on expand, collapse, open and close, never per keystroke.

**Filter.** An event path `p` passes when `norm(p)` is in `files`, or `norm(p)` is in `dirs`
(a folder event has the folder itself as its path), or `norm(parent(p))` is in `dirs`. These are the
same three tests `onFsChange` applies, so nothing the handler acts on today is dropped.

- `norm` must agree exactly with `normPath` in `src/store.ts` (about line 97): backslashes to
  `/`, lowercase, trailing slashes stripped. `parent` must agree with the store's string rule
  (`p.replace(/[\\/][^\\/]*$/, "")`), applied to the string, not via `Path::parent`, so the two
  sides cannot diverge on prefixes such as `\\?\`. A mismatch here silently drops real events
  (the class of bug fixed in issue A.28), so both functions get unit tests on the cases below.
- Cases: mixed case; `\` and `/`; a trailing separator; a drive root (`V:\` normalizes to
  `v:`, and the parent of `V:\foo` normalizes to `v:`); a UNC path; a path with spaces;
  non-ASCII letters (Rust `to_lowercase` and JS `toLowerCase` agree on ordinary letters; note
  the residual difference in a comment rather than engineering around it).

**Batching.** Both watchers (`watch_workspace` and `watch_extra_files`) push passing paths into
one shared pending set. A flush emits one `fs-change` with the deduplicated paths at most every
250 ms, and only when the set is non-empty. No thread wakes while nothing is pending (for
example, the first push of an empty set starts a 250 ms timer; the flush clears it).

**Nested roots.** Before arming, drop any root lying under another root (case-insensitive, on a
separator boundary, so `V:\dev\aggregate-api` is not "under" `V:\dev\aggregate`). The outer
watch already covers it. `watchedRoots` in the store keeps the full list, so
`syncExtraWatch`'s coverage test is unchanged.

**Per-root failures.** Arm each root independently; collect the failures; return them (root and
error) instead of aborting. `applyWatch` shows them on the error bar, listing each root, and the
remaining roots stay watched.

**Project file.** If verification confirms the gap under "Also found", include `projectFile` in
`syncExtraWatch`'s list whenever no watched root covers it.

**Rejected alternatives.**

- An exclusion list by folder name (`.git`, `target`, `node_modules`, …): never complete with a
  drive as a root (AppData, Temp, browser caches, Windows logs). Membership in the visible set
  is exact.
- A non-recursive watch per listed folder: fewer events even at the OS level, but it holds an
  open directory handle on every listed folder, which on Windows can block renaming or deleting
  those folders from Explorer. One recursive watch per outermost root keeps today's handle
  count.
- Keeping the tree marks with `--no-optional-locks` and a single-flight sweep: ends the loop,
  but still runs a git sweep over the roots on every relevant change. Ruled out by the author.

**What remains proportional to the roots.** Rust still receives every OS event under a root and
discards it with a hash lookup: near zero when idle, small during a heavy build. On-demand walks
are untouched (see Out of scope).

## 3. [tidy] Replace the NUL byte in `src/App.tsx`

Line 193: replace the literal U+0000 inside the string with the escape `"\0"`. The runtime
string is identical, so session keys already on disk still match. Then check the rest of the
sources for raw control characters:
`git ls-files src src-tauri/src | xargs grep -laP "[\x00-\x08\x0B\x0C\x0E-\x1F]"`, and fix any
other hit the same way.

---

## Acceptance

**Gates** (as in Batch J): `npm run build`; `cargo test` with the working directory
`src-tauri/` (never `--manifest-path` from the repo root); `npx madge --circular --extensions
ts,tsx src/main.tsx`; and the headless smoke-boot of `dist/` before handover (serve with
`npx vite preview`, load with `msedge --headless=new --enable-logging=stderr --dump-dom <url>`,
check for `Uncaught` and a non-trivial DOM).

**Rust unit tests:** `norm` and `parent` parity on the cases listed in [watcher]; the filter
passes a file in a listed folder, a listed folder itself and an open tab, and drops a file
inside `.git`, a file in an unlisted folder and a file under `target`; nested-root reduction,
including the `aggregate` / `aggregate-api` boundary case; batch deduplication.

**Live checks** (author, release build):

1. Add `V:\`, `D:\` and `C:\` to AGGREGATE as folders. Idle 60 s while another session
   builds: `writedown.exe` averages under 1% of a core and starts no `git.exe` children.
2. Double-clicking a file in the tree opens and previews it at once.
3. An outside edit to an open, unmodified file reloads it within about half a second; to a
   modified file, flags a conflict.
4. Creating and deleting a file from Explorer in an expanded folder updates the tree within
   about half a second, including in a folder under a nested root.
5. Renaming an expanded folder from Explorer succeeds.
6. A root on a drive letter that does not exist produces an error that includes that root's path; the other
   roots still respond to changes.
7. Editing the open project's `.wdproj` in another editor reloads the project.
8. Gutter marks and **Diff: When Did This Line Change** still work; the palette has no
   **Git: Tree Marks** commands; a `config.toml` still containing `tree_marks = true` loads
   cleanly.
9. A ripgrep search for `fs-change` finds `src/App.tsx`.

## CHANGELOG sketch

- **Removed:** git tree marks (file tints, folder dots, **Git: Tree Marks On / Off**,
  `[git] tree_marks`); the setting is ignored if present.
- **Changed:** file watching delivers only changes to listed folders, open files and the
  project file, batched; idle cost no longer depends on the size of the project's roots.
- **Fixed:** an endless `git status` loop that kept a core busy and took `index.lock` in
  repositories other processes were committing to.
- **Fixed:** one unwatchable root no longer disables file watching for the whole project; the
  failure is reported. (Plus the project-file watch, if confirmed.)

## Out of scope

- **On-demand walks still scale with the roots.** Ctrl+P (`list_all_files`) and Version
  History Stats / Prune (`walk_files`) walk every root when invoked, capped at 50,000 files and
  skipping `node_modules`, `target`, `.git`, `__pycache__` and `.venv`. With `C:\` as a root,
  Ctrl+P will be slow and its list truncated. A persistent file index would fix that; separate
  plan if wanted. Find in Files is `rg`, already capped and timed out.
- Upgrading `notify`, or detecting buffer overflow (see "Also found").

## Execution log

Executed 2026-10-28 as **2.32.0**, from 2.31.1, one commit. Review found every named file,
symbol and snippet as described; no blockers.

**Divergences**

- **[git] acceptance grep.** The plan's `git grep -i` pattern also matches code this plan keeps:
  `gitMarksField` and `setGitMarks` in `src/editor/gitGutter.ts` (gutter marks), and a comment in
  `src/editor/prose.ts` about the Lezer tree. The check is run case-sensitively without
  `gitMarks` loose, as `git grep -n -E "tree_marks|Tree Marks|gitMarks\b|gitDirMarks|gitTreeOverride|git_status|refreshGitStatus"`.
  Remaining hits: `src-tauri/src/config.rs` (the note that a leftover `tree_marks` key is ignored,
  and a test asserting the default template no longer has it) and `writedown-issues.md` (history).
- **[git] `.tree-row.active .tree-name { color: inherit }`** was deleted with the block: `.tree-name`
  sets no color of its own, so the rule existed only to beat the git tints.
- **[git] config test.** `default_config_is_valid_toml_and_honest` now asserts `[git]` has
  `gutter_marks` and no `tree_marks`. A `config.toml` still holding `tree_marks` loads cleanly by
  construction: `load_editor_settings` reads keys by name from a `toml::Value` and never
  enumerates them, so an unknown key is never seen.
- **[watcher] failed roots leave `watchedRoots`.** The plan keeps the full list there for nested
  roots (still true: a nested root is covered by its outer root). A root that failed to arm watches
  nothing, so `applyWatch` removes it from `watchedRoots` when the reply arrives and re-runs
  `syncExtraWatch`; open files under it then get their own watch, per issue B.03's rule that
  `watchedRoots` describes what is actually armed. A generation counter ignores a reply for a
  superseded set of roots.
- **[watcher] project file confirmed unwatched**, and fixed as planned: `syncExtraWatch` adds
  `projectFile` when no watched root covers it, and a store subscription re-runs `syncExtraWatch`
  whenever `projectFile` changes (save as, rename, close). Watching it exposed our own writes:
  `persistProject` (add or remove a folder, edit a label) and an in-place
  **Save / Rename Project** wrote the file without `markJustSaved`, so each would have come back as
  an outside edit and reloaded the project. Both now mark the file first.
- **[watcher] tree-refresh debounce 400 ms → 150 ms** in `onFsChange`. Downstream of a 250 ms
  periodic batch, a 400 ms trailing debounce is reset by every batch, so sustained activity in a
  listed folder (a build writing into an expanded folder) would have held the tree stale until the
  activity stopped. 150 ms flushes between batches; the tree updates within about 400 ms of a
  change. The project-reload debounce stays at 400 ms (a `.wdproj` is never written continuously).
- **[watcher] File Watch Status** (`showWatchStatus`) adds the project file's coverage and a line
  saying how many listed folders the interest set holds.
- **[tidy] two more NULs.** The control-character scan found the same literal NUL key separator in
  `src/preview/codeHighlight.ts` (line 44) and `src/preview/renderCore.ts` (line 155), both now
  `"\0"`. Same runtime strings, so the preview caches behave as before. The scan is clean afterward.
- **[watcher] `norm` and `parent` parity** was checked by running the store's two rules in node on
  every Rust test input; all outputs match the Rust expectations.
- **HELP.md and README.md watching passages unchanged.** "Changes inside a watched project folder
  appear by themselves" stays true for the user: a folder never listed is listed fresh when it is
  expanded.

**Gates (2026-10-28, all green)**

- `npm run build`: tsc and vite, built.
- `cargo test` (cwd `src-tauri/`): 89 passed, 0 failed, 15 ignored (opt-in); no warnings. New:
  `watch::tests::{norm_and_parent_match_the_store, filter_keeps_the_visible_set_and_drops_the_rest,
  nested_roots_reduce_to_the_outermost, batch_deduplicates_and_arms_once}`; removed:
  `git::tests::porcelain_codes_map_to_states`.
- `npx madge --circular --extensions ts,tsx src/main.tsx`: no circular dependency.
- Headless smoke-boot of `dist/` in Edge: the plain boot stops at the expected `getCurrentWindow()`
  ErrorBoundary (modules initialize); a boot with a stub Tauri runtime renders the full layout with
  the status bar, and the console holds only "no backend" rejections.
- `rg -l fs-change src` finds `src/App.tsx` (live check 9).

**Left for the author:** live checks 1 to 8 on a release build.
