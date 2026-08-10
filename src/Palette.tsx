import { useEffect, useMemo, useRef, useState } from "react";
import { listAllFiles, type FileItem } from "./api";
import { appCommands, type Command } from "./commands";
import { fuzzyRank, type Ranked } from "./fuzzy";
import { mergedProjects, useStore, type PaletteMode } from "./store";
import { getActiveView } from "./editor/editorView";
import {
  applyUserSymbols,
  codePointLabel,
  isEmojiPresentation,
  loadSymbols,
  recentSymbols,
  recordSymbolUse,
  searchSymbols,
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
  if (query.trim() !== "") return searchSymbols(query, data.entries);
  const row = (item: PaletteItem) => ({ item, positions: [], score: 0 });
  const out: Ranked<PaletteItem>[] = [];
  const recent = recentSymbols(data.entries);
  void recentChars; // recorded uses change this list; the dep is what re-runs the memo
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

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
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
                  onMouseMove={() => setSel(i)}
                  onClick={() => choose(i)}
                >
                  {/* Own font stack, not the editor's coding face: a monospace programming
                      font has no glyph for a third of this table and would draw tofu. */}
                  <span className="symbol-glyph">{e.char}</span>
                  <span className="symbol-text">
                    <span className="symbol-name">{e.name}</span>
                    <span className="symbol-meta">
                      {e.latex.map((l) => "\\" + l).join("  ")}
                      {e.latex.length ? " · " : ""}
                      {codePointLabel(e)}
                      {isEmojiPresentation(e.cp) ? " · color emoji" : ""}
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
            return (
              <div
                key={id}
                className={"palette-item" + (i === sel ? " active" : "")}
                onMouseMove={() => setSel(i)}
                onClick={() => choose(i)}
              >
                <Highlight text={label} positions={r.positions} />
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
