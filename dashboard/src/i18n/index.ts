import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';

export const supportedLanguages = [
  'en',
  'de',
  'es',
  'he',
  'zh-CN',
  'zh-HK',
  'ar',
  'te',
  'fr',
  'it',
  'pt-BR',
  'ko',
] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = ['he', 'ar'];

export const languageOptions: Array<{ value: SupportedLanguage; label: string; compactLabel: string }> = [
  { value: 'en', label: 'English', compactLabel: 'EN' },
  { value: 'de', label: 'Deutsch', compactLabel: 'DE' },
  { value: 'es', label: 'Español', compactLabel: 'ES' },
  { value: 'he', label: 'עברית', compactLabel: 'עברית' },
  { value: 'zh-CN', label: '简体中文', compactLabel: '简中' },
  { value: 'zh-HK', label: '繁體中文', compactLabel: '繁中' },
  { value: 'ar', label: 'العربية', compactLabel: 'AR' },
  { value: 'te', label: 'తెలుగు', compactLabel: 'TE' },
  { value: 'fr', label: 'Français', compactLabel: 'FR' },
  { value: 'it', label: 'Italiano', compactLabel: 'IT' },
  { value: 'pt-BR', label: 'Português (Brasil)', compactLabel: 'PT' },
  { value: 'ko', label: '한국어', compactLabel: 'KO' },
];

export const localeLoaders: Record<SupportedLanguage, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./locales/en.json'),
  de: () => import('./locales/de.json'),
  es: () => import('./locales/es.json'),
  he: () => import('./locales/he.json'),
  'zh-CN': () => import('./locales/zh-CN.json'),
  'zh-HK': () => import('./locales/zh-HK.json'),
  ar: () => import('./locales/ar.json'),
  te: () => import('./locales/te.json'),
  fr: () => import('./locales/fr.json'),
  it: () => import('./locales/it.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  ko: () => import('./locales/ko.json'),
};

export function resolveSupportedLanguage(lang?: string): SupportedLanguage {
  const value = lang || 'en';
  const exact = supportedLanguages.find(supported => supported.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  const parts = value.toLowerCase().split('-');
  const base = parts[0];
  if (base === 'zh') {
    const subtags = new Set(parts.slice(1));
    if (subtags.has('hant') || subtags.has('hk') || subtags.has('mo') || subtags.has('tw')) return 'zh-HK';
    return 'zh-CN';
  }

  return supportedLanguages.find(supported => supported === base) ?? 'en';
}

const loadingLocales = new Map<SupportedLanguage, Promise<void>>();

export async function loadLocale(lang: string): Promise<void> {
  const resolved = resolveSupportedLanguage(lang);
  if (i18n.hasResourceBundle(resolved, 'translation')) {
    return;
  }
  const pending = loadingLocales.get(resolved);
  if (pending) {
    return pending;
  }
  const loader = localeLoaders[resolved];
  if (loader) {
    const promise = (async () => {
      try {
        const mod = await loader();
        i18n.addResourceBundle(resolved, 'translation', mod.default, true, true);
        if (i18n.language === resolved) {
          i18n.emit('loaded');
          i18n.emit('languageChanged', resolved);
        }
      } catch (err) {
        console.warn(`[i18n] Failed to load locale "${resolved}":`, err);
      } finally {
        loadingLocales.delete(resolved);
      }
    })();
    loadingLocales.set(resolved, promise);
    return promise;
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: supportedLanguages as unknown as string[],
    nonExplicitSupportedLngs: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'openwa_language',
      caches: ['localStorage'],
      convertDetectedLanguage: (lang: string) => resolveSupportedLanguage(lang),
    },
    react: { useSuspense: false },
  });

function applyDirection(lang: string) {
  const resolved = resolveSupportedLanguage(lang);
  const dir = rtlLanguages.includes(resolved) ? 'rtl' : 'ltr';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = resolved;
    document.documentElement.dir = dir;
  }
}

applyDirection(i18n.language);
void loadLocale(i18n.language);

i18n.on('languageChanged', (lang: string) => {
  applyDirection(lang);
  void loadLocale(lang);
});

export default i18n;
