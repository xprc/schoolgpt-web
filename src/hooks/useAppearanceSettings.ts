import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { DARK_BG, LIGHT_BG, normalizeBackground } from '../utils/backgrounds';

export type AppTheme = 'system' | 'light' | 'dark';

export type AppearanceSettings = {
    theme: AppTheme;
    setTheme: Dispatch<SetStateAction<AppTheme>>;
    lightBg: string;
    setLightBg: Dispatch<SetStateAction<string>>;
    darkBg: string;
    setDarkBg: Dispatch<SetStateAction<string>>;
    resolvedDark: boolean;
    backgroundStyle: CSSProperties;
    topBlendStyle: CSSProperties;
};

type UserAppearancePreferences = {
    lightBackground?: string;
    darkBackground?: string;
};

export const useAppearanceSettings = (
    preferences?: UserAppearancePreferences | null
): AppearanceSettings => {
    const [theme, setTheme] = useState<AppTheme>(
        () => (localStorage.getItem('theme') as AppTheme) || 'system'
    );
    const [lightBg, setLightBg] = useState(
        () => normalizeBackground(
            preferences?.lightBackground ?? localStorage.getItem('lightBg'),
            LIGHT_BG[0]
        )
    );
    const [darkBg, setDarkBg] = useState(
        () => normalizeBackground(
            preferences?.darkBackground ?? localStorage.getItem('darkBg'),
            DARK_BG[0]
        )
    );
    const [resolvedDark, setResolvedDark] = useState(false);

    useEffect(() => {
        const lightBackground = preferences?.lightBackground;
        if (lightBackground) {
            const timerId = window.setTimeout(() => {
                setLightBg(normalizeBackground(lightBackground, LIGHT_BG[0]));
            }, 0);

            return () => {
                window.clearTimeout(timerId);
            };
        }
    }, [preferences?.lightBackground]);

    useEffect(() => {
        const darkBackground = preferences?.darkBackground;
        if (darkBackground) {
            const timerId = window.setTimeout(() => {
                setDarkBg(normalizeBackground(darkBackground, DARK_BG[0]));
            }, 0);

            return () => {
                window.clearTimeout(timerId);
            };
        }
    }, [preferences?.darkBackground]);

    useEffect(() => {
        localStorage.setItem('lightBg', lightBg);
    }, [lightBg]);

    useEffect(() => {
        localStorage.setItem('darkBg', darkBg);
    }, [darkBg]);

    useEffect(() => {
        localStorage.setItem('theme', theme);

        const applyTheme = () => {
            const root = document.documentElement;

            if (theme === 'dark') {
                root.classList.add('dark');
                setResolvedDark(true);
                return;
            }

            if (theme === 'light') {
                root.classList.remove('dark');
                setResolvedDark(false);
                return;
            }

            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                root.classList.add('dark');
                setResolvedDark(true);
            } else {
                root.classList.remove('dark');
                setResolvedDark(false);
            }
        };

        applyTheme();

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => applyTheme();
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
    }, [theme]);

    const bgToUse = resolvedDark ? darkBg : lightBg;
    const backgroundStyle = useMemo<CSSProperties>(() => ({
        backgroundImage: `url("${bgToUse}")`,
    }), [bgToUse]);
    const topBlendStyle = useMemo<CSSProperties>(() => ({
        background: 'linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0))',
        WebkitBackdropFilter: 'blur(12px)',
        backdropFilter: 'blur(12px)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 44%, rgba(0, 0, 0, 0.72) 75%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 44%, rgba(0, 0, 0, 0.72) 75%, transparent 100%)',
    }), []);

    return {
        theme,
        setTheme,
        lightBg,
        setLightBg,
        darkBg,
        setDarkBg,
        resolvedDark,
        backgroundStyle,
        topBlendStyle,
    };
};
