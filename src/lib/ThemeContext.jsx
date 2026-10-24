import React, { createContext, useContext, useEffect, useState } from "react";

// The four selectable platform themes. `swatch` is the colour chip shown in
// the switcher; the actual surface palette lives in index.css under
// `html[data-theme="<key>"]`.
export const THEMES = [
  { key: "graphite", name: "Graphite White", swatch: "#f5f5f7" },
  { key: "obsidian", name: "Obsidian Black", swatch: "#0a0a0a" },
  { key: "glass", name: "Dark Glass", swatch: "#1a2230" },
  { key: "grid", name: "Grid", swatch: "#e8eef5" },
];

const ThemeContext = createContext(null);
const STORAGE_KEY = "app-theme";

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "obsidian"
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (key) => setThemeState(key);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return { theme: "obsidian", setTheme: () => {} };
  return ctx;
}