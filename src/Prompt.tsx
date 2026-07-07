import { useEffect, useRef, useState } from "react";
import { useStore } from "./store";

// One-line input dialog (new file / folder names). Enter submits, Esc cancels.
// Errors from the submit action surface inline instead of closing silently.
export function Prompt() {
  const prompt = useStore((s) => s.prompt);
  const close = useStore((s) => s.closePrompt);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue("");
    setError(null);
    if (prompt) inputRef.current?.focus();
  }, [prompt]);

  if (!prompt) return null;

  const submit = async () => {
    try {
      await Promise.resolve(prompt.submit(value));
      close();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="palette prompt-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="prompt-title">{prompt.title}</div>
        <input
          ref={inputRef}
          className="palette-input"
          value={value}
          placeholder={prompt.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            else if (e.key === "Escape") close();
          }}
        />
        {error && <div className="prompt-error">{error}</div>}
      </div>
    </div>
  );
}
