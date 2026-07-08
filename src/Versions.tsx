import { useEffect, useRef, useState } from "react";
import { listBackups, readBackup, type BackupEntry } from "./api";
import { useStore } from "./store";

function stamp(millis: number): string {
  return new Date(millis).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function size(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

// Previous Versions picker (Ctrl+Shift+P → "Previous Versions…"). Lists the backups the
// Rust save path keeps before each overwrite; restoring loads the chosen version into the
// editor as an UNSAVED change, so it's reviewed and saved deliberately — never a silent
// disk write, and the current state gets backed up on the next save.
export function Versions() {
  const path = useStore((s) => s.versionsFor);
  const close = useStore((s) => s.closeVersions);
  const loadContent = useStore((s) => s.loadContent);

  const [entries, setEntries] = useState<BackupEntry[] | null>(null);
  const [sel, setSel] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!path) return;
    setEntries(null);
    setSel(0);
    boxRef.current?.focus();
    listBackups(path)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [path]);

  useEffect(() => {
    listRef.current
      ?.querySelector(".versions-item.active")
      ?.scrollIntoView({ block: "nearest" });
  }, [sel, entries]);

  if (!path) return null;

  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;

  async function restore(i: number) {
    const e = entries?.[i];
    if (!e || !path) return;
    try {
      loadContent(path, await readBackup(path, e.millis));
    } catch {
      /* backup vanished — nothing to restore */
    }
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!entries) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void restore(sel);
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={() => close()}>
      <div
        className="palette"
        ref={boxRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="versions-head">
          Previous versions of <b>{name}</b> — restore loads into the editor as an unsaved
          change to review, then save.
        </div>
        <div className="palette-list" ref={listRef}>
          {entries === null && <div className="palette-empty">Loading…</div>}
          {entries !== null && entries.length === 0 && (
            <div className="palette-empty">
              No previous versions yet. Backups accrue each time a save replaces this file.
            </div>
          )}
          {entries?.map((e, i) => (
            <div
              key={e.millis}
              className={"versions-item" + (i === sel ? " active" : "")}
              onMouseMove={() => setSel(i)}
              onClick={() => void restore(i)}
            >
              <div className="versions-meta">
                <span>{stamp(e.millis)}</span>
                <span className="versions-size">{size(e.size)}</span>
              </div>
              <div className="versions-preview">{e.preview || "(empty)"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
