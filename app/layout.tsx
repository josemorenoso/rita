import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Press_Start_2P } from "next/font/google";
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

/** La pantalla de Sofi va en claro y con Inter, como el centro de cobros. */
const sans = Inter({
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang="es" className={`${pixel.variable} ${mono.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
