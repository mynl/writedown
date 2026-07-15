import { isDirty, useStore } from "./store";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** ST-style "Open Files" section at the top of the side panel (both Folder and Project
 *  tabs): one row per open tab. Same semantics as the tab strip — click activates,
 *  double-click promotes a preview tab, × saves then closes. */
export function OpenFiles() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const promoteTab = useStore((s) => s.promoteTab);
  const closeTab = useStore((s) => s.closeTab);
  const saveDoc = useStore((s) => s.saveDoc);

  if (tabs.length === 0) return null;

  return (
    <div className="openfiles">
      <div className="pane-header">Open Files</div>
      <div className="tree openfiles-list" role="list">
        {tabs.map((t) => (
          <div
            key={t.path}
            className={
              "tree-row openfile" +
              (t.path === activePath ? " active" : "") +
              (t.preview ? " preview" : "")
            }
            title={t.path}
            role="listitem"
            onClick={() => setActive(t.path)}
            onDoubleClick={() => promoteTab(t.path)}
          >
            <span className="openfile-dirty">{isDirty(t) ? "●" : ""}</span>
            <span className="tree-name">{basename(t.path)}</span>
            <span
              className="tab-close"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                // Save-then-close, like the tab strip (autosave means nothing is lost).
                void saveDoc(t.path).finally(() => closeTab(t.path));
              }}
            >
              ×
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
