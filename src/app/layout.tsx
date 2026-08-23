import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planify — Teman belajar yang menyesuaikan",
  description:
    "Siapkan prioritas belajar yang terasa masuk akal untuk minggu kamu.",
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
