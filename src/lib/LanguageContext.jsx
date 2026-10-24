import React, { createContext, useContext, useEffect, useState } from "react";
import { translations } from "@/lib/allTranslations";

export const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "sw", name: "Kiswahili", flag: "🇰🇪" },
];

const LanguageContext = createContext(null);
const STORAGE_KEY = "app-lang";

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "en"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (code) => setLangState(code);

  // Translate a key for the active language, falling back to English then the
  // raw key so untranslated strings still render instead of disappearing.
  // Optional `params` replaces {name} placeholders in the resolved string.
  const t = (key, params) => {
    const dict = translations[lang] || translations.en;
    let str = dict[key] ?? translations.en[key] ?? key;
    if (params) {
      Object.keys(params).forEach((k) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), params[k]);
      });
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) return { lang: "en", setLang: () => {}, t: (k) => k };
  return ctx;
}