// Merges the base dictionary (translations.js) with page-specific keys
// (translationsPages.js + translationsPages2.js) so the translator sees one
// complete dictionary per language while each source file stays under the
// editor line limit.
import { translations as base } from "@/lib/translations";
import { translationsPages } from "@/lib/translationsPages";
import { translationsPages2 } from "@/lib/translationsPages2";

export const translations = Object.fromEntries(
  Object.keys(base).map((lang) => [
    lang,
    {
      ...base[lang],
      ...(translationsPages[lang] || {}),
      ...(translationsPages2[lang] || {}),
    },
  ])
);