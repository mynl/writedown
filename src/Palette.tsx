import { useEffect, useMemo, useRef, useState } from "react";
import { listAllFiles, type FileItem } from "./api";
import { appCommands, type Command } from "./commands";
import { fuzzyMatch, fuzzyRank, type Ranked } from "./fuzzy";
import { mergedProjects, useStore, type PaletteMode } from "./store";
import { getActiveView } from "./editor/editorView";
import { keyForAction } from "./editor/keymap";
import {
  applyUserSymbols,
  codePointLabel,
  loadSymbols,
  mruRank,
  recentSymbols,
  recordSymbolUse,
  searchSymbols,
  symbolMru,
  type SymbolEntry,
} from "./editor/symbols";

type ProjItem = { name: string; path: string };
/** A kit heading in the symbol list — a label, not something you can choose. */
type KitHeading = { heading: string };
type PaletteItem = FileItem | Command | ProjItem | SymbolEntry | KitHeading;

const isSymbol = (i: PaletteItem): i is SymbolEntry => "char" in i;
const isHeading = (i: PaletteItem): i is KitHeading => "heading" in i;

const PLACEHOLDER: Record<NonNullable<PaletteMode>, string> = {
  files: "Go to file…",
  quickfiles: "Open a quick file…",
  projects: "Switch project…",
  commands: "Run a command…",
  symbols: "Search characters — name, \\latex, emoji keyword, or u+2299…",
};

// Most-recently-used command ordering (ST behaviour): with an empty query the last-run
// commands float to the top, selection on the most recent — so Ctrl+Shift+P, Enter
// reruns the previous command. Typed queries stay pure fuzzy rank. localStorage so it
// survives restarts; unknown ids (e.g. a removed config snippet) simply rank nowhere.
const MRU_KEY = "wd.commandMru";
const MRU_MAX = 50;
function loadCommandMru(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MRU_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function recordCommandUse(id: string) {
  const m = [id, ...loadCommandMru().filter((x) => x !== id)].slice(0, MRU_MAX);
  localStorage.setItem(MRU_KEY, JSON.stringify(m));
}

function Highlight({ text, positions }: { text: string; positions: number[] }) {
  const hit = new Set(positions);
  return (
    <>
      {[...text].map((ch, i) =>
        hit.has(i) ? (
          <b key={i} className="hl">
            {ch}
          </b>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

/** Symbol results: recents then kits when the query is empty, ranked matches otherwise.
 *  Split out of the component so the empty-query browsing view stays readable. */
function symbolResults(
  query: string,
  data: { entries: SymbolEntry[]; kits: [string, SymbolEntry[]][] } | null,
  recentChars: number,
): Ranked<PaletteItem>[] {
  if (!data) return []; // table still loading — one frame, on first open only
  const row = (item: PaletteItem) => ({ item, positions: [], score: 0 });
  const out: Ranked<PaletteItem>[] = [];
  void recentChars; // recorded uses change this list; the dep is what re-runs the memo

  if (query.trim() !== "") {
    // Search recents FIRST, then everything else below. The character you want is very
    // often one you have used before, and burying it 30 rows down in the full table — with
    // "heavy white right" visible in Recent a moment earlier — is the wrong answer.
    const mru = symbolMru();
    // Rank the WHOLE table, then split; the cap applies to the "all characters" group
    // only. Capping before the split (2.14.2) dropped a recent character ranked past
    // the cap for a broad query like "arrow" — exactly the character recents exist for.
    // Display positions come from a second match against the NAME alone: ranking runs
    // over name+alias+latex, whose indices do not map onto what is drawn (issue G.01).
    const ranked = searchSymbols(query, data.entries, Infinity).map((r) => ({
      ...r,
      positions: fuzzyMatch(query, r.item.name)?.positions ?? [],
    }));
    const recent = ranked
      .filter((r) => mruRank(r.item.char, mru) >= 0)
      .sort((a, b) => mruRank(a.item.char, mru) - mruRank(b.item.char, mru));
    const rest = ranked.filter((r) => mruRank(r.item.char, mru) < 0).slice(0, 60);
    // Headings only when the split is real — one group alone needs no explaining.
    if (recent.length && rest.length) {
      return [row({ heading: "Recent" }), ...recent, row({ heading: "All characters" }), ...rest];
    }
    return [...recent, ...rest];
  }

  const recent = recentSymbols(data.entries);
  if (recent.length) {
    out.push(row({ heading: "Recent" }), ...recent.map(row));
  }
  for (const [title, entries] of data.kits) {
    if (entries.length) out.push(row({ heading: title }), ...entries.map(row));
  }
  return out;
}

export function Palette() {
  const mode = useStore((s) => s.palette);
  const root = useStore((s) => s.root);
  const projFolders = useStore((s) => s.projFolders);
  const projects = useStore((s) => s.projects);
  const recents = useStore((s) => s.recentProjects);
  const closePalette = useStore((s) => s.closePalette);
  const openFile = useStore((s) => s.openFile);

  const editorSettings = useStore((s) => s.editorSettings);

  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sel, setSel] = useState(0);
  // The 86 KB symbol table is imported dynamically on first open and never again, so
  // nothing about D.12 costs anything until Ctrl+Shift+U is pressed.
  const [symbols, setSymbols] = useState<{
    entries: SymbolEntry[];
    kits: [string, SymbolEntry[]][];
  } | null>(null);
  // Bumped by Alt+Enter (insert and stay open) so the Recent row re-ranks live.
  const [recentChars, setRecentChars] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Last pointer position seen by a row's mousemove — see hover() below.
  const lastMouse = useRef({ x: -1, y: -1 });

  useEffect(() => {
    setQuery("");
    setSel(0);
    inputRef.current?.focus();
    // Quick-open spans every project folder (one pool), or the single root.
    const roots = projFolders.length > 0 ? projFolders : root ? [root] : [];
    if (mode === "files" && roots.length > 0) {
      Promise.all(
        roots.map((r) =>
          listAllFiles(r)
            .then((fs) =>
              roots.length > 1
                ? fs.map((f) => ({
                    ...f,
                    rel: `${r.replace(/[\\/]+$/, "").split(/[\\/]/).pop()}/${f.rel}`,
                  }))
                : fs,
            )
            .catch(() => [] as FileItem[]),
        ),
      ).then((all) => setFiles(all.flat()));
    }
    // Refresh the project lists so a just-created/renamed project shows immediately.
    if (mode === "projects") {
      void useStore.getState().loadProjects();
      void useStore.getState().loadRecentProjects();
    }
    if (mode === "symbols") {
      // Reverse lookup (issue D.12): with exactly one character selected, open on its
      // identity — name, code point and LaTeX name — so "what is this, and what is the
      // hollow version of it?" is one keypress. That question has no other answer here.
      const view = getActiveView();
      const s = view?.state.selection.main;
      if (view && s && !s.empty) {
        const text = view.state.sliceDoc(s.from, s.to);
        if ([...text].length === 1) {
          setQuery("u+" + (text.codePointAt(0) ?? 0).toString(16).toUpperCase());
        }
      }
      void loadSymbols().then(({ entries, kits }) =>
        setSymbols({
          entries: applyUserSymbols(entries, useStore.getState().editorSettings?.symbols),
          kits,
        }),
      );
    }
  }, [mode, root, projFolders]);

  const commands = useMemo(() => (mode === "commands" ? appCommands() : []), [mode]);
  // Live key hints (issue G.05): a verb backed by a registry action shows whatever key
  // the merged keymap currently binds to it, so a `[keys]` rebind updates the palette.
  const keyHints = useMemo(
    () => (mode === "commands" ? keyForAction(editorSettings?.keys) : null),
    [mode, editorSettings],
  );
  const projectItems = useMemo<ProjItem[]>(
    () => (mode === "projects" ? mergedProjects(useStore.getState()) : []),
    [mode, projects, recents],
  );

  // `[files] quick_files` (issue D.04): the config list, in config order — that IS the
  // preference order, so no MRU float. Both the name and the folder are searchable.
  const quickFiles = useMemo<FileItem[]>(() => {
    if (mode !== "quickfiles") return [];
    return (editorSettings?.quick_files ?? []).map((p) => ({
      name: p.split(/[\\/]/).pop() ?? p,
      path: p,
      rel: p,
    }));
  }, [mode, editorSettings]);

  const results = useMemo<Ranked<PaletteItem>[]>(() => {
    if (mode === "symbols") return symbolResults(query, symbols, recentChars);
    if (mode === "files") return fuzzyRank(query, files, (f) => f.rel);
    if (mode === "quickfiles") {
      if (query === "") return quickFiles.map((f) => ({ item: f, positions: [], score: 0 }));
      return fuzzyRank(query, quickFiles, (f) => f.rel);
    }
    if (mode === "commands") {
      if (query === "") {
        const rank = new Map(loadCommandMru().map((id, i) => [id, i]));
        return [...commands]
          .sort(
            (a, b) =>
              (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
              (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          ) // stable: never-used commands keep registration order below the MRU block
          .map((c) => ({ item: c, positions: [], score: 0 }));
      }
      return fuzzyRank(query, commands, (c) => c.title);
    }
    if (mode === "projects") return fuzzyRank(query, projectItems, (p) => p.name);
    return [];
  }, [mode, query, commands, files, projectItems, quickFiles, symbols, recentChars]);

  // Anchor the selection on the first CHOOSABLE row whenever the results change — a new
  // query, the symbol table arriving, an Alt+Enter re-rank. The symbol list can start
  // with a "Recent" heading, which is not selectable: index 0 there meant no row was
  // highlighted and Enter did nothing. ONE effect, deliberately: 2.14.2 paired this with
  // a second `setSel(0)` keyed on the query, which ran after it and put the selection
  // back on the heading on every keystroke — the fix only ever worked for the empty
  // query (issue G.01).
  useEffect(() => {
    const first = results.findIndex((r) => !isHeading(r.item));
    setSel(Math.max(first, 0));
  }, [results]);
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector(".palette-item.active");
    if (!list || !el) return;
    el.scrollIntoView({ block: "nearest" });
    // First row of a group: keep its heading in view as well, or "Recent" is never seen
    // when arrowing onto the character directly under it.
    const prev = el.previousElementSibling;
    if (prev?.classList.contains("palette-heading")) {
      const gap = list.getBoundingClientRect().top - prev.getBoundingClientRect().top;
      if (gap > 0) list.scrollTop -= gap;
    }
  }, [sel, results]);

  if (!mode) return null;

  /** Insert text at the cursor and remember the character (issue D.12). `stay` keeps the
   *  picker open for a run of several — ✅ then ❌ then ⚠ — instead of four keystrokes each. */
  function insertSymbol(entry: SymbolEntry, what: "char" | "latex", stay: boolean) {
    const view = getActiveView();
    if (!view) return;
    const text = what === "latex" && entry.latex.length ? "\\" + entry.latex[0] : entry.char;
    view.dispatch(view.state.replaceSelection(text));
    recordSymbolUse(entry.char);
    if (stay) setRecentChars((n) => n + 1);
    else {
      closePalette();
      view.focus(); // the palette input held focus; hand it back with the caret live
    }
  }

  function choose(i: number, opts?: { latex?: boolean; stay?: boolean }) {
    const r = results[i];
    if (!r) {
      closePalette();
      return;
    }
    if (isHeading(r.item)) return; // a kit label: not selectable, and Enter must not close
    if (mode === "symbols") {
      insertSymbol(r.item as SymbolEntry, opts?.latex ? "latex" : "char", !!opts?.stay);
      return;
    }
    if (mode === "files" || mode === "quickfiles") {
      void openFile((r.item as FileItem).path, false);
    } else if (mode === "projects") {
      void useStore.getState().openProject((r.item as ProjItem).path);
    } else {
      recordCommandUse((r.item as Command).id);
      (r.item as Command).run();
      // A verb that opens ANOTHER palette mode — "Quick Files: Open from List…",
      // "Insert: Unicode Character…", "Project: Quick Switch…" — must not then be closed by
      // the palette that ran it. The unconditional `closePalette()` here wiped the mode the
      // command had just set, one tick after setting it, so those verbs appeared to do
      // nothing at all. Close only if the command left the palette where it found it.
      if (useStore.getState().palette !== mode) return;
    }
    closePalette();
  }

  /** Skip kit headings when arrowing through the symbol list. */
  function step(from: number, dir: 1 | -1): number {
    let i = from + dir;
    while (i >= 0 && i < results.length && isHeading(results[i].item)) i += dir;
    if (i < 0 || i >= results.length) return from;
    return i;
  }
  /** `n` steps in `dir`, stopping at the end of the list. */
  function stepMany(from: number, dir: 1 | -1, n: number): number {
    let i = from;
    for (let k = 0; k < n; k++) {
      const next = step(i, dir);
      if (next === i) break;
      i = next;
    }
    return i;
  }
  /** Rows per page for PageUp/PageDown: the list's height over one row's, less one. */
  function pageSize(): number {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(".palette-item");
    if (!list || !row || row.offsetHeight === 0) return 10;
    return Math.max(1, Math.floor(list.clientHeight / row.offsetHeight) - 1);
  }
  function lastChoosable(): number {
    for (let i = results.length - 1; i >= 0; i--) if (!isHeading(results[i].item)) return i;
    return 0;
  }

  /** Select-on-hover, but only for a REAL pointer movement. Arrowing scrolls the list
   *  under a stationary mouse, Chromium then fires a synthetic mousemove for the row now
   *  beneath it, and the selection snapped straight back — "the arrows do not work"
   *  (issue G.11). Unchanged coordinates mean the list moved, not the mouse. */
  function hover(i: number, e: React.MouseEvent) {
    if (e.clientX === lastMouse.current.x && e.clientY === lastMouse.current.y) return;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setSel(i);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      if (mode === "symbols") getActiveView()?.focus(); // nothing inserted, caret restored
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => step(s, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => step(s, -1));
    } else if (e.key === "PageDown") {
      e.preventDefault();
      const n = pageSize();
      setSel((s) => stepMany(s, 1, n));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      const n = pageSize();
      setSel((s) => stepMany(s, -1, n));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSel(Math.max(0, results.findIndex((r) => !isHeading(r.item))));
    } else if (e.key === "End") {
      e.preventDefault();
      setSel(lastChoosable());
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Symbols only: Shift+Enter inserts the LaTeX command instead of the glyph (in a
      // .qmd with math you sometimes want `\odot`, not ⊙), Alt+Enter inserts and stays.
      choose(sel, { latex: e.shiftKey, stay: e.altKey });
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={() => closePalette()}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={PLACEHOLDER[mode]}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {results.map((r, i) => {
            if (isHeading(r.item)) {
              return (
                <div key={"h:" + r.item.heading} className="palette-heading">
                  {r.item.heading}
                </div>
              );
            }
            if (isSymbol(r.item)) {
              const e = r.item;
              return (
                <div
                  key={"s:" + e.char + e.name}
                  className={"palette-item palette-symbol" + (i === sel ? " active" : "")}
                  onMouseMove={(ev) => hover(i, ev)}
                  onClick={() => choose(i)}
                >
                  {/* Own font stack, not the editor's coding face: a monospace programming
                      font has no glyph for a third of this table and would draw tofu. The
                      emoji class picks the COLOR font, so ✅ looks in the picker the way it
                      will look in the document — see App.css for why the order matters. */}
                  <span className={"symbol-glyph" + (e.emoji ? " is-emoji" : "")}>{e.char}</span>
                  <span className="symbol-text">
                    <span className="symbol-name">
                      <Highlight text={e.name} positions={r.positions} />
                    </span>
                    <span className="symbol-meta">
                      {e.latex.map((l) => "\\" + l).join("  ")}
                      {e.latex.length ? " · " : ""}
                      {codePointLabel(e)}
                      {e.emoji ? " · color emoji" : ""}
                    </span>
                  </span>
                </div>
              );
            }
            const label =
              mode === "files" || mode === "quickfiles"
                ? (r.item as FileItem).rel
                : mode === "projects"
                  ? (r.item as ProjItem).name
                  : (r.item as Command).title;
            const id =
              mode === "files" || mode === "quickfiles"
                ? (r.item as FileItem).path
                : mode === "projects"
                  ? (r.item as ProjItem).path
                  : (r.item as Command).id;
            const cmd = mode === "commands" ? (r.item as Command) : null;
            const hint = cmd?.key ?? (cmd?.action ? keyHints?.get(cmd.action) : undefined);
            return (
              <div
                key={id}
                className={"palette-item" + (i === sel ? " active" : "")}
                onMouseMove={(ev) => hover(i, ev)}
                onClick={() => choose(i)}
              >
                <span className="palette-label">
                  <Highlight text={label} positions={r.positions} />
                </span>
                {hint && <span className="palette-key">{hint}</span>}
              </div>
            );
          })}
          {results.length === 0 && (
            <div className="palette-empty">
              {mode === "quickfiles" && (editorSettings?.quick_files ?? []).length === 0
                ? "No quick files — add a quick_files list under [files] in config.toml"
                : "No matches"}
            </div>
          )}
        </div>
        {mode === "symbols" && (
          <div className="palette-hint">
            Enter insert · Shift+Enter insert <code>\name</code> · Alt+Enter insert and stay ·
            try <code>tick</code>, <code>\odot</code>, <code>circle dot</code>, <code>u+2299</code>
          </div>
        )}
      </div>
    </div>
  );
}
