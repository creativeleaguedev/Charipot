import React from "react";
import { Palette, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTheme, THEMES } from "@/lib/ThemeContext";
import { useLang } from "@/lib/LanguageContext";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useLang();
  const current = THEMES.find((th) => th.key === theme) || THEMES[0];
  const nameFor = (key) => t(`theme.${key}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("theme.title")}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent/15"
        >
          <Palette className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{nameFor(current.key)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {THEMES.map((th) => (
          <DropdownMenuItem
            key={th.key}
            onClick={() => setTheme(th.key)}
            className="cursor-pointer gap-2"
          >
            <span
              className="h-3.5 w-3.5 rounded-full border border-border"
              style={{ background: th.swatch }}
            />
            <span className="flex-1">{nameFor(th.key)}</span>
            {theme === th.key && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}