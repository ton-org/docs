/**
 * @param {{
 *   src: string,
 *   darkSrc?: string,
 *   alt?: string,
 *   darkAlt?: string,
 *   href?: string,
 *   target?: '_self' | '_blank' | '_parent' | '_top' | '_unfencedTop',
 *   height?: string | number,
 *   width?: string | number,
 * }} props
 */
export const Image = ({ src, darkSrc, alt = "", darkAlt, href, target, height, width }) => {
  const isSVG = src.match(/\.svg(?:[#?].*?)?$/i) !== null;
  const shouldInvert = isSVG && !darkSrc;
  const shouldCreateLink = href !== undefined;
  const minPx = 1;
  const maxPx = 600;
  const expectedPx = `a number or a string with a number that is greater than ${minPx - 1} and less than or equal to ${maxPx}`;

  /**
   * @param title {string}
   * @param received {string | number}
   * @param expected {string | number}
   */
  const createInvalidPropCallout = (title, received, expected) => {
    return (
      // @ts-ignore
      <Danger>
        <span className="font-bold">
          Invalid <code>{title.toString()}</code> passed!
        </span>
        <br />
        <span className="font-bold">Received: </span>
        {received.toString()}
        <br />
        <span className="font-bold">Expected: </span>
        {expected.toString()}
        {/* @ts-ignore */}
      </Danger>
    );
  };

  /** @param value {string | number} */
  const checkValidDimensionValue = (value) => {
    switch (typeof value) {
      case "string":
      case "number":
        const num = Number(value);
        return Number.isSafeInteger(num) && num >= minPx && num <= maxPx;
      default:
        return false;
    }
  };

  // Collect error callouts
  let callouts = [];

  // Invalid image height (in pixels)
  if (height && !checkValidDimensionValue(height)) {
    callouts.push(createInvalidPropCallout("height", height, expectedPx));
  }

  // Invalid image width (in pixels)
  if (width && !checkValidDimensionValue(width)) {
    callouts.push(createInvalidPropCallout("width", width, expectedPx));
  }

  // Display all errors
  if (callouts.length !== 0) {
    return callouts;
  }

  // Resulting pixel dimensions
  const heightPx = Number(height);
  const widthPx = Number(width);

  // Is a clickable link
  if (shouldCreateLink) {
    return (
      <a href={href} target={target ?? "_self"}>
        <img
          className="block dark:hidden"
          src={src}
          alt={alt}
          {...(height && { height: heightPx })}
          {...(width && { width: widthPx })}
          // @ts-ignore
          noZoom
        />
        <img
          className={`hidden dark:block ${shouldInvert ? "invert" : ""}`}
          src={darkSrc ?? src}
          alt={darkAlt ?? alt}
          {...(height && { height: heightPx })}
          {...(width && { width: widthPx })}
          // @ts-ignore
          noZoom
        />
      </a>
    );
  }

  // Not a link
  return (
    <>
      <img
        className="block dark:hidden"
        src={src}
        alt={alt}
        {...(height && { height: heightPx })}
        {...(width && { width: widthPx })}
      />
      {shouldInvert ? (
        <img
          className="hidden dark:block invert"
          src={darkSrc ?? src}
          alt={darkAlt ?? alt}
          {...(height && { height: heightPx })}
          {...(width && { width: widthPx })}
          // @ts-ignore
          noZoom
        />
      ) : (
        <img
          className="hidden dark:block"
          src={darkSrc ?? src}
          alt={darkAlt ?? alt}
          {...(height && { height: heightPx })}
          {...(width && { width: widthPx })}
        />
      )}
    </>
  );
};
