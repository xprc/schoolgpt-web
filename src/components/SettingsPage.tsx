import { Cancel01Icon } from 'hugeicons-react';
import { useTranslation } from 'react-i18next';
import { DARK_BG, LIGHT_BG } from '../utils/backgrounds';

type SettingsPageProps = {
    theme: 'system' | 'light' | 'dark';
    setTheme: (theme: 'system' | 'light' | 'dark') => void;
    lightBg: string;
    setLightBg: (bg: string) => void;
    darkBg: string;
    setDarkBg: (bg: string) => void;
    onClose: () => void;
};

export default function SettingsPage({
    theme,
    setTheme,
    lightBg,
    setLightBg,
    darkBg,
    setDarkBg,
    onClose
}: SettingsPageProps) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.language?.startsWith('zh') ? 'zh' : 'en';

    const handleLanguageChange = (lang: 'en' | 'zh') => {
        i18n.changeLanguage(lang);
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-[#1a1a1a] overflow-hidden transition-colors duration-200">
            <div className="p-6 border-b border-gray-200/60 dark:border-gray-800/60 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings')}</h2>
                <button
                    onClick={onClose}
                    className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] rounded-full transition-colors"
                >
                    <Cancel01Icon size={20} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
                <div className="max-w-2xl space-y-8">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            {t('language')}
                        </h3>
                        <div className="flex gap-4">
                            <button
                                onClick={() => handleLanguageChange('en')}
                                className={`px-6 py-3 rounded-2xl border font-medium transition-colors ${
                                    currentLanguage === 'en'
                                        ? 'border-[#5b6ef5] bg-[#f0f3ff] text-[#5b6ef5] dark:bg-[#1a1a1a] dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                                }`}
                            >
                                {t('english')}
                            </button>
                            <button
                                onClick={() => handleLanguageChange('zh')}
                                className={`px-6 py-3 rounded-2xl border font-medium transition-colors ${
                                    currentLanguage === 'zh'
                                        ? 'border-[#5b6ef5] bg-[#f0f3ff] text-[#5b6ef5] dark:bg-[#1a1a1a] dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                                }`}
                            >
                                {t('chinese')}
                            </button>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {t('theme')} & {t('background')}
                            </h3>
                            <button
                                onClick={() => setTheme('system')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                                    theme === 'system'
                                        ? 'border-[#5b6ef5] bg-[#f0f3ff] text-[#5b6ef5] dark:bg-[#1a1a1a] dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                                }`}
                            >
                                {t('system')}
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <div className="text-sm font-medium text-gray-500 mb-3">{t('light')}</div>
                                <div className="flex gap-4 flex-wrap">
                                    {LIGHT_BG.map((bg) => (
                                        <button
                                            key={bg}
                                            onClick={() => {
                                                setTheme('light');
                                                setLightBg(bg);
                                            }}
                                            className={`w-32 h-20 rounded-xl border-2 overflow-hidden transition-all ${
                                                theme === 'light' && lightBg === bg
                                                    ? 'border-[#5b6ef5] scale-105 shadow-md'
                                                    : 'border-transparent hover:scale-105'
                                            }`}
                                        >
                                            <img
                                                src={`https://images.unsplash.com/${bg}?q=80&w=400&auto=format&fit=crop`}
                                                alt="Background"
                                                className="w-full h-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="text-sm font-medium text-gray-500 mb-3">{t('dark')}</div>
                                <div className="flex gap-4 flex-wrap">
                                    {DARK_BG.map((bg) => (
                                        <button
                                            key={bg}
                                            onClick={() => {
                                                setTheme('dark');
                                                setDarkBg(bg);
                                            }}
                                            className={`w-32 h-20 rounded-xl border-2 overflow-hidden transition-all ${
                                                theme === 'dark' && darkBg === bg
                                                    ? 'border-[#5b6ef5] scale-105 shadow-md'
                                                    : 'border-transparent hover:scale-105'
                                            }`}
                                        >
                                            <img
                                                src={`https://images.unsplash.com/${bg}?q=80&w=400&auto=format&fit=crop`}
                                                alt="Background"
                                                className="w-full h-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
