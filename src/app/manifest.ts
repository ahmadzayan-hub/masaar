import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Masaar — Order Control Console",
    short_name: "Masaar",
    description:
      "Beyond Style UAE operations console: leads, orders, payments, production and delivery.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f3",
    theme_color: "#0d1626",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New conversation", url: "/intake", short_name: "Intake" },
      { name: "Orders", url: "/orders", short_name: "Orders" },
      { name: "Needs confirmation", url: "/orders?stage=lead", short_name: "Confirm" },
    ],
  };
}
