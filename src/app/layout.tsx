import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Posture Coach",
  description: "Posture + focus + reminders + AI coaching",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TopNav />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}