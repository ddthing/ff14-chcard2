import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import { LocaleProvider } from "@/lib/i18n";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { createAppAppearanceBootstrapScript } from "@/lib/app-appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "XIV Adventurer Card",
    template: "%s — XIV Adventurer Card",
  },
  description: "Turn your favorite FINAL FANTASY XIV screenshot into a card worth sharing.",
  applicationName: "XIV Adventurer Card",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#080909",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  preload("/fonts/dm-sans-latin-wght-normal.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  return (
    <html lang="ko" data-scroll-behavior="smooth" data-app-appearance="system" data-app-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: createAppAppearanceBootstrapScript() }} />
      </head>
      <body>
        <ThemeProvider>
          <LocaleProvider>
            <AppShell>{children}</AppShell>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
