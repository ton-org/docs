import type {ComponentProps, ReactNode} from "react"
import {File, Folder, Files} from "fumadocs-ui/components/files"

export type FileTreeItem =
  | "..."
  | "…"
  | string
  | {name: string; note?: string; kind: "file"}
  | {
      name: string
      note?: string
      kind: "folder"
      open?: boolean
      items?: FileTreeItem[]
    }

interface FileTreeProps {
  items?: FileTreeItem[]
  defaultOpen?: boolean
}

function renderItem(item: FileTreeItem, index: number, defaultOpen: boolean): ReactNode {
  if (item === "..." || item === "…") {
    return <File key={index} name="…" />
  }

  if (typeof item === "string") {
    return <File key={index} name={item} />
  }

  if (item.kind === "file") {
    const display = item.note ? `${item.name} — ${item.note}` : item.name
    return <File key={index} name={display} />
  }

  if (item.kind === "folder") {
    const isOpen = item.open ?? defaultOpen
    const display = item.note ? `${item.name} — ${item.note}` : item.name
    return (
      <Folder key={index} name={display} defaultOpen={isOpen}>
        {item.items?.map((child, childIdx) => renderItem(child, childIdx, defaultOpen))}
      </Folder>
    )
  }

  return null
}

export function FileTree({items = [], defaultOpen = true}: FileTreeProps) {
  return <Files>{items.map((item, idx) => renderItem(item, idx, defaultOpen))}</Files>
}

/**
 * Mintlify exposed a built-in `<Tree>` JSX element accepting `<Tree.Folder>`
 * and `<Tree.File>` children. We re-implement that surface on top of Fumadocs'
 * `Files`, so authors can keep using the compositional form without imports.
 */
export function Tree({children}: {children?: ReactNode}) {
  return <Files>{children}</Files>
}

Tree.Folder = function TreeFolder(props: ComponentProps<typeof Folder>) {
  return <Folder {...props} />
}

Tree.File = function TreeFile(props: ComponentProps<typeof File>) {
  return <File {...props} />
}
