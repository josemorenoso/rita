import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";

const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AIOS · 25 agentes operando una empresa",
  description:
    "Sistema operativo de agentes: Marketing, Ventas, Contabilidad y Logística conectados por un bus de datos a un centro de control.",
};

export const viewport: Viewport = {
  themeColor: "#05081A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${pixel.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
