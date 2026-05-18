import type {ReactNode} from "react"
import fs from "node:fs/promises"
import type {ImageResponseOptions} from "next/server"

export interface GenerateProps {
  title: ReactNode
  description?: ReactNode
  site?: ReactNode
  logo?: ReactNode
  siteUrl?: ReactNode
}

const font = fs.readFile("./node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf")
const fontBold = fs.readFile("./node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf")
const tonLogo = fs.readFile("./public/logo-ton-gray.svg", "utf8")

function toSvgDataUri(content: string) {
  return `data:image/svg+xml;base64,${Buffer.from(content).toString("base64")}`
}

function truncateText(value: ReactNode, maxLength: number) {
  if (typeof value !== "string") return value
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

export async function getImageResponseOptions(): Promise<ImageResponseOptions> {
  return {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Geist",
        data: await font,
        weight: 400,
      },
      {
        name: "Geist",
        data: await fontBold,
        weight: 600,
      },
    ],
  }
}

export async function generate({
  title,
  description,
  logo,
  site = "TON Docs",
  siteUrl = "docs.ton.org",
}: GenerateProps) {
  const primaryTextColor = "rgb(248, 250, 252)"
  const secondaryTextColor = "rgba(248, 250, 252, 0.82)"
  const mutedTextColor = "rgba(248, 250, 252, 0.68)"
  const tonLogoData = toSvgDataUri(await tonLogo)
  const cardTitle = truncateText(title, 110)
  const cardDescription = description
    ? truncateText(description, 180)
    : "The Open Network: a fast, scalable layer-1 blockchain for smart contracts, apps, and payments."

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        color: "white",
        background: "linear-gradient(180deg, #08182C 0%, #0098EA 100%)",
        fontFamily: "Geist",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background:
            "radial-gradient(circle at 34% 106%, rgba(92, 196, 247, 0.52) 0%, rgba(92, 196, 247, 0.18) 22%, rgba(92, 196, 247, 0) 55%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -90,
          top: 88,
          display: "flex",
          width: 540,
          height: 540,
          opacity: 0.16,
        }}
      >
        <img
          src={tonLogoData}
          alt="TON logo"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: "100%",
          height: "100%",
          padding: "54px 72px",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 22}}>
          {logo}
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1,
              color: primaryTextColor,
            }}
          >
            {site}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            marginTop: 88,
            maxWidth: 760,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 70,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: -1.8,
              color: primaryTextColor,
              wordBreak: "break-word",
            }}
          >
            {cardTitle}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 30,
              lineHeight: 1.35,
              color: secondaryTextColor,
              wordBreak: "break-word",
            }}
          >
            {cardDescription}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: "auto",
            paddingTop: 28,
            fontSize: 22,
            fontWeight: 500,
            color: mutedTextColor,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#5CC4F7",
              boxShadow: "0 0 18px rgba(92, 196, 247, 0.55)",
            }}
          />
          <span>{siteUrl}</span>
        </div>
      </div>
    </div>
  )
}
