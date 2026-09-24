# Plan 2.18.0 — Batch H

Status: **proposed 2026-09-01, not approved, nothing built.** Source: `writedown-issues.md`,
Batch H (2026-08-31). Two small items, one version bump, one commit, frontend only.

This plan stands alone: per item, the goal, what happens today, the change, the files, and
the acceptance check.

## Shape of the batch

| Version | Scope | Rust? |
|---|---|---|
| **2.18.0** | [stamp-space] [project-button] | No |

---

## [stamp-space] H.01 — Insert Date / Date-Time swallows the preceding space

**Goal.** `Meeting ` + Insert Date gives `Meeting 2026-09-01`, never `Meeting2026-09-01`.

**Today.** Both stamp verbs run through `insertStamp` in `src/editor/textOps.ts`, which is a
plain `replaceSelection` — it deletes nothing. The space is lost *before* the verb runs:
opening the command palette blurs the editor, `saveOnBlur` (`src/editor/Editor.tsx`) autosaves,
and the save applies `[editor] trim_trailing_whitespace` (`src/store.ts`, `saveDoc`), which
deletes the space you just typed at the end of the line. The stamp then lands flush against
the word. The trim is correct and stays; the verb must not assume the space survived.

**Change.** In `insertStamp`, per selection range: if the range does not start at the
beginning of its line and the character before it is not whitespace, prepend a single space
to the stamp. Nothing is added at line start, after an existing space or tab, or after a
selection that is being replaced (the text before the selection is what is tested). No
trailing space is added — the caret sits after the stamp as it does today.

**Files.** `src/editor/textOps.ts` only. Both palette verbs (`src/commands.ts`
`stampCommand`) and the keymap command `insertDateTime` share `insertStamp`, so one change
covers every path.

**Accept.** (1) Type `Meeting ` at line end, palette → Insert Date: one space between the
word and the date. (2) Cursor at line start: no leading space. (3) `Meeting  ` (already two
spaces, trim off): no third space. (4) Multi-cursor: each cursor judged independently.
(5) `trim_trailing_whitespace = "off"` still gives exactly one space.

---

## [project-button] H.02 — Open the project file from the Project panel footer

**Goal.** A one-character 📂 button to the right of the project dropdown that opens the
current `.wdproj` file in the editor — the same thing the palette verb "Project: Edit Project
File (.wdproj)" does — because it is edited often and the palette is the long way round.

**Today.** The footer of the Project panel (`src/App.tsx`, `.pane-footer`) holds only the
`.proj-switch` `<select>`, width 100%. The verb exists (`src/commands.ts` `proj-open-file`)
and is palette-only.

**Change.**
- `src/App.tsx`: the footer becomes a flex row: the `<select>` (`flex: 1`) followed by a
  `<button className="proj-edit" title="Edit project file (.wdproj)">📂</button>`. It calls
  `openFile(projectFile, false)` — the same call as the verb, not a copy of its logic (the
  no-project error branch is not reachable because the button is disabled without a project).
  Disabled when `projectFile` is null (a folder open without a project), matching the
  "no button that changes meaning with state" rule: one button, one verb, greyed when it
  cannot act.
- `src/App.css`: `.pane-footer { display: flex; gap: 4px; }`, `.proj-switch { flex: 1; min-width: 0 }`
  (replacing `width: 100%`), `.proj-edit` styled like the existing `.view-toggle` / panel
  buttons: same border, radius, font size and theme colors as `.proj-switch`, fixed width so
  the emoji does not stretch the row.
- `HELP.md`: one line under the Project panel section naming the button.

**Files.** `src/App.tsx`, `src/App.css`, `HELP.md`.

**Accept.** (1) Project open: 📂 sits right of the dropdown arrow, same height; click opens
the `.wdproj` in a tab with editor focus. (2) Folder open, no project: button greyed, click
does nothing. (3) Light and dark themes: button matches the dropdown. (4) Narrow panel: the
dropdown shrinks, the button does not wrap to a second line.

---

## Bump

`src-tauri/Cargo.toml` → 2.18.0; CHANGELOG entry (Added: project-file button; Fixed: stamp
spacing); one commit `2.18.0 space before inserted date stamps; open-project-file button`.
