import {ImageZoom} from "@/components/image-zoom"

export type MintlifyImageProps = {
  src: string
  darkSrc?: string
  alt?: string
  darkAlt?: string
  href?: string
  target?: "_self" | "_blank" | "_parent" | "_top"
  height?: string | number
  width?: string | number
  noZoom?: string | boolean
  center?: string | boolean
}

function isTruthy(value?: string | boolean) {
  return value === true || value === "true"
}

function normaliseDimension(value?: string | number): number | undefined {
  if (value === undefined) return undefined
  const numeric = typeof value === "number" ? value : Number.parseInt(value, 10)
  return Number.isFinite(numeric) ? numeric : undefined
}

/**
 * Mintlify `<Image>` snippet shim.
 *
 * - Renders a light/dark image pair when `darkSrc` is set.
 * - Wraps with `<a>` when `href` is provided.
 * - Optionally centers the image and disables zoom.
 * - Otherwise delegates to the Acton `ImageZoom` for click-to-zoom behavior.
 */
export function Image({
  src,
  darkSrc,
  alt = "",
  darkAlt,
  href,
  target,
  height = 342,
  width = 608,
  noZoom = false,
  center = false,
}: MintlifyImageProps) {
  const shouldCenter = isTruthy(center)
  const shouldNotZoom = isTruthy(noZoom) || Boolean(href)

  const heightPx = normaliseDimension(height)
  const widthPx = normaliseDimension(width)
  const isSvg = /\.svg(?:[#?].*)?$/i.test(src)
  const shouldInvert = isSvg && !darkSrc

  const lightImg = (
    <img
      className={shouldInvert ? "block dark:hidden" : darkSrc ? "block dark:hidden" : undefined}
      src={src}
      alt={alt}
      width={widthPx}
      height={heightPx}
    />
  )

  const darkImg =
    darkSrc || shouldInvert ? (
      <img
        className={`hidden dark:block ${shouldInvert ? "invert" : ""}`}
        src={darkSrc ?? src}
        alt={darkAlt ?? alt}
        width={widthPx}
        height={heightPx}
      />
    ) : null

  let content: React.ReactNode

  if (darkImg) {
    content = (
      <>
        {lightImg}
        {darkImg}
      </>
    )
  } else if (shouldNotZoom) {
    content = lightImg
  } else {
    content = (
      <ImageZoom src={src} alt={alt} width={widthPx ?? 608} height={heightPx ?? 342} />
    )
  }

  if (href) {
    content = (
      <a href={href} target={target ?? "_self"} rel={target === "_blank" ? "noreferrer noopener" : undefined}>
        {content}
      </a>
    )
  }

  if (shouldCenter) {
    return <div className="flex justify-center">{content}</div>
  }

  return <>{content}</>
}
