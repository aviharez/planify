import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17251F",
        moss: "#315342",
        sage: "#CFE0CE",
        cream: "#F3F0E7",
        coral: "#D76A4A",
        sand: "#E6D9C7",
      },
      fontFamily: {
        display: ["var(--font-cabinet)", "Arial", "sans-serif"],
        sans: ["var(--font-cabinet)", "Arial", "sans-serif"],
      },
      boxShadow: {
        soft: "0 20px 55px rgba(23, 37, 31, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
