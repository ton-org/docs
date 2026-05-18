import coreWebVitals from "eslint-config-next/core-web-vitals"
import typescriptConfig from "eslint-config-next/typescript"

const config = [
  ...coreWebVitals,
  ...typescriptConfig,
  {
    ignores: [
      ".next/**",
      ".source/**",
      "content/docs/**",
      "openapi/**",
      "redirects.mjs",
      "scripts/migrate-content.mjs",
      "src/components/legacy/**",
    ],
  },
  {
    rules: {
      // Shims and migrated content rely on `any`; keep the lint informational
      // outside hot paths.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {argsIgnorePattern: "^_"}],
    },
  },
]

export default config
