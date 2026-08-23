import nextVitals from "eslint-config-next/core-web-vitals";
import { globalIgnores } from "eslint/config";

const eslintConfig = [
  globalIgnores([".next/**", "node_modules/**"]),
  ...nextVitals,
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
];

export default eslintConfig;
