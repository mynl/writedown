# Plan 2.10.1 — Tab no-match fallback shadowed by react-codemirror's `indentWithTab`

Status: DONE (shipped in 2.10.1, 2026-08-03).

## Symptom

Type a 2+ char stem, press Tab, no completion exists → the whole line (a whole wrapped
paragraph under word wrap) indents; no status-bar message. Also, unnoticed until now:
Tab never accepted the highlighted completion — only Enter did. The 2.4.0 fix for
issue A.14 (swallow the failed attempt, show "no completions for …") appeared to have
no effect, and staring at `wordComplete.ts` showed nothing wrong — because nothing
*was* wrong there.

## Root cause

CodeMirror dispatches a key through its bindings in **lexicographic order on
(precedence, position in the extension tree)** — first handler to return true wins.

`@uiw/react-codemirror` has a top-level component prop `indentWithTab` — *not* part of
the `basicSetup` options object where we had switched off `autocompletion` and
`closeBrackets` — and it **defaults to true**. When on, the wrapper injects
`keymap.of([{ key: "Tab", run: indentMore, shift: indentLess }])` into the default
extensions, which are concatenated **ahead of everything in the `extensions` prop**
(`useCodeMirror.ts` line 99 builds defaults, line 104 appends ours).

So the effective plain-Tab order was:

| # | binding | (prec, pos) | no-match outcome |
|---|---------|-------------|------------------|
| 1 | editing keymap (no plain Tab) | (highest, –) | skip |
| 2 | `tabOpenComplete` | (high, app) | declines, returns false |
| 3 | citation `retriggerTab` | (high, app) | declines, returns false |
| 4 | **library `indentWithTab`** | **(default, first)** | **`indentMore` → true. Line indents.** |
| 5 | A.14 fallback (accept / swallow + message) | (default, last) | never reached |

Row 4 strictly dominates row 5: same precedence, earlier position. The 2.4.0 fix
edited a handler that could not run — dead code from 2.4.0 through 2.10.0. Every
observed behavior came from row 4: the indent, the Shift+Tab dedent, and the
Tab-at-line-start indent (which we had wrongly credited to our own fallthrough).

## Fix

One attribute: `indentWithTab={false}` on the `<CodeMirror>` element in `Editor.tsx`.
Row 4 vanishes; the app's fallback now handles the full matrix:

- popup open → Tab **accepts** the highlighted option (new — was Enter-only);
- stem ≥ `tab_complete_stem_min` (default 2), no match → Tab swallowed, status bar
  shows `no completions for "…"` (App.tsx renders `statusMessage` in the left slot);
- line start / after whitespace / non-empty selection → `indentMore` as before;
- Shift+Tab → `indentLess` as before.

Comments recording the trap: at the prop site in `Editor.tsx`, and a REACHABILITY
note on the fallback in `wordComplete.ts`.

## What Opus missed (and how to not miss it next time)

The 2.4.0 fix was reasoned entirely *inside* the app's own keymap stack, where the
logic is airtight. The winning binding lived outside every file the fix touched — a
defaulted-on prop of the wrapper library. Two takeaways:

1. **A handler's correctness says nothing about its reachability.** When a keymap fix
   changes nothing observable, stop re-reading the handler and enumerate every binding
   for that key across the *resolved* extension tree — including what the wrapper
   injects (`getDefaultExtensions.ts`: `indentWithTab`, `basicSetup`, theme) — then
   sort by (precedence, position) and find who actually wins.
2. **The absent status message was the load-bearing clue.** The fallback had two
   independent effects: suppress the indent *and* post a message. "Line still indents"
   could be mis-wired logic; "message never appears at all" says the handler never
   executes. Distinguishing "runs but wrong" from "never runs" up front halves the
   search space.

## Verification

- `npx tsc --noEmit` clean; live-checked via the running dev server (HMR).
- Manual: no-match Tab swallowed + message; match Tab opens popup; second Tab accepts;
  line-start Tab indents; Shift+Tab dedents.
