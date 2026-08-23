import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planify — Teman belajar yang adaptif",
  description:
    "Siapkan prioritas belajar yang terasa masuk akal untuk minggu kamu.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.svg",
    apple: "/apple-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
