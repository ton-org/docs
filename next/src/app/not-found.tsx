import {DocsLayout} from "fumadocs-ui/layouts/docs"
import {NotFound as FumadocsNotFound} from "@/components/layouts/not-found"
import {source} from "@/lib/source"
import {baseOptions} from "@/lib/layout.shared"

export default function NotFound() {
  return (
    <DocsLayout
      tree={source.pageTree}
      sidebar={{className: "ton-docs-sidebar"}}
      {...baseOptions()}
    >
      <FumadocsNotFound getSuggestions={async () => []} />
    </DocsLayout>
  )
}
