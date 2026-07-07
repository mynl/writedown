import { useEffect, useMemo, useRef, useState } from "react";
import { listAllFiles, type FileItem } from "./api";
import { appCommands, type Command } from "./commands";
import { fuzzyRank, type Ranked } from "./fuzzy";
import { useStore } from "./store";

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

export function Palette() {
  const mode = useStore((s) => s.palette);
  const root = useStore((s) => s.root);
  const projFolders = useStore((s) => s.projFolders);
  const closePalette = useStore((s) => s.closePalette);
  const openFile = useStore((s) => s.openFile);

  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sel, setSel] = useState(0);
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
  }, [mode, root, projFolders]);

  const commands = useMemo(() => (mode === "commands" ? appCommands() : []), [mode]);

  const results = useMemo<Ranked<FileItem | Command>[]>(() => {
    if (mode === "files") return fuzzyRank(query, files, (f) => f.rel);
    if (mode === "commands") return fuzzyRank(query, commands, (c) => c.title);
    return [];
  }, [mode, query, files, commands]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [sel, results]);

  if (!mode) return null;

  function choose(i: number) {
    const r = results[i];
    if (r) {
      if (mode === "files") void openFile((r.item as FileItem).path, false);
      else (r.item as Command).run();
    }
    closePalette();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(sel);
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={() => closePalette()}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={mode === "files" ? "Go to file…" : "Run a command…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {results.map((r, i) => {
            const label =
              mode === "files" ? (r.item as FileItem).rel : (r.item as Command).title;
            const id = mode === "files" ? (r.item as FileItem).path : (r.item as Command).id;
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
          {results.length === 0 && <div className="palette-empty">No matches</div>}
        </div>
      </div>
    </div>
  );
}
