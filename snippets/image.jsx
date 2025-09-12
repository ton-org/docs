/**
 * @param {{}} props
 */
export const ImageControls = ({ }) => {
  const { useControls } = globalThis.zoomPanPinch;
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (<>
    <div>
      <button
        className="py-[6px] px-[12px] bg-white border border-solid border-gray rounded-md mr-[10px] text-xs font-semibold cursor-pointer"
        onClick={() => zoomIn()} value="+" />
      <button
        className="py-[6px] px-[12px] bg-white border border-solid border-gray rounded-md mr-[10px] text-xs font-semibold cursor-pointer"
        onClick={() => zoomOut()} value="-" />
      <button
        className="py-[6px] px-[12px] bg-white border border-solid border-gray rounded-md mr-[10px] text-xs font-semibold cursor-pointer"
        onClick={() => resetTransform()} value="×" />
    </div>
  </>);
};

/**
 * @param {{src: string, darkSrc?: string, alt?: string, darkAlt?: string, svgControls?: boolean }} props
 */
export const Image = ({ src, darkSrc, alt = "", darkAlt, svgControls = false }) => {
  const isSVG = src.match(/\.svg(?:[#?].*?)?$/i) !== null;

  // Not an SVG or an SVG but with zoom-pan-pinch disabled
  if (!isSVG || !svgControls) {
    // Applying invert filter when there's no dark mode version
    return (<>
      <img className="block dark:hidden" src={src} alt={alt} />
      <img
        className={`hidden dark:block ${(isSVG && !darkAlt) ? "invert" : ""}`}
        src={darkSrc ?? src}
        alt={darkAlt ?? alt}
      />
    </>);
  }

  // An SVG, with zoom, pan, and pinch enabled
  const [libLoaded, setLibLoaded] = useState(false);
  useEffect(() => {
    // NOTE: using `import` keyword here leads to errors
    if (libLoaded || globalThis.zoomPanPinch) {
      setLibLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = [
      'import { TransformWrapper, TransformComponent, useControls } from "https://esm.sh/react-zoom-pan-pinch@3.7.0";',
      'globalThis.zoomPanPinch = { TransformWrapper, TransformComponent, useControls };',
    ].join('\n');
    // script.onload = () => setLibLoaded(true);
    document.head.before(script);
  }, []);

  if (!libLoaded) return (<p>Loading image library...</p>);
  const { TransformWrapper, TransformComponent } = globalThis.zoomPanPinch;

  return (
    <TransformWrapper
      initialScale={1}
      initialPositionX={200}
      initialPositionY={100}
    >
      {({ zoomIn, zoomOut, resetTransform, ...rest }) => (
        <>
          <ImageControls />
          <TransformComponent>
            <img src={src} alt={alt} style={{ maxWidth: '100%' }} />
          </TransformComponent>
        </>
      )}
    </TransformWrapper>
  );
};
