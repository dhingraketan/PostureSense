"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === "system" ? systemTheme : theme;
  const isDark = current === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={[
        "relative overflow-hidden rounded-xl px-3 py-2 text-sm font-medium border transition",
        "bg-background text-foreground border-border",
        "hover:bg-muted active:scale-[0.98]",
      ].join(" ")}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="relative z-10">{isDark ? "🌙 Dark" : "☀️ Light"}</span>
    </button>
  );
}