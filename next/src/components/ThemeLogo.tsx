import Image from "next/image"
// import logoDark from "@/public/logo-dark.svg"
// import logoLight from "@/public/logo-light.svg"
import logoTon from "@/public/logo.svg"
import styles from "./ThemeLogo.module.css"

export function ThemeLogo() {
  return (
    <>
      <Image
        alt="TON"
        // src={logoLight}
        src={logoTon}
        width={80}
        height={80}
        sizes="80px"
        className={`h-8 w-auto ${styles.lightLogo}`}
        aria-label="TON"
      />
      <Image
        alt="TON"
        // src={logoDark}
        src={logoTon}
        width={80}
        height={80}
        sizes="80px"
        className={`h-8 w-auto ${styles.darkLogo}`}
        aria-label="TON"
      />
    </>
  )
}
