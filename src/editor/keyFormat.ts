// Translate a friendly key string ("Ctrl+Shift+K", "Alt+Left", "Ctrl+K Ctrl+U") into the
// CodeMirror keymap grammar ("Ctrl-Shift-k", "Alt-ArrowLeft", "Ctrl-k Ctrl-u"). Chords are
// space-separated. Returns null for an unparseable string. This is what lets users write config
// keys the same way the F1 help displays them.

const MODIFIERS: Record<string, string> = {
  ctrl: "Ctrl",
  control: "Ctrl",
  cmd: "Cmd",
  command: "Cmd",
  meta: "Meta",
  super: "Meta",
  win: "Meta",
  mod: "Mod",
  alt: "Alt",
  opt: "Alt",
  option: "Alt",
  shift: "Shift",
};

// Friendly key-name → CodeMirror key name (things that aren't a bare character).
const KEYNAMES: Record<string, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  tab: "Tab",
  space: "Space",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

// One chord-part, e.g. "Ctrl+Shift+K" → "Ctrl-Shift-k".
function part(p: string): string | null {
  const tokens = p.split("+").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;
  const mods: string[] = [];
  let key: string | null = null;
  tokens.forEach((tok, i) => {
    const low = tok.toLowerCase();
    // A token is a modifier only if it's a known one AND not the final token (the key).
    if (i < tokens.length - 1 && MODIFIERS[low]) mods.push(MODIFIERS[low]);
    else key = tok;
  });
  if (key == null) return null;
  const kl = (key as string).toLowerCase();
  let cmKey: string;
  if (KEYNAMES[kl]) cmKey = KEYNAMES[kl];
  else if ((key as string).length === 1) cmKey = /[a-z]/i.test(key) ? kl : key; // letter → lower; symbol/digit as-is
  else if (/^f\d{1,2}$/i.test(key)) cmKey = "F" + kl.slice(1); // F1..F12
  else cmKey = key; // already a CM name like "ArrowUp"
  return [...mods, cmKey].join("-");
}

export function toCmKey(friendly: string): string | null {
  const parts = friendly.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const out: string[] = [];
  for (const p of parts) {
    const r = part(p);
    if (r == null) return null;
    out.push(r);
  }
  return out.join(" ");
}
