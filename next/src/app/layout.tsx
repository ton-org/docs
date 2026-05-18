import React from "react"
import type {Metadata} from "next"
import {Provider} from "./provider"
import {GeistSans} from "geist/font/sans"
import {GeistMono} from "geist/font/mono"
import "./globals.css"
import logoTon from "@/public/logo.svg"

export const metadata: Metadata = {
  title: {
    default: "TON documentation",
    template: "%s — TON Docs",
  },
  description:
    "TON is a blockchain platform designed for scalable smart contracts, applications, and payments at consumer scale.",
  icons: {
    icon: [
      {
        url: logoTon.src,
        media: "(prefers-color-scheme: light)",
        type: "image/svg+xml",
      },
      {
        url: logoTon.src,
        media: "(prefers-color-scheme: dark)",
        type: "image/svg+xml",
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
