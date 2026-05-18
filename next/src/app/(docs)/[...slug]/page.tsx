import {notFound} from "next/navigation"
import {generateVisibleParams, getPageImage, source} from "@/lib/source"
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  PageLastUpdate,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page"
import {getMDXComponents} from "@/lib/mdx-components"
import type {Metadata} from "next"
import {createRelativeLink} from "fumadocs-ui/mdx"
import {LLMCopyButton, ViewOptions} from "@/components/page-actions"
import {getLLMText} from "@/lib/get-llm-text"
import {APIPage, detectSchemaId, parseOperation} from "@/lib/openapi"
import type {OperationItem} from "fumadocs-openapi/ui"

interface PageProps {
  params: Promise<{slug: string[]}>
}

const metadataBase = new URL("https://docs.ton.org")

export default async function Page(props: PageProps) {
  const params = await props.params
  const page = source.getPage(params.slug)

  if (!page) {
    notFound()
  }

  const {body: MDX, lastModified} = page.data

  const llmText = getLLMText(page)
  const isWide = page.data.mode === "wide"

  // Pages whose frontmatter declares `openapi: <method> <path>` are stub MDX
  // files that should be rendered as a fumadocs-openapi reference page.
  const openapiSpec = typeof page.data.openapi === "string" ? page.data.openapi : undefined
  const operation = openapiSpec ? parseOperation(openapiSpec) : undefined
  const schemaId = openapiSpec ? detectSchemaId(openapiSpec) : undefined

  return (
    <DocsPage
      toc={page.data.toc}
      full={isWide || page.data.full}
      tableOfContent={{
        style: "clerk",
      }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      {page.data.description ? (
        <DocsDescription className="mb-2">{page.data.description}</DocsDescription>
      ) : null}
      <div className="flex flex-row flex-wrap gap-2 items-center border-b pb-6">
        <LLMCopyButton content={llmText} />
        <ViewOptions
          markdownUrl={`/llms.mdx${page.url}.md`}
          githubUrl={`https://github.com/ton-org/docs/blob/main/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
        {operation && schemaId ? (
          <APIPage
            document={schemaId}
            operations={[
              {
                method: operation.method as OperationItem["method"],
                path: operation.path,
              },
            ]}
            showTitle={false}
            showDescription={false}
          />
        ) : null}
      </DocsBody>
      {lastModified && (
        <div className="mt-4 border-t pt-4">
          <PageLastUpdate date={lastModified} />
        </div>
      )}
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return generateVisibleParams()
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)

  if (!page) {
    return {
      title: "Not Found",
      metadataBase,
    }
  }

  const image = getPageImage(page)

  return {
    title: page.data.title,
    description: page.data.description,
    metadataBase,
    alternates: {
      canonical: page.url,
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      type: "article",
      images: [
        {
          url: image.url,
          width: 1200,
          height: 630,
          alt: page.data.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.data.title,
      description: page.data.description,
      images: [image.url],
    },
  }
}
