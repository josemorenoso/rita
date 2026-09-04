import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Press_Start_2P } from "next/font/google";
import { BRAND } from "@/lib/leads/brand";
import "./globals.css";
import "./leadhunter.css";
import "./finder.css";
import "./diagram.css";
import "./rutas.css";
import "./lupa.css";
import "./sofi.css";

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

/** La sans de lo que se dice en voz alta en la pantalla de Sofi. */
const voz = Instrument_Sans({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-voz",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.toolName} · Encuentra clientes reales`,
  description: BRAND.tagline,
};

export const viewport: Viewport = {
  themeColor: "#05081A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${pixel.variable} ${mono.variable} ${voz.variable}`}>
      <body>{children}</body>
    </html>
  );
}
