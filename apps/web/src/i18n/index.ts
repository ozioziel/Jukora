import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './en';
import es from './es';
import { ay, qu } from './qu-ay';

export const LANGUAGES = [
  { code: 'es', label: 'Español', beta: false },
  { code: 'en', label: 'English', beta: false },
  { code: 'qu', label: 'Runasimi', beta: true },
  { code: 'ay', label: 'Aymar aru', beta: true },
] as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { es: { translation: es }, en: { translation: en }, qu: { translation: qu }, ay: { translation: ay } },
    supportedLngs: ['es', 'en', 'qu', 'ay'],
    fallbackLng: { qu: ['es'], ay: ['es'], default: ['es'] },
    interpolation: { escapeValue: false },
    returnObjects: true,
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'jcm.lang', caches: ['localStorage'] },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
