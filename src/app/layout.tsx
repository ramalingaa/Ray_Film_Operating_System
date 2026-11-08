import type { Metadata } from "next";
import { Cormorant_Garamond, Nunito_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const display = Cormorant_Garamond({
  variable: "--font-display-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReelGraph",
  description: "From a story to a greenlit production, one chapter at a time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} antialiased`}>
      <body className="flex h-dvh flex-col bg-paper text-ink print:h-auto">
        <Nav />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto print:overflow-visible">{children}</main>
      </body>
    </html>
  );
}
