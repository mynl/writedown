# Plan: 2026-07-16 issues batch (writedown-issues.md items 1–13, minus 6)

Author approved 2026-07-16 ("good to go on this group"). Item 6 (tab completion)
is PEND — no implementation. Annotated diagnoses live in `writedown-issues.md`.

Author riders:
- (1) Use **Alt+T** for transpose-words (not Esc T).
- (4)/(5)/(8) persistence is **project-level** when a project is open, else the
  default (folder/global) session — same home as the other per-project state.
- (9) Seed snippets: begin/end **aligned** env + **python** code block.

Order (quick kills first; one release = one commit = one CHANGELOG section):

1. **1.73.3** (fix) — item 10: runner.py stdin decodes cp1252 on Windows →
   `sys.stdin.reconfigure(encoding="utf-8", errors="replace")`. Needs a backend
   rebuild to take effect (runner is `include_str!`-embedded).
2. **1.74.0** — item 13: palette Copy File Path / Copy File Name
   (`navigator.clipboard.writeText`).
3. **1.75.0** — item 1: keybindings — Ctrl+Shift+A line start, Ctrl+E line end,
   Ctrl+K Ctrl+T title case, Ctrl+T transpose chars, Alt+T transpose words.
   Registry entries so `[keys]` remap + F1 work.
4. **1.75.1** (fix) — item 7: tight list continuation on Enter (no blank line in
   loose lists). Custom command, yields to completion popup + non-list lines.
5. **1.76.0** — items 4+5: show/hide sidebar (Ctrl+K Ctrl+B) and outline
   (Ctrl+K Ctrl+O); palette Show/Hide verbs; persisted per-project session.
6. **1.76.1** (fix) — item 2: Open Files preview-row italic inflates font/line
   box (same disease the tabs had) — pin size/line-height.
7. **1.77.0** — item 8: per-tab cursor + scroll memory; restore on tab switch;
   persist per-project session; check save→watcher echo reload.
8. **1.78.0** — item 3: drag-reorder Open Files rows (vertical transplant of
   the Tabs.tsx pointer drag; same moveTab).
9. **1.78.1** (fix) — item 11: personal dictionary matches inflected forms
   (strip s/es/'s → base lookup).
10. **1.79.0** — item 9: `[snippets]` config system + palette "Insert: …"
    entries; defaults: aligned env, python cell.
11. **1.80.0** — item 12: decl/agg StreamLanguage port of decl_pygments.py;
    `.agg/.dec/.decl` files + fences in editor and preview.

Perf guardrail: nothing here may add per-keystroke work; all new work hangs off
explicit actions (palette, Tab/Enter keys, tab switch) or render-time caches.
