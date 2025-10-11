/**
 * Astro-compatible Aside component, which is called Callout by the Mintlify.
 *
 * @param {{
 *   type: 'note' | 'tip' | 'caution' | 'danger',
 *   title: string,
 *   icon: string,
 *   iconType: 'regular' | 'solid' | 'light' | 'thin' | 'sharp-solid' | 'duotone' | 'brands',
 *   children: any
 * }} props
 */
export const Aside = ({ type = "note", title = "", icon = "", iconType = "regular", children }) => {
  const asideVariants = ["note", "tip", "caution", "danger"];
  const asideComponents = {
    note: {
      outerStyle: "border-sky-500/20 bg-sky-50/50 dark:border-sky-500/30 dark:bg-sky-500/10",
      innerStyle: "text-sky-900 dark:text-sky-200",
      calloutType: "note",
      icon: (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-sky-500"
          aria-label="Note"
        >
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M7 1.3C10.14 1.3 12.7 3.86 12.7 7C12.7 10.14 10.14 12.7 7 12.7C5.48908 12.6974 4.0408 12.096 2.97241 11.0276C1.90403 9.9592 1.30264 8.51092 1.3 7C1.3 3.86 3.86 1.3 7 1.3ZM7 0C3.14 0 0 3.14 0 7C0 10.86 3.14 14 7 14C10.86 14 14 10.86 14 7C14 3.14 10.86 0 7 0ZM8 3H6V8H8V3ZM8 9H6V11H8V9Z"
          ></path>
        </svg>
      ),
    },
    tip: {
      outerStyle: "border-emerald-500/20 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
      innerStyle: "text-emerald-900 dark:text-emerald-200",
      calloutType: "tip",
      icon: (
        <svg
          width="11"
          height="14"
          viewBox="0 0 11 14"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className="text-emerald-600 dark:text-emerald-400/80 w-3.5 h-auto"
          aria-label="Tip"
        >
          <path d="M3.12794 12.4232C3.12794 12.5954 3.1776 12.7634 3.27244 12.907L3.74114 13.6095C3.88471 13.8248 4.21067 14 4.46964 14H6.15606C6.41415 14 6.74017 13.825 6.88373 13.6095L7.3508 12.9073C7.43114 12.7859 7.49705 12.569 7.49705 12.4232L7.50055 11.3513H3.12521L3.12794 12.4232ZM5.31288 0C2.52414 0.00875889 0.5 2.26889 0.5 4.78826C0.5 6.00188 0.949566 7.10829 1.69119 7.95492C2.14321 8.47011 2.84901 9.54727 3.11919 10.4557C3.12005 10.4625 3.12175 10.4698 3.12261 10.4771H7.50342C7.50427 10.4698 7.50598 10.463 7.50684 10.4557C7.77688 9.54727 8.48281 8.47011 8.93484 7.95492C9.67728 7.13181 10.1258 6.02703 10.1258 4.78826C10.1258 2.15486 7.9709 0.000106649 5.31288 0ZM7.94902 7.11267C7.52078 7.60079 6.99082 8.37878 6.6077 9.18794H4.02051C3.63739 8.37878 3.10743 7.60079 2.67947 7.11294C2.11997 6.47551 1.8126 5.63599 1.8126 4.78826C1.8126 3.09829 3.12794 1.31944 5.28827 1.3126C7.2435 1.3126 8.81315 2.88226 8.81315 4.78826C8.81315 5.63599 8.50688 6.47551 7.94902 7.11267ZM4.87534 2.18767C3.66939 2.18767 2.68767 3.16939 2.68767 4.37534C2.68767 4.61719 2.88336 4.81288 3.12521 4.81288C3.36705 4.81288 3.56274 4.61599 3.56274 4.37534C3.56274 3.6515 4.1515 3.06274 4.87534 3.06274C5.11719 3.06274 5.31288 2.86727 5.31288 2.62548C5.31288 2.38369 5.11599 2.18767 4.87534 2.18767Z"></path>
        </svg>
      ),
    },
    caution: {
      outerStyle: "border-amber-500/20 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10",
      innerStyle: "text-amber-900 dark:text-amber-200",
      calloutType: "warning",
      icon: (
        <svg
          className="flex-none w-5 h-5 text-amber-400 dark:text-amber-300/80"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
          aria-label="Warning"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          ></path>
        </svg>
      ),
    },
    danger: {
      outerStyle: "border-red-500/20 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/10",
      innerStyle: "text-red-900 dark:text-red-200",
      calloutType: "danger",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          fill="currentColor"
          className="text-red-600 dark:text-red-400/80 w-4 h-4"
          aria-label="Danger"
        >
          <path d="M17.1 292c-12.9-22.3-12.9-49.7 0-72L105.4 67.1c12.9-22.3 36.6-36 62.4-36l176.6 0c25.7 0 49.5 13.7 62.4 36L494.9 220c12.9 22.3 12.9 49.7 0 72L406.6 444.9c-12.9 22.3-36.6 36-62.4 36l-176.6 0c-25.7 0-49.5-13.7-62.4-36L17.1 292zm41.6-48c-4.3 7.4-4.3 16.6 0 24l88.3 152.9c4.3 7.4 12.2 12 20.8 12l176.6 0c8.6 0 16.5-4.6 20.8-12L453.4 268c4.3-7.4 4.3-16.6 0-24L365.1 91.1c-4.3-7.4-12.2-12-20.8-12l-176.6 0c-8.6 0-16.5 4.6-20.8 12L58.6 244zM256 128c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path>
        </svg>
      ),
    },
  };
  let variant = type;
  let gotInvalidVariant = false;
  if (!asideVariants.includes(type)) {
    gotInvalidVariant = true;
    variant = "danger";
  }
  const iconVariants = ["regular", "solid", "light", "thin", "sharp-solid", "duotone", "brands"];
  if (!iconVariants.includes(iconType)) {
    iconType = "regular";
  }

  return (
    <>
      <div
        className={`callout my-4 px-5 py-4 overflow-hidden rounded-2xl flex gap-3 border ${asideComponents[variant].outerStyle}`}
        data-callout-type={asideComponents[variant].calloutType}
      >
        <div className="mt-0.5 w-4" data-component-part="callout-icon">
          {/* @ts-ignore */}
          {icon === "" ? asideComponents[variant].icon : <Icon icon={icon} iconType={iconType} size={14} />}
        </div>
        <div
          className={`text-sm prose min-w-0 w-full ${asideComponents[variant].innerStyle}`}
          data-component-part="callout-content"
        >
          {gotInvalidVariant ? (
            <p>
              <span className="font-bold">
                Invalid <code>type</code> passed!
              </span>
              <br />
              <span className="font-bold">Received: </span>
              {type}
              <br />
              <span className="font-bold">Expected one of: </span>
              {asideVariants.join(", ")}
            </p>
          ) : (
            <>
              {title && <p className="font-bold">{title}</p>}
              {children}
            </>
          )}
        </div>
      </div>
    </>
  );
};
