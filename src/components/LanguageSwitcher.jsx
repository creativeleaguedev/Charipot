import React from "react";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useLang, LANGUAGES } from "@/lib/LanguageContext";

export default function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Language"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent/15"
        >
          <span className="text-sm leading-none">{current.flag}</span>
          <span className="uppercase hidden sm:inline">{current.code}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className="cursor-pointer gap-2"
          >
            <span className="text-base leading-none">{l.flag}</span>
            <span className="flex-1">{l.name}</span>
            {lang === l.code && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}