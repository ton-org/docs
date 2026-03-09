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
  /**
   * @param {FileTreeItem} item
   * @param {import("react").Key | null | undefined} index
   */
  const renderItem = (item, index) => {
    // Handle ellipsis items
    if (item === "..." || item === "…") {
      // @ts-ignore
      return <Tree.File key={index} name="…" />;
    }

    // Handle file items (both string and file objects)
    if (typeof item === "string" || item.kind === "file") {
      const fileName = typeof item === "string" ? item : item.name;
      const note = typeof item === "string" ? null : item.note;
      const displayName = note ? `${fileName} — ${note}` : fileName;

      // @ts-ignore
      return <Tree.File key={index} name={displayName} />;
    }

    // Handle folder objects
    if (item.kind === "folder") {
      const isOpen = item.open ?? defaultOpen;
      const displayName = item.note ? `${item.name} — ${item.note}` : item.name;

      return (
        // @ts-ignore
        <Tree.Folder key={index} name={displayName} defaultOpen={isOpen}>
          {item?.items?.map((nestedItem, nestedIndex) => renderItem(nestedItem, nestedIndex))}
          {/* @ts-ignore */}
        </Tree.Folder>
      );
    }

    const errorMessage = [
      `In the FileTree component, found: ${item}.`,
      `Expected either of: ..., …, string, { kind: "file", ... }, or { kind: "folder", ... }`,
    ].join(' ');
    alert(errorMessage);
    throw new Error(errorMessage);
  };

  // @ts-ignore
  return <Tree>{items.map((item, index) => renderItem(item, index))}</Tree>;
};
