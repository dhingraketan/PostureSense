"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/monitor", label: "Monitor" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/stats", label: "Stats" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <div className="border-b">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
        <Link href="/" className="font-semibold">
          Posture Coach
        </Link>

        <nav className="ml-auto flex gap-2">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-2 rounded-md text-sm",
                  active ? "bg-muted font-medium" : "hover:bg-muted"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}