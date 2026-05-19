import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import zh from '../locales/zh.json';

const savedLanguage = localStorage.getItem('language') || navigator.language || 'en';
const initialLanguage = savedLanguage.startsWith('zh') ? 'zh' : 'en';

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        zh: { translation: zh }
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false
    },
    react: {
        useSuspense: false
    }
});

i18n.on('languageChanged', (lng: string) => {
    const normalized = lng.startsWith('zh') ? 'zh' : 'en';
    localStorage.setItem('language', normalized);
    document.documentElement.lang = normalized;
});

document.documentElement.lang = initialLanguage;

export default i18n;
