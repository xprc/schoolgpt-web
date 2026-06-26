import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
    ArrowDown01Icon,
    GridIcon,
    HelpCircleIcon,
    Settings01Icon,
} from 'hugeicons-react';
import { fetchSetupStatus } from '../utils/apiSetup';
import { clearAuthSession, getStoredSession, type AuthSession } from '../utils/auth';
import { getGravatarAvatarUrl, getGravatarFallbackAvatarUrl } from '../utils/gravatar';
import { useAppearanceSettings, type AppearanceSettings } from '../hooks/useAppearanceSettings';

const FirstRunSetupPage = lazy(() => import('../components/FirstRunSetupPage'));
const LoginPage = lazy(() => import('../components/LoginPage'));
const ProfilePanel = lazy(() => import('../components/ProfilePanel'));

export type RoutePageFrameContext = {
    session: AuthSession;
    onAuthExpired: () => void;
    appearance: AppearanceSettings;
};

type RoutePageFrameProps = {
    children: (context: RoutePageFrameContext) => ReactNode;
};

const PageLoadingFallback = () => (
    <div className="relative z-10 flex min-h-screen w-full items-center justify-center text-sm text-white/75">
        正在加载页面
    </div>
);

export default function RoutePageFrame({ children }: RoutePageFrameProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const appearance = useAppearanceSettings();
    const [setupState, setSetupState] = useState<'checking' | 'required' | 'ready'>('checking');
    const [setupError, setSetupError] = useState<string | null>(null);
    const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
    const [showProfilePanel, setShowProfilePanel] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const checkSetupStatus = async () => {
            try {
                const isConfigured = await fetchSetupStatus();
                if (cancelled) {
                    return;
                }

                setSetupState(isConfigured ? 'ready' : 'required');
                setSetupError(null);
                if (!isConfigured) {
                    clearAuthSession();
                    setSession(null);
                }
            } catch (error: unknown) {
                if (cancelled) {
                    return;
                }

                setSetupState('checking');
                setSetupError(error instanceof Error ? error.message : String(error));
            }
        };

        void checkSetupStatus();

        return () => {
            cancelled = true;
        };
    }, []);

    const avatarUrl = useMemo(() => {
        if (!session) {
            return getGravatarFallbackAvatarUrl('');
        }

        const avatarName = session.user.displayName || session.user.username;
        return getGravatarAvatarUrl(session.user.avatarSha256, avatarName);
    }, [session]);

    const handleSetupComplete = useCallback(() => {
        clearAuthSession();
        setSession(null);
        setSetupState('ready');
        setSetupError(null);
    }, []);

    const handleLogin = useCallback((nextSession: AuthSession) => {
        setSession(nextSession);
    }, []);

    const handleLogout = useCallback(() => {
        clearAuthSession();
        setSession(null);
        setShowProfilePanel(false);
    }, []);

    if (setupState === 'checking') {
        return (
            <div
                className="relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden bg-cover bg-center font-sans text-white transition-all duration-500"
                style={appearance.backgroundStyle}
            >
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"></div>
                <div className="relative z-10 rounded-lg border border-white/25 bg-black/30 px-5 py-4 text-sm shadow-2xl backdrop-blur-xl">
                    {setupError ?? '正在检查首次运行状态'}
                </div>
            </div>
        );
    }

    if (setupState === 'required') {
        return (
            <div
                className="relative isolate min-h-screen w-full overflow-hidden bg-cover bg-center font-sans transition-all duration-500"
                style={appearance.backgroundStyle}
            >
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"></div>
                <Suspense fallback={<PageLoadingFallback />}>
                    <FirstRunSetupPage onSetupComplete={handleSetupComplete} />
                </Suspense>
            </div>
        );
    }

    if (!session) {
        return (
            <div
                className="relative isolate min-h-screen w-full overflow-hidden bg-cover bg-center font-sans transition-all duration-500"
                style={appearance.backgroundStyle}
            >
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"></div>
                <Suspense fallback={<PageLoadingFallback />}>
                    <LoginPage onLogin={handleLogin} />
                </Suspense>
            </div>
        );
    }

    return (
        <div
            className="relative isolate flex h-screen w-full overflow-hidden bg-cover bg-center font-sans text-white transition-all duration-500"
            style={appearance.backgroundStyle}
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[72px]"
                style={appearance.topBlendStyle}
            ></div>

            <div className="absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-2 px-2 sm:gap-4 sm:px-4">
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-lg font-medium text-white transition-colors hover:bg-white/10 sm:gap-3 sm:text-xl"
                    title="返回首页"
                >
                    <span className="hidden h-8 w-8 items-center justify-center rounded-sm sm:flex">
                        <img src="/favicon.ico" alt="" />
                    </span>
                    <span className="hidden sm:inline">校园百事通</span>
                </button>

                <div className="flex-1"></div>

                <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
                    <div className="mr-2 hidden items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 lg:flex">
                        <div className="h-2 w-2 rounded-full bg-green-400"></div>
                        <span className="text-sm">{t('online')}</span>
                        <ArrowDown01Icon size={14} className="ml-1" />
                    </div>
                    <button className="hidden rounded-full p-2 text-white transition-colors hover:bg-white/10 sm:block">
                        <HelpCircleIcon size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/settings')}
                        title="Shortcut: Cmd/Ctrl + ,"
                        className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
                    >
                        <Settings01Icon size={20} />
                    </button>
                    {session.user.userType === 'admin' && (
                        <button
                            type="button"
                            onClick={() => navigate('/admin')}
                            title="Admin 管理中心"
                            className="hidden rounded-full p-2 text-white transition-colors hover:bg-white/10 sm:block"
                        >
                            <GridIcon size={20} />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setShowProfilePanel((prev) => !prev)}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="relative ml-1 flex items-center justify-center rounded-full outline-none sm:ml-2"
                    >
                        <img
                            src={avatarUrl}
                            alt="Profile"
                            className="h-7 w-7 rounded-full border border-white/20 object-cover transition-transform hover:scale-105 sm:h-8 sm:w-8"
                        />
                    </button>
                    {showProfilePanel && (
                        <Suspense fallback={null}>
                            <ProfilePanel
                                user={session.user}
                                onClose={() => setShowProfilePanel(false)}
                                onLogout={handleLogout}
                            />
                        </Suspense>
                    )}
                </div>
            </div>

            <main className="absolute inset-0 z-10 flex min-h-0 overflow-hidden pt-16 text-gray-800 dark:text-gray-200">
                {children({
                    session,
                    onAuthExpired: handleLogout,
                    appearance,
                })}
            </main>
        </div>
    );
}
