import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RFP Analyzer",
  description: "Compare industrial lease proposals on a Net Effective Rent basis.",
};

// Pre-hydration script: reads the saved theme + OS preference and toggles
// the `dark` class on <html> BEFORE React hydrates, so the first paint
// already matches the user's mode. No flash on reload.
const themeBootstrap = `
(function () {
  try {
    var saved = localStorage.getItem("lease-calculator/theme");
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = saved === "dark" || (saved !== "light" && systemDark);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        {children}
      </body>
    </html>
  );
}
