import { isDirty, useStore } from "./store";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function Tabs() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const promoteTab = useStore((s) => s.promoteTab);
  const closeTab = useStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  function onClose(e: React.MouseEvent, path: string, dirty: boolean) {
    e.stopPropagation();
    if (dirty && !window.confirm(`${basename(path)} has unsaved changes. Close anyway?`)) {
      return;
    }
    closeTab(path);
  }

  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => {
        const dirty = isDirty(t);
        return (
          <div
            key={t.path}
            className={
              "tab" +
              (t.path === activePath ? " active" : "") +
              (t.preview ? " preview" : "")
            }
            onClick={() => setActive(t.path)}
            onDoubleClick={() => promoteTab(t.path)}
            title={t.path}
            role="tab"
            aria-selected={t.path === activePath}
          >
            {dirty && <span className="tab-dirty">●</span>}
            <span className="tab-name">{basename(t.path)}</span>
            <span
              className="tab-close"
              onClick={(e) => onClose(e, t.path, dirty)}
              title="Close tab"
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
