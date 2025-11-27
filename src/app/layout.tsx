import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "inhibitor.lol | League of Legends Stats",
  description: "Track your League of Legends stats, match history, and live games. Fast, beautiful, and free.",
  keywords: ["League of Legends", "LoL", "stats", "op.gg", "match history", "ranked"],
  authors: [{ name: "inhibitor.lol" }],
  openGraph: {
    title: "inhibitor.lol | League of Legends Stats",
    description: "Track your League of Legends stats, match history, and live games.",
    type: "website",
    locale: "en_US",
    siteName: "inhibitor.lol",
  },
  twitter: {
    card: "summary_large_image",
    title: "inhibitor.lol | League of Legends Stats",
    description: "Track your League of Legends stats, match history, and live games.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
      >
        <TooltipProvider delayDuration={200}>
          <div className="relative min-h-screen flex flex-col">
            {/* Subtle gradient background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
              <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
              <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-primary/3 rounded-full blur-[100px]" />
            </div>
            {children}
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
