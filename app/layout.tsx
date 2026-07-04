import type { Metadata } from "next";
import { JetBrains_Mono, Courier_Prime } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { getUserSettings } from "@/lib/settings";
import "./globals.css";

// Both theme fonts load up front; --font-app picks one per data-theme
// (cyber → JetBrains Mono, primary → Courier Prime). See globals.css.
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const courierPrime = Courier_Prime({
  variable: "--font-courier",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pylot",
  description: "Learn to fly the plane yourself — an interactive Python onramp.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme is server-rendered onto <html> so there is no flash of wrong theme;
  // the toggle PATCHes /api/settings and refreshes.
  const user = await getCurrentUser();
  const { theme } = await getUserSettings(user.id);

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${jetbrains.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
