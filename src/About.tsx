// About dialog (palette: "About Writedown"). Reuses the Help modal shell. Nothing here
// is hand-synced: the app version comes from tauri.conf.json at runtime, dependency
// versions from package.json at build time, so the dialog can never drift from reality.
import { useEffect, useState } from "react";
import { version as reactVersion } from "react";
import { getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { useStore } from "./store";
import pkg from "../package.json";

const DEPS: [string, string][] = Object.entries(pkg.dependencies).map(([name, ver]) => [
  name,
  String(ver).replace(/^[\^~]/, ""),
]);

const dep = (name: string) => DEPS.find(([n]) => n === name)?.[1] ?? "?";

/** The load-bearing pipeline pieces, surfaced above the full list. */
const CORE: [string, string][] = [
  ["CodeMirror (editor)", dep("@codemirror/view")],
  ["markdown-it (preview)", dep("markdown-it")],
  ["KaTeX (math)", dep("katex")],
  ["mermaid (diagrams)", dep("mermaid")],
  ["DOMPurify (preview sanitizer)", dep("dompurify")],
  ["React", reactVersion],
];

/** Rust backend crates, by name only — there is no runtime version source for them,
 *  and a hand-synced number would rot. */
const RUST_CRATES =
  "tauri · serde · toml · json5 · notify (file watch) · regex · " +
  "rustpython-parser (cell checks) · spellbook (spelling) · trash (recycle bin)";

export function About() {
  const open = useStore((s) => s.aboutOpen);
  const toggleAbout = useStore((s) => s.toggleAbout);
  const [appVer, setAppVer] = useState("");
  const [tauriVer, setTauriVer] = useState("");

  useEffect(() => {
    if (!open) return;
    getVersion().then(setAppVer).catch(() => setAppVer("?"));
    getTauriVersion().then(setTauriVer).catch(() => setTauriVer("?"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggleAbout();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggleAbout]);

  if (!open) return null;

  const webview = navigator.userAgent.match(/Edg\/([\d.]+)/)?.[1] ?? "?";

  return (
    <div className="palette-backdrop" onMouseDown={() => toggleAbout()}>
      <div className="help about" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span>About Writedown</span>
          <button className="help-close" title="Close (Esc)" onClick={() => toggleAbout()}>
            ×
          </button>
        </div>
        <div className="about-body">
          <div className="about-version">Writedown v{appVer}</div>
          <div className="about-platform">
            Tauri {tauriVer} · WebView2 {webview}
          </div>
          <div className="about-cat">Core components</div>
          {CORE.map(([name, ver]) => (
            <div key={name} className="about-row about-core">
              <span>{name}</span>
              <span className="about-ver">{ver}</span>
            </div>
          ))}
          <div className="about-cat">All frontend dependencies</div>
          {DEPS.map(([name, ver]) => (
            <div key={name} className="about-row">
              <span>{name}</span>
              <span className="about-ver">{ver}</span>
            </div>
          ))}
          <div className="about-cat">Rust backend</div>
          <div className="about-crates">{RUST_CRATES}</div>
        </div>
      </div>
    </div>
  );
}
