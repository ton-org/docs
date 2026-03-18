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
 *   noZoom?: string | boolean,
 *   center?: string | boolean,
 * }} props
 */
export const Image = ({
  src,
  darkSrc,
  alt = '',
  darkAlt,
  href,
  target,
  height = 342,
  width = 608,
  noZoom = false,
  center = false,
}) => {
  const isSVG = src.match(/\.svg(?:[#?].*?)?$/i) !== null;
  const shouldInvert = isSVG && !darkSrc;
  const shouldCreateLink = href !== undefined;
  const minPx = 9;
  const maxPx = 608;
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

  // Typecast string | boolean values to boolean-only
  const shouldCenter = center === "true" || center === true ? true : false;
  const shouldNotZoom = noZoom === "true" || noZoom === true ? true : false;

  // Resulting images
  const images = (
    <>
      <img
        className="block dark:hidden"
        src={src}
        alt={alt}
        {...(height && { height: heightPx })}
        {...(width && { width: widthPx })}
        // @ts-ignore
        {...((shouldCreateLink || shouldInvert || shouldNotZoom) && { noZoom: "true" })}
      />
      <img
        className={`hidden dark:block ${shouldInvert ? "invert" : ""}`}
        src={darkSrc ?? src}
        alt={darkAlt ?? alt}
        {...(height && { height: heightPx })}
        {...(width && { width: widthPx })}
        // @ts-ignore
        {...((shouldCreateLink || shouldInvert || shouldNotZoom) && { noZoom: "true" })}
      />
    </>
  );

  // Is a clickable link
  if (shouldCreateLink) {
    // Centered horizontally
    if (shouldCenter) {
      return (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <a href={href} target={target ?? "_self"}>
            {images}
          </a>
        </div>
      );
    }

    return (
      <a href={href} target={target ?? "_self"}>
        {images}
      </a>
    );
  }

  // Not a link, centered horizontally
  if (shouldCenter) {
    return <div style={{ display: "flex", justifyContent: "center" }}>{images}</div>;
  }

  // Not a link, placed as is
  return images;
};
