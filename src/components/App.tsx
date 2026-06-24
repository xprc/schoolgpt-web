import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    Add01Icon,
    ArrowDown01Icon,
    BotIcon,
    Chat01Icon,
    Copy01Icon,
    Edit01Icon,
    Folder01Icon,
    GridIcon,
    HelpCircleIcon,
    Menu01Icon,
    Search01Icon,
    Settings01Icon,
    Share01Icon,
    Tick02Icon,
} from 'hugeicons-react';
import ChatItem from './ChatItem';
import LoginPage from './LoginPage';
import MainChat from './MainChat';
import ProfilePanel from './ProfilePanel';
import SettingsPage from './SettingsPage';
import { DARK_BG, LIGHT_BG } from '../utils/backgrounds';
import {
    ApiRequestError,
    fetchRemoteConversation,
    fetchRemoteConversationList,
    saveRemoteConversation,
    updateRemoteConversationShare,
} from '../utils/apiConversations';
import { ApiAuthError } from '../utils/apiChat';
import {
    getLocalConversation,
    listLocalConversationSummaries,
    saveLocalConversation,
} from '../utils/chatStore';
import { clearAuthSession, getStoredSession, type AuthSession } from '../utils/auth';
import type {
    Conversation,
    ConversationShareScope,
    ConversationSummary,
    Message,
} from '../utils/types';

const defaultConversationTitle = '新对话';
const chatRoutePattern =
    /^\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const readConversationIdFromLocation = (): string | null => {
    const match = window.location.pathname.match(chatRoutePattern);
    return match?.[1] ?? null;
};

const createConversationId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (value) => {
        const numberValue = Number(value);
        const randomValue =
            typeof crypto !== 'undefined' && crypto.getRandomValues
                ? crypto.getRandomValues(new Uint8Array(1))[0]
                : Math.floor(Math.random() * 256);
        return (
            numberValue ^
            (randomValue & (15 >> (numberValue / 4)))
        ).toString(16);
    });
};

const nowIso = (): string => new Date().toISOString();

const timestampMs = (value: string): number => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const deriveConversationTitle = (messages: Message[], fallback = defaultConversationTitle) => {
    const firstUserMessage = messages.find((message) => message.role === 'user');
    const content = firstUserMessage?.content.trim().replace(/\s+/g, ' ');
    return content ? content.slice(0, 60) : fallback;
};

const createEmptyConversation = (conversationId: string, userId: number): Conversation => {
    const createdAt = nowIso();
    return {
        id: conversationId,
        title: defaultConversationTitle,
        ownerUserId: userId,
        shareScope: 'private',
        permission: 'owner',
        canWrite: true,
        createdAt,
        updatedAt: createdAt,
        messages: [],
    };
};

const withMessages = (conversation: Conversation, messages: Message[]): Conversation => {
    return {
        ...conversation,
        title: deriveConversationTitle(messages, conversation.title),
        updatedAt: nowIso(),
        messages,
    };
};

const toSummary = (conversation: Conversation): ConversationSummary => {
    return {
        id: conversation.id,
        title: conversation.title,
        shareScope: conversation.shareScope,
        permission: conversation.permission,
        canWrite: conversation.canWrite,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
    };
};

const mergeSummaries = (
    localSummaries: ConversationSummary[],
    remoteSummaries: ConversationSummary[]
): ConversationSummary[] => {
    const summaries = new Map<string, ConversationSummary>();

    [...localSummaries, ...remoteSummaries].forEach((summary) => {
        const existing = summaries.get(summary.id);
        if (!existing || timestampMs(summary.updatedAt) >= timestampMs(existing.updatedAt)) {
            summaries.set(summary.id, summary);
        }
    });

    return Array.from(summaries.values()).sort(
        (a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt)
    );
};

const upsertSummary = (
    summaries: ConversationSummary[],
    summary: ConversationSummary
): ConversationSummary[] => {
    return mergeSummaries([summary], summaries);
};

export default function App() {
    const { t } = useTranslation();
    const [showSettings, setShowSettings] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [showSharePanel, setShowSharePanel] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
    const [routeConversationId, setRouteConversationId] = useState<string | null>(
        () => readConversationIdFromLocation()
    );
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
    const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [syncError, setSyncError] = useState<string | null>(null);
    const autoCreatedRouteRef = useRef(false);
    const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(
        () => (localStorage.getItem('theme') as 'system' | 'light' | 'dark') || 'system'
    );
    const [lightBg, setLightBg] = useState(
        () => localStorage.getItem('lightBg') || LIGHT_BG[0]
    );
    const [darkBg, setDarkBg] = useState(
        () => localStorage.getItem('darkBg') || DARK_BG[0]
    );
    const [resolvedDark, setResolvedDark] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const navigateToConversation = useCallback((conversationId: string, replace = false) => {
        const nextPath = `/chat/${conversationId}`;
        if (window.location.pathname !== nextPath) {
            if (replace) {
                window.history.replaceState({}, '', nextPath);
            } else {
                window.history.pushState({}, '', nextPath);
            }
        }
        setRouteConversationId(conversationId);
        setShowSettings(false);
        setShowSharePanel(false);
    }, []);

    const handleLogin = useCallback((nextSession: AuthSession) => {
        setSession(nextSession);
    }, []);

    const handleLogout = useCallback(() => {
        clearAuthSession();
        setSession(null);
        setShowProfilePanel(false);
        setShowSettings(false);
        setShowSharePanel(false);
        setCurrentConversation(null);
        setConversationSummaries([]);
        setSyncError(null);
        autoCreatedRouteRef.current = false;
    }, []);

    const refreshConversationList = useCallback(async () => {
        if (!session) {
            setConversationSummaries([]);
            return;
        }

        try {
            const localSummaries = await listLocalConversationSummaries(session.user.id);
            setConversationSummaries(localSummaries);
            const remoteSummaries = await fetchRemoteConversationList();
            setConversationSummaries(mergeSummaries(localSummaries, remoteSummaries));
        } catch (error: unknown) {
            if (error instanceof ApiAuthError) {
                handleLogout();
                return;
            }

            const message = error instanceof Error ? error.message : String(error);
            setSyncError(message);
        }
    }, [handleLogout, session]);

    const handleNewChat = useCallback(() => {
        if (!session) return;

        const conversation = createEmptyConversation(createConversationId(), session.user.id);
        setCurrentConversation(conversation);
        setConversationSummaries((prev) => upsertSummary(prev, toSummary(conversation)));
        void saveLocalConversation(session.user.id, conversation);
        navigateToConversation(conversation.id);
    }, [navigateToConversation, session]);

    const handleOpenConversation = useCallback(
        (conversationId: string) => {
            navigateToConversation(conversationId);
        },
        [navigateToConversation]
    );

    useEffect(() => {
        const handlePopState = () => {
            setRouteConversationId(readConversationIdFromLocation());
            setShowSettings(false);
            setShowSharePanel(false);
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        if (!session || routeConversationId) {
            return;
        }

        if (autoCreatedRouteRef.current) {
            return;
        }

        autoCreatedRouteRef.current = true;
        const conversation = createEmptyConversation(createConversationId(), session.user.id);
        setCurrentConversation(conversation);
        setConversationSummaries((prev) => upsertSummary(prev, toSummary(conversation)));
        void saveLocalConversation(session.user.id, conversation);
        navigateToConversation(conversation.id, true);
    }, [navigateToConversation, routeConversationId, session]);

    useEffect(() => {
        if (!session || !routeConversationId) {
            return;
        }

        let cancelled = false;

        const loadConversation = async () => {
            setSyncError(null);
            const localConversation = await getLocalConversation(
                session.user.id,
                routeConversationId
            );
            const emptyConversation = createEmptyConversation(routeConversationId, session.user.id);

            if (!cancelled) {
                setCurrentConversation(localConversation ?? emptyConversation);
            }

            try {
                const remoteConversation = await fetchRemoteConversation(routeConversationId);
                let nextConversation = remoteConversation;

                if (
                    localConversation &&
                    localConversation.canWrite &&
                    timestampMs(localConversation.updatedAt) > timestampMs(remoteConversation.updatedAt)
                ) {
                    nextConversation = await saveRemoteConversation(localConversation);
                }

                if (!cancelled) {
                    setCurrentConversation(nextConversation);
                    setConversationSummaries((prev) =>
                        upsertSummary(prev, toSummary(nextConversation))
                    );
                }
                await saveLocalConversation(session.user.id, nextConversation);
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                if (error instanceof ApiRequestError && error.status === 404) {
                    if (localConversation) {
                        await saveLocalConversation(session.user.id, localConversation);
                    } else {
                        await saveLocalConversation(session.user.id, emptyConversation);
                    }
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setSyncError(message);
            } finally {
                void refreshConversationList();
            }
        };

        void loadConversation();

        return () => {
            cancelled = true;
        };
    }, [handleLogout, refreshConversationList, routeConversationId, session]);

    useEffect(() => {
        if (!session || !currentConversation) {
            return;
        }

        const timer = window.setTimeout(() => {
            void saveLocalConversation(session.user.id, currentConversation);
            setConversationSummaries((prev) => upsertSummary(prev, toSummary(currentConversation)));
        }, 300);

        return () => window.clearTimeout(timer);
    }, [currentConversation, session]);

    const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>((value) => {
        setCurrentConversation((prev) => {
            if (!prev) {
                return prev;
            }

            const nextMessages = typeof value === 'function' ? value(prev.messages) : value;
            return withMessages(prev, nextMessages);
        });
    }, []);

    const handleMessagesCommitted = useCallback(
        async (messages: Message[]) => {
            if (!session || !currentConversation) {
                return;
            }

            const nextConversation = withMessages(currentConversation, messages);
            setCurrentConversation(nextConversation);
            setConversationSummaries((prev) => upsertSummary(prev, toSummary(nextConversation)));
            await saveLocalConversation(session.user.id, nextConversation);

            if (!nextConversation.canWrite) {
                return;
            }

            try {
                const savedConversation = await saveRemoteConversation(nextConversation);
                setCurrentConversation((prev) =>
                    prev?.id === savedConversation.id ? savedConversation : prev
                );
                setConversationSummaries((prev) => upsertSummary(prev, toSummary(savedConversation)));
                await saveLocalConversation(session.user.id, savedConversation);
                setSyncError(null);
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setSyncError(message);
            }
        },
        [currentConversation, handleLogout, session]
    );

    const handleShareScopeChange = useCallback(
        async (shareScope: ConversationShareScope) => {
            if (!session || !currentConversation || currentConversation.permission !== 'owner') {
                return;
            }

            const optimisticConversation = {
                ...currentConversation,
                shareScope,
                updatedAt: nowIso(),
            };
            setCurrentConversation(optimisticConversation);
            setConversationSummaries((prev) =>
                upsertSummary(prev, toSummary(optimisticConversation))
            );
            await saveLocalConversation(session.user.id, optimisticConversation);

            try {
                const savedConversation = await updateRemoteConversationShare(
                    currentConversation.id,
                    shareScope
                );
                setCurrentConversation(savedConversation);
                setConversationSummaries((prev) => upsertSummary(prev, toSummary(savedConversation)));
                await saveLocalConversation(session.user.id, savedConversation);
                setSyncError(null);
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setSyncError(message);
            }
        },
        [currentConversation, handleLogout, session]
    );

    const shareUrl = currentConversation
        ? `${window.location.origin}/chat/${currentConversation.id}`
        : '';

    const handleCopyShareLink = useCallback(async () => {
        if (!shareUrl) return;

        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 1600);
    }, [shareUrl]);

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

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                e.preventDefault();
                setShowSettings((prev) => !prev);
            }

            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                handleNewChat();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleNewChat]);

    const filteredConversationSummaries = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
            return conversationSummaries;
        }

        return conversationSummaries.filter((summary) =>
            summary.title.toLowerCase().includes(query)
        );
    }, [conversationSummaries, searchQuery]);

    const shareOptions: Array<{ label: string; scope: ConversationShareScope }> = [
        { label: t('sharePrivate'), scope: 'private' },
        { label: t('shareRead'), scope: 'link_read' },
        { label: t('shareWrite'), scope: 'link_write' },
    ];

    const bgToUse = resolvedDark ? darkBg : lightBg;
    const backgroundStyle = {
        backgroundImage: `url("https://images.unsplash.com/${bgToUse}?q=80&w=2000&auto=format&fit=crop")`,
    };
    const topBlendStyle = {
        background: 'linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0))',
        WebkitBackdropFilter: 'blur(12px)',
        backdropFilter: 'blur(12px)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 44%, rgba(0, 0, 0, 0.72) 75%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 44%, rgba(0, 0, 0, 0.72) 75%, transparent 100%)',
    };

    if (!session) {
        return (
            <div
                className="relative isolate min-h-screen w-full overflow-hidden bg-cover bg-center font-sans transition-all duration-500"
                style={backgroundStyle}
            >
                <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"></div>
                <LoginPage onLogin={handleLogin} />
            </div>
        );
    }

    const avatarUrl = `https://i.pravatar.cc/150?u=${encodeURIComponent(session.user.username)}`;

    return (
        <div
            className="relative isolate flex h-screen w-full font-sans overflow-hidden bg-cover bg-center text-white transition-all duration-500"
            style={backgroundStyle}
        >
            <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[72px]"
                style={topBlendStyle}
            ></div>

            <div className="absolute inset-x-0 top-0 h-16 flex items-center px-2 sm:px-4 gap-2 sm:gap-4 z-30">
                <div className="flex items-center gap-2 sm:gap-4 w-auto sm:w-[240px] shrink-0">
                    <button
                        onClick={() => setIsSidebarOpen((prev) => !prev)}
                        className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                    >
                        <Menu01Icon size={20} />
                    </button>
                    <span className="text-lg sm:text-xl font-medium text-white flex items-center gap-2">
                        <div className="w-8 h-8 rounded-sm items-center justify-center hidden sm:flex">
                            <img src="/favicon.ico" />
                        </div>
                        <span className="hidden sm:inline">校园百事通</span>
                    </span>
                </div>

                <div className="flex-1 max-w-3xl">
                    <div className="bg-white/20 hover:bg-white/30 transition-colors rounded-full flex items-center px-3 sm:px-4 py-2 sm:py-2.5">
                        <Search01Icon size={18} className="text-white/70 mr-2 sm:mr-3" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('searchChats')}
                            className="bg-transparent border-none outline-none text-white placeholder-white/70 w-full text-sm sm:text-base"
                        />
                        <Settings01Icon
                            size={18}
                            className="text-white/70 ml-2 sm:ml-3 cursor-pointer hidden sm:block"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-1 sm:gap-2 flex-1">
                    <div className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mr-2">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-sm">{t('online')}</span>
                        <ArrowDown01Icon size={14} className="ml-1" />
                    </div>
                    {currentConversation && (
                        <div className="relative">
                            <button
                                onClick={() => setShowSharePanel((prev) => !prev)}
                                className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                                title={t('share')}
                            >
                                <Share01Icon size={20} />
                            </button>
                            {showSharePanel && (
                                <div className="absolute right-0 top-11 w-72 rounded-2xl border border-white/20 bg-[#151923]/95 p-3 shadow-2xl backdrop-blur-xl">
                                    <div className="px-2 pb-2 text-sm font-semibold text-white">
                                        {t('share')}
                                    </div>
                                    <div className="space-y-1">
                                        {shareOptions.map((option) => (
                                            <button
                                                key={option.scope}
                                                type="button"
                                                disabled={currentConversation.permission !== 'owner'}
                                                onClick={() => handleShareScopeChange(option.scope)}
                                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                                                    currentConversation.shareScope === option.scope
                                                        ? 'bg-white/15 text-white'
                                                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                                                } disabled:cursor-not-allowed disabled:text-white/35 disabled:hover:bg-transparent`}
                                            >
                                                <span>{option.label}</span>
                                                {currentConversation.shareScope === option.scope && (
                                                    <Tick02Icon size={16} />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCopyShareLink}
                                        disabled={currentConversation.shareScope === 'private'}
                                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c2e7ff] px-3 py-2 text-sm font-medium text-[#001d35] transition-colors hover:bg-[#b3dcf5] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                                    >
                                        <Copy01Icon size={16} />
                                        {shareCopied ? t('copied') : t('copyLink')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <button className="p-2 hover:bg-white/10 rounded-full text-white transition-colors hidden sm:block">
                        <HelpCircleIcon size={20} />
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        title="Shortcut: Cmd/Ctrl + ,"
                        className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                    >
                        <Settings01Icon size={20} />
                    </button>
                    <button className="p-2 hover:bg-white/10 rounded-full text-white transition-colors hidden sm:block">
                        <GridIcon size={20} />
                    </button>
                    <button
                        onClick={() => setShowProfilePanel((prev) => !prev)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="rounded-full flex items-center justify-center relative ml-1 sm:ml-2 outline-none"
                    >
                        <img
                            src={avatarUrl}
                            alt="Profile"
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white/20 transition-transform hover:scale-105 object-cover"
                        />
                    </button>
                    {showProfilePanel && (
                        <ProfilePanel
                            user={session.user}
                            onClose={() => setShowProfilePanel(false)}
                            onLogout={handleLogout}
                        />
                    )}
                </div>
            </div>

            <div className="absolute inset-0 flex overflow-hidden z-10 sm:pl-0">
                <div
                    className={`absolute sm:relative z-20 h-full pt-16 bg-[#1a1a1a]/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none flex flex-col shrink-0 transition-all duration-300 ${
                        isSidebarOpen
                            ? 'w-[240px] pr-4 opacity-100 translate-x-0'
                            : 'w-0 pr-0 opacity-0 -translate-x-full sm:translate-x-0 overflow-hidden'
                    }`}
                >
                    <div className="py-3 pl-2">
                        <button
                            onClick={handleNewChat}
                            title="Shortcut: Alt + N"
                            className="bg-[#c2e7ff] text-[#001d35] hover:bg-[#b3dcf5] hover:shadow-md transition-all rounded-2xl py-4 px-6 flex items-center gap-3 font-medium shadow-sm"
                        >
                            <Edit01Icon size={18} />
                            {t('newChat')}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto mt-2 space-y-0.5 custom-scrollbar">
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full bg-white/20 text-white cursor-pointer font-medium">
                            <div className="flex items-center gap-3">
                                <Chat01Icon size={16} />
                                <span className="text-sm">{t('chat')}</span>
                            </div>
                            <span className="text-xs font-bold">{conversationSummaries.length}</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full hover:bg-white/10 text-white/80 hover:text-white cursor-pointer">
                            <div className="flex items-center gap-3">
                                <Folder01Icon size={16} />
                                <span className="text-sm">{t('files')}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full hover:bg-white/10 text-white/80 hover:text-white cursor-pointer">
                            <div className="flex items-center gap-3">
                                <BotIcon size={16} />
                                <span className="text-sm">{t('agent')}</span>
                            </div>
                        </div>

                        <div
                            className="mt-6 mb-2 px-4 flex items-center justify-between group cursor-pointer"
                            onClick={handleNewChat}
                        >
                            <span className="text-sm font-medium text-white/90">
                                {t('chatHistory')}
                            </span>
                            <Add01Icon
                                size={16}
                                className="text-white/70 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                        </div>
                        {filteredConversationSummaries.length === 0 ? (
                            <div className="px-4 py-2 text-sm text-white/55">
                                {syncError ?? t('noConversations')}
                            </div>
                        ) : (
                            filteredConversationSummaries.map((summary) => (
                                <ChatItem
                                    key={summary.id}
                                    text={summary.title || t('newChat')}
                                    active={summary.id === currentConversation?.id}
                                    onClick={() => handleOpenConversation(summary.id)}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="relative flex-1 overflow-hidden flex flex-col text-gray-800 dark:text-gray-200">
                    <div className="relative z-0 flex min-h-0 flex-1 flex-col">
                        {showSettings ? (
                            <div className="flex min-h-0 flex-1 pt-16">
                                <SettingsPage
                                    theme={theme}
                                    setTheme={setTheme}
                                    lightBg={lightBg}
                                    setLightBg={setLightBg}
                                    darkBg={darkBg}
                                    setDarkBg={setDarkBg}
                                    onClose={() => setShowSettings(false)}
                                />
                            </div>
                        ) : currentConversation ? (
                            <MainChat
                                conversationId={currentConversation.id}
                                canWrite={currentConversation.canWrite}
                                messages={currentConversation.messages}
                                setMessages={setMessages}
                                onMessagesCommitted={handleMessagesCommitted}
                                onAuthExpired={handleLogout}
                            />
                        ) : (
                            <div className="flex min-h-0 flex-1 items-center justify-center pt-16 text-white/75">
                                {t('loadingConversation')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
