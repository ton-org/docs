/**
 * @typedef {(
 *   {name: string, note?: string}
 * )} FileTreeItemCommon
 *
 * @typedef {(
 *   | '...'
 *   | '…'
 *   | string
 *   | FileTreeItemCommon & {kind: 'file'}
 *   | FileTreeItemCommon & {kind: 'folder', open?: boolean, items?: FileTreeItem[] }
 * )} FileTreeItem
 *
 * @param {{ items: FileTreeItem[], defaultOpen?: boolean }} props
 */
export const FileTree = ({ items = [], defaultOpen = true }) => {
  // @ts-ignore
  const handleFolderClick = useCallback((event) => {
    const folderDiv = event.currentTarget;
    const folderLi = folderDiv.parentElement;
    const nestedUl = folderLi.querySelector("ul");
    const icon = folderDiv.querySelector("[data-icon]");

    if (nestedUl) {
      const isCurrentlyOpen = nestedUl.style.display !== "none";
      nestedUl.style.display = isCurrentlyOpen ? "none" : "block";

      if (icon) {
        const iconName = isCurrentlyOpen ? "folder-closed" : "folder-open";
        icon.setAttribute("data-icon", iconName);
      }

      folderDiv.setAttribute("data-open", (!isCurrentlyOpen).toString());
    }
  }, []);

  /**
   * @param {FileTreeItem} item
   * @param {import("react").Key | null | undefined} index
   * @param {number} depth
   */
  const renderItem = (item, index, depth = 0) => {
    const baseClasses = "flex gap-2 py-1 break-words items-center";
    const iconClasses =
      "min-w-4 w-4 min-h-4 h-4 shrink-0 flex-1 text-gray-600 dark:text-gray-600 fill-current";
    const indentClasses = depth > 0 ? `ml-${depth * 4}` : "";
    const nameClasses = "flex-2";
    const noteClasses =
      "text-xs text-gray-500 dark:text-gray-400 truncate flex-1";

    // Handle ellipsis items
    if (item === "..." || item === "…") {
      return (
        <li key={index} className={`${baseClasses} ${indentClasses}`}>
          {/* @ts-ignore */}
          <Icon icon="ellipsis" className={iconClasses} />
        </li>
      );
    }

    // Handle file items (both string and file objects)
    if (typeof item === "string" || item.kind === "file") {
      const fileName = typeof item === "string" ? item : item.name;
      const note = typeof item === "string" ? null : item.note;

      return (
        <li key={index}>
          <div className={`${baseClasses} ${indentClasses}`}>
            {/* @ts-ignore */}
            <Icon icon="file-lines" className={iconClasses} />
            <span className={nameClasses}>{fileName}</span>
            {note && <span className={noteClasses}>— {note}</span>}
          </div>
        </li>
      );
    }

    // Handle folder objects
    if (item.kind === "folder") {
      const isOpen = item.open ?? defaultOpen;

      return (
        <li key={index}>
          <div
            className={`${baseClasses} ${indentClasses} hover:opacity-70 cursor-pointer`}
            data-open={isOpen.toString()}
            onClick={handleFolderClick}
          >
            {/* @ts-ignore */}
            <Icon
              icon={
                isOpen && item?.items && item.items?.length > 0
                  ? "folder-open"
                  : "folder-closed"
              }
              data-open={isOpen ? "folder-open" : "folder-closed"}
              className={iconClasses}
            />
            <span className={nameClasses}>{item.name}</span>
            {item.note && <span className={noteClasses}>— {item.note}</span>}
          </div>
          {item?.items && item.items?.length > 0 && (
            <ul
              className="list-none"
              style={{ display: isOpen ? "block" : "none" }}
            >
              {item.items.map((nestedItem, nestedIndex) =>
                renderItem(nestedItem, nestedIndex, depth + 1),
              )}
            </ul>
          )}
        </li>
      );
    }

    throw new Error(
      `Found: ${item}. Expected either of: ..., …, string, { kind: "file", ... }, or { kind: "folder", ... }`,
    );
  };

  return (
    <ul className="max-w-full not-prose rounded-2xl relative group text-sm border border-gray-950/10 dark:border-white/10 px-4 py-3 inline-flex flex-col gap-1 list-none transition-colors">
      {items.map((item, index) => renderItem(item, index))}
    </ul>
  );
};
