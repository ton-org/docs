/**
 * @param {{
 *   src: string,
 *   darkSrc?: string,
 *   alt?: string,
 *   darkAlt?: string,
 *   href?: string,
 *   target?: '_self' | '_blank' | '_parent' | '_top' | '_unfencedTop',
 * }} props
 */
export const Image = ({ src, darkSrc, alt = "", darkAlt, href, target }) => {
  const isSVG = src.match(/\.svg(?:[#?].*?)?$/i) !== null;
  const shouldInvert = isSVG && !darkSrc;
  const shouldCreateLink = href !== undefined;

  // Is a clickable link
  if (shouldCreateLink) {
    return (
      <a href={href} target={target ?? "_self"}>
        <img
          className="block dark:hidden"
          src={src}
          alt={alt}
          // @ts-ignore
          noZoom
        />
        <img
          className={`hidden dark:block ${shouldInvert ? "invert" : ""}`}
          src={darkSrc ?? src}
          alt={darkAlt ?? alt}
          // @ts-ignore
          noZoom
        />
      </a>
    );
  }

  // Not a link
  return (
    <>
      <img className="block dark:hidden" src={src} alt={alt} />
      {shouldInvert ? (
        <img
          className="hidden dark:block invert"
          src={darkSrc ?? src}
          alt={darkAlt ?? alt}
          // @ts-ignore
          noZoom
        />
      ) : (
        <img
          className="hidden dark:block"
          src={darkSrc ?? src}
          alt={darkAlt ?? alt}
        />
      )}
    </>
  );
};
