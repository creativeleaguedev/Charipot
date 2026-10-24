import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useWallet } from "@/lib/useWallet";
import { fmtNum } from "@/lib/configRegistry";
import {
  Home, Ticket, LayoutDashboard, ArrowLeftRight, FolderKanban,
  UserCog, ShieldCheck, Settings2, LogOut,
  Menu, X, Coins, Wallet, Tag, Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import BrandLogo from "@/components/ui/BrandLogo";
import { Image } from "@/components/ui/image";
import NotificationsBell from "@/components/NotificationsBell";
import DrawCompletePopup from "@/components/DrawCompletePopup";
import { TourProvider, useTour } from "@/lib/useTour";
import { getTourSteps } from "@/lib/tourSteps";
import TourOverlay from "@/components/TourOverlay";
import StuckPrompt from "@/components/StuckPrompt";
import { useLang } from "@/lib/LanguageContext";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const ROLE_LABELS = {
  participant: "User",
  user: "User",
  platform_admin: "Platform Admin",
  admin: "Super Admin",
};

const ALL_NAV = [
  { to: "/home", label: "Home", tKey: "nav.home", icon: Home, roles: "all" },
  { to: "/play", label: "Play", tKey: "nav.play", icon: Ticket, roles: "all" },
  { to: "/passes", label: "Ticket Passes", tKey: "nav.passes", icon: Tag, roles: "all" },
  { to: "/dashboard", label: "My Dashboard", tKey: "nav.dashboard", icon: LayoutDashboard, roles: "all" },
  { to: "/marketplace", label: "GOV Marketplace", tKey: "nav.marketplace", icon: ArrowLeftRight, roles: "all" },
  { to: "/funding-rounds", label: "Funding Rounds", tKey: "nav.fundingrounds", icon: Landmark, roles: "all" },
  { to: "/projects", label: "Impact Projects", tKey: "nav.projects", icon: FolderKanban, roles: "all" },
  { to: "/wallet", label: "My Wallet", tKey: "nav.wallet", icon: Wallet, roles: "all" },
  { to: "/agent", label: "Agent Portal", tKey: "nav.agent", icon: UserCog, roles: "all", agentOnly: true },
  { to: "/admin", label: "Admin Command Center", tKey: "nav.admin", icon: ShieldCheck, roles: ["platform_admin", "admin"] },
  { to: "/config", label: "Config Registry", tKey: "nav.config", icon: Settings2, roles: ["platform_admin", "admin"] },
  { to: "/support", label: "Support", tKey: "nav.support", roles: "all", logo: "https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/d859b30ab_support.png" },
];

// Keeps the mobile sidebar in sync with the new-user tour: open it for the
// "Navigation" step so the user sees the menu, then collapse it for every other
// step so the sidebar never covers the section being highlighted.
function TourNavSync({ onNavStep }) {
  const tour = useTour();
  const { t } = useLang();
  useEffect(() => {
    if (!tour?.active) return;
    const steps = getTourSteps(t);
    const step = steps[tour.index];
    onNavStep(step?.selector === "aside nav");
  }, [tour?.active, tour?.index, onNavStep, t]);
  return null;
}

export default function Layout() {
  const { user, wallet, loading } = useWallet();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const { t } = useLang();

  // Count the current user's support tickets with an unread admin reply, so the
  // sidebar "Help & Support" link shows a badge until the user opens the chat.
  const loadSupportUnread = useCallback(async () => {
    if (!user?.id) { setSupportUnread(0); return; }
    try {
      const list = await base44.entities.SupportTicket.filter({ userId: user.id, unreadForUser: true }, "-updatedAt", 100);
      setSupportUnread(list.length);
    } catch (_) { /* ignore */ }
  }, [user?.id]);

  useEffect(() => { loadSupportUnread(); }, [loadSupportUnread, location.pathname]);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = base44.entities.SupportTicket.subscribe(() => loadSupportUnread());
    return unsub;
  }, [user?.id, loadSupportUnread]);

  // A user's role is fixed by their account — it is never self-selectable.
  // Super Admin ("admin") accounts are provisioned out-of-band; Platform Admin
  // is assigned by a Super Admin; Agents are approved via the Home-page flow.
  const role = user?.role || "participant";
  const navItems = ALL_NAV.filter((item) => {
    if (item.agentOnly) return wallet?.isAgent || item.roles.includes(role);
    return item.roles === "all" || item.roles.includes(role);
  });

  // Sliding gold indicator (Uiverse "glider") that tracks the active nav item.
  const navRef = useRef(null);
  const [glider, setGlider] = useState({ top: 0, height: 0, ready: false });
  const updateGlider = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = nav.querySelector('[data-active="true"]');
    if (el) setGlider({ top: el.offsetTop, height: el.offsetHeight, ready: true });
    else setGlider((g) => ({ ...g, ready: false }));
  }, []);
  useEffect(() => { updateGlider(); }, [location.pathname, navItems.length, updateGlider]);
  useEffect(() => {
    window.addEventListener("resize", updateGlider);
    return () => window.removeEventListener("resize", updateGlider);
  }, [updateGlider]);

  const logout = async () => {
    sessionStorage.removeItem("adminGateUnlocked");
    await base44.auth.logout();
    navigate("/");
  };

  return (
    <TourProvider>
    <div className="flex min-h-screen bg-background">
      <DrawCompletePopup />
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 py-5">
            <BrandLogo height={56} className="rounded-lg shrink-0" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-white">{t("landing.brand")}</p>
              <p className="text-[11px] text-sidebar-foreground/60">{t("landing.tagline")}</p>
            </div>
          </div>

          <nav ref={navRef} className="relative flex-1 space-y-1 overflow-y-auto px-3">
            <span className="sidebar-nav-line" aria-hidden="true" />
            {glider.ready && (
              <span
                className="sidebar-nav-glider"
                aria-hidden="true"
                style={{ transform: `translateY(${glider.top}px)`, height: glider.height }}
              />
            )}
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-active={active ? "true" : "false"}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-300",
                    active
                      ? "bg-sidebar-accent text-accent shadow-sm"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-white"
                  )}
                >
                  {item.logo ? (
                    <Image
                      src={item.logo}
                      alt=""
                      fittingType="fill"
                      className="shrink-0 h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <Icon className="shrink-0" style={{ width: 18, height: 18 }} />
                  )}
                  {t(item.tKey)}
                  {item.to === "/support" && supportUnread > 0 && (
                    <span className="ml-auto flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground shadow">
                      {supportUnread > 9 ? "9+" : supportUnread}
                    </span>
                  )}
                  {item.to === "/passes" && (
                    <Image
                      src="https://media.base44.com/images/public/6a9fd1112d3233a0a31bca58/88116960b_501.jpg"
                      alt="Up to 50% off"
                      fittingType="fill"
                      className="ml-auto h-7 w-7 shrink-0 overflow-hidden rounded-full object-cover"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border p-4">
            <div className="rounded-xl bg-sidebar-accent/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60">{t("gov_balance_label")}</p>
              <p className="mt-1 text-lg font-bold text-accent">{fmtNum(wallet?.govBalance || 0)} {t("layout.votes")}</p>
            </div>
            <button
              onClick={logout}
              className="logout-switch mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-sidebar-border px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/40 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                {t("logout")}
              </span>
              <span className="switch">
                <span className="slider" />
              </span>
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/80 px-4 backdrop-blur-md lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button className="shrink-0 lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <BrandLogo height={32} className="rounded-md shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-foreground">{t("landing.brand")}</p>
              <p className="hidden text-[10px] tracking-wide text-muted-foreground sm:block">{t("landing.tagline")}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme + language switchers (replace the role badge) */}
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>

            <NotificationsBell userId={user?.id} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
    <TourNavSync onNavStep={setMobileOpen} />
    <TourOverlay />
    <StuckPrompt />
    </TourProvider>
  );
}