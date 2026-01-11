"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

function NavPill({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "px-4 py-2 rounded-xl border text-sm font-medium transition",
        "hover:-translate-y-0.5 active:translate-y-0",
        active
          ? "bg-gradient-to-r from-sky-600 via-indigo-600 to-fuchsia-600 text-white border-transparent shadow-[0_12px_30px_-18px_rgba(99,102,241,0.8)]"
          : "bg-card/70 backdrop-blur border-border text-foreground hover:bg-muted",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="font-semibold tracking-tight">PostureSense</div>
          <span className="hidden sm:inline text-xs text-muted-foreground">
            posture · focus · reminders · AI
          </span>
        </div>

        <div className="flex items-center gap-2">
          <NavPill href="/monitor" label="Monitor" />
          <NavPill href="/dashboard" label="Dashboard" />
          <NavPill href="/stats" label="Stats" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}