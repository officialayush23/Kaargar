/**
 * i18next configuration — worker UI only.
 * User UI stays English. Logo always English.
 *
 * Static labels (nav, buttons, headings) are translated here via JSON.
 * Dynamic content (services, packages, offers, reviews) comes from the
 * backend content_translations table, already pre-translated via Groq.
 *
 * Fonts:
 *   en  → DM Sans (loaded via Google Fonts)
 *   hi  → Noto Sans Devanagari
 *   mr  → Noto Sans Devanagari
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './en.json'
import hi from './hi.json'
import mr from './mr.json'

const STORAGE_KEY = 'kaargar-worker-lang'

const savedLang = localStorage.getItem(STORAGE_KEY) || 'en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  })

/** Switch language and persist. Also updates document font. */
export function setWorkerLanguage(lang) {
  i18n.changeLanguage(lang)
  localStorage.setItem(STORAGE_KEY, lang)
  // Swap font for Devanagari vs Latin
  document.documentElement.style.setProperty(
    '--font-body',
    lang === 'en' ? "'DM Sans', sans-serif" : "'Noto Sans Devanagari', 'DM Sans', sans-serif"
  )
}

export default i18n
