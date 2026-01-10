import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Posture Coach",
  description: "Posture + focus + fatigue coach",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}