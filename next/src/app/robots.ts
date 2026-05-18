import type {MetadataRoute} from "next"

export const revalidate = false

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://docs.ton.org/sitemap.xml",
    host: "https://docs.ton.org",
  }
}
