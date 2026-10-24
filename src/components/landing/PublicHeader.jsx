import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/ui/BrandLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useAuth } from "@/lib/AuthContext";
import { ArrowRight } from "lucide-react";

// Public landing header — Charipot wordmark, anchor nav, theme + language
// switchers, Log In (outlined) + Donate (filled orange). Auth-aware: swaps to a
// Dashboard button once signed in.
const NAV = [
  { label: "Home", href: "#home" },
  { label: "Our Impact", href: "#impact" },
  { label: "Projects", href: "#projects" },
  { label: "How It Works", href: "#how" },
  { label: "Play for a Cause", href: "#play" },
];

export default function PublicHeader({ t }) {
  const { isAuthenticated } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <BrandLogo height={40} className="rounded-md" />
          <span className="text-lg font-extrabold tracking-tight text-foreground">Charipot</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-[#F26522]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LanguageSwitcher />
          <ThemeSwitcher />
          {isAuthenticated ? (
            <Button asChild size="sm" className="bg-[#F26522] hover:bg-[#e05a1c] text-white">
              <Link to="/dashboard">{t("landing.dashboard")} <ArrowRight className="ml-1.5" style={{ width: 14, height: 14 }} /></Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="outline" size="sm" className="border-[#F26522] text-[#F26522] hover:bg-[#F26522]/10">
                <Link to="/login">{t("landing.signin")}</Link>
              </Button>
              <Button asChild size="sm" className="bg-[#F26522] hover:bg-[#e05a1c] text-white">
                <Link to="/donate">{t("landing.donate")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}