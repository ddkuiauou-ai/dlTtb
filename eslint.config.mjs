import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Keep the existing imperative feed/DOM contracts while upgrading React.
    // Compiler-era diagnostics remain visible; enabling the compiler and
    // redesigning those contracts are separate work from this migration.
    rules: {
      "react-hooks/purity": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", ".kilo/**", "out/**", "next-env.d.ts", "cloudflare-env.d.ts"]),
]);
