import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#1c1917", soft: "#44403c" }, // warm near-black (stone)
        champagne: { DEFAULT: "#b08a4f", soft: "#c9a86a", deep: "#8a6a38" }, // brand gold accent
        pearl: "#faf7f3", // warm off-white surface base
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,25,23,0.04), 0 8px 24px -12px rgba(28,25,23,0.10)",
        pop: "0 8px 30px -8px rgba(28,25,23,0.18)",
      },
      borderRadius: { xl: "0.9rem", "2xl": "1.15rem" },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
