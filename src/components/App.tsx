import {
    Suspense,
    lazy,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
    Add01Icon,
    ArrowDown01Icon,
    BotIcon,
    Cancel01Icon,
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
import {
    ApiRequestError,
    continueRemoteSharedConversation,
    deleteRemoteConversation,
    fetchRemoteConversation,
    fetchRemoteConversationList,
    renameRemoteConversation,
    saveRemoteConversation,
    updateRemoteConversationPin,
    updateRemoteConversationShare,
} from '../utils/apiConversations';
import { ApiAuthError } from '../utils/apiChat';
import {
    deleteLocalConversation,
    deleteLocalConversationsNotInRemote,
    getLocalConversation,
    saveLocalConversation,
} from '../utils/chatStore';
import { getGravatarAvatarUrl, getGravatarFallbackAvatarUrl } from '../utils/gravatar';
import { clearAuthSession, getStoredSession, type AuthSession } from '../utils/auth';
import { fetchSetupStatus } from '../utils/apiSetup';
import { useAppearanceSettings } from '../hooks/useAppearanceSettings';
import type {
    Conversation,
    ConversationShareScope,
    ConversationSummary,
    Message,
    RagSource,
} from '../utils/types';
import type { RagFileOpenRequest } from './RagFileBrowser';

const FirstRunSetupPage = lazy(() => import('./FirstRunSetupPage'));
const LoginPage = lazy(() => import('./LoginPage'));
const MainChat = lazy(() => import('./MainChat'));
const ProfilePanel = lazy(() => import('./ProfilePanel'));
const RagFileBrowser = lazy(() => import('./RagFileBrowser'));

const defaultConversationTitle = '新对话';
const draftConversationId = '';
const chatRouteIdPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isConversationRouteId = (value: string | undefined): value is string => {
    return Boolean(value && chatRouteIdPattern.test(value));
};

const PageLoadingFallback = () => (
    <div className="relative z-10 flex min-h-screen w-full items-center justify-center text-sm text-white/75">
        正在加载页面
    </div>
);

const ContentLoadingFallback = () => (
    <div className="flex min-h-0 flex-1 items-center justify-center pt-16 text-white/75">
        正在加载页面
    </div>
);

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

const timestampMs = (value: string | null): number => {
    if (!value) {
        return 0;
    }

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
        isPinned: false,
        pinnedAt: null,
        isVisible: true,
        createdAt,
        updatedAt: createdAt,
        messages: [],
    };
};

const withMessages = (conversation: Conversation, messages: Message[]): Conversation => {
    const shouldDeriveTitle =
        !conversation.title.trim() || conversation.title === defaultConversationTitle;

    return {
        ...conversation,
        title: shouldDeriveTitle
            ? deriveConversationTitle(messages, conversation.title)
            : conversation.title,
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
        isPinned: conversation.isPinned,
        pinnedAt: conversation.pinnedAt,
        isVisible: conversation.isVisible,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
    };
};

const sortConversationSummaries = (
    summaries: ConversationSummary[]
): ConversationSummary[] => {
    return [...summaries].sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
            return a.isPinned ? -1 : 1;
        }

        const aTime = a.isPinned ? timestampMs(a.pinnedAt) : timestampMs(a.updatedAt);
        const bTime = b.isPinned ? timestampMs(b.pinnedAt) : timestampMs(b.updatedAt);
        return bTime - aTime;
    });
};

const upsertSummary = (
    summaries: ConversationSummary[],
    summary: ConversationSummary
): ConversationSummary[] => {
    return sortConversationSummaries(
        [
            summary,
            ...summaries.filter((existingSummary) => existingSummary.id !== summary.id),
        ].filter((nextSummary) => nextSummary.isVisible !== false)
    );
};

export default function App() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { conversationId } = useParams<{ conversationId: string }>();
    const routeConversationId = isConversationRouteId(conversationId) ? conversationId : null;
    const isDraftRoute = location.pathname === '/';
    const isShareRoute = location.pathname.startsWith('/share/');
    const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
    const { backgroundStyle, topBlendStyle } = useAppearanceSettings(session?.user);
    const [setupState, setSetupState] = useState<'checking' | 'required' | 'ready'>('checking');
    const [setupError, setSetupError] = useState<string | null>(null);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);
    const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
    const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [conversationSearchResults, setConversationSearchResults] = useState<ConversationSummary[] | null>(null);
    const [isConversationSearchLoading, setIsConversationSearchLoading] = useState(false);
    const [conversationSearchError, setConversationSearchError] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
    const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const clientCreatedConversationIdsRef = useRef(new Set<string>());
    const [avatarUrl, setAvatarUrl] = useState(() => getGravatarFallbackAvatarUrl(''));
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
    const [ragFileOpenRequest, setRagFileOpenRequest] = useState<RagFileOpenRequest | null>(null);

    useEffect(() => {
        if (session?.user.preferredLanguage) {
            void i18n.changeLanguage(session.user.preferredLanguage);
        }
    }, [i18n, session?.user.preferredLanguage]);

    const upsertConversationSummaryState = useCallback((summary: ConversationSummary) => {
        setConversationSummaries((prev) => upsertSummary(prev, summary));
        setConversationSearchResults((prev) => {
            if (prev === null || !prev.some((existingSummary) => existingSummary.id === summary.id)) {
                return prev;
            }

            return upsertSummary(prev, summary);
        });
    }, []);

    const removeConversationSummaryState = useCallback((conversationId: string) => {
        setConversationSummaries((prev) =>
            prev.filter((summary) => summary.id !== conversationId)
        );
        setConversationSearchResults((prev) =>
            prev === null
                ? prev
                : prev.filter((summary) => summary.id !== conversationId)
        );
    }, []);

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

    const handleSetupComplete = useCallback(() => {
        clearAuthSession();
        setSession(null);
        setSetupState('ready');
        setSetupError(null);
    }, []);

    const navigateToConversation = useCallback((nextConversationId: string, replace = false) => {
        navigate(`/chat/${nextConversationId}`, { replace });
        setOpenConversationMenuId(null);
        setRenamingConversationId(null);
    }, [navigate]);

    const navigateToDraftConversation = useCallback((replace = false) => {
        navigate('/', { replace });
        setOpenConversationMenuId(null);
        setRenamingConversationId(null);
    }, [navigate]);

    const handleLogin = useCallback((nextSession: AuthSession) => {
        setSession(nextSession);
    }, []);

    const handleLogout = useCallback(() => {
        clearAuthSession();
        setSession(null);
        setShowProfilePanel(false);
        setIsSharePanelOpen(false);
        setOpenConversationMenuId(null);
        setRenamingConversationId(null);
        setCurrentConversation(null);
        setConversationSummaries([]);
        setConversationSearchResults(null);
        setConversationSearchError(null);
        setIsConversationSearchLoading(false);
        setSearchQuery('');
        setDebouncedSearchQuery('');
        setSyncError(null);
        setIsFileBrowserOpen(false);
        setRagFileOpenRequest(null);
        clientCreatedConversationIdsRef.current.clear();
    }, []);

    const handleOpenFiles = useCallback(() => {
        setRagFileOpenRequest({
            nonce: Date.now(),
        });
        setIsFileBrowserOpen(true);
        setIsSidebarOpen(false);
    }, []);

    const handleOpenRagSource = useCallback((source: RagSource) => {
        if (typeof source.fileId !== 'number') {
            return;
        }

        setRagFileOpenRequest({
            fileId: source.fileId,
            chunkIndex: source.chunkIndex ?? null,
            pageNumber: source.pageNumber ?? null,
            snippet: source.snippet,
            nonce: Date.now(),
        });
        setIsFileBrowserOpen(true);
    }, []);

    const refreshConversationList = useCallback(async () => {
        if (setupState !== 'ready') {
            setConversationSummaries([]);
            setConversationSearchResults(null);
            setConversationSearchError(null);
            setIsConversationSearchLoading(false);
            return;
        }

        if (!session) {
            setConversationSummaries([]);
            setConversationSearchResults(null);
            setConversationSearchError(null);
            setIsConversationSearchLoading(false);
            return;
        }

        try {
            setSyncError(null);
            const remoteSummaries = await fetchRemoteConversationList();
            const visibleRemoteSummaries = sortConversationSummaries(
                remoteSummaries.filter((summary) => summary.isVisible !== false)
            );
            await deleteLocalConversationsNotInRemote(
                session.user.id,
                new Set(visibleRemoteSummaries.map((summary) => summary.id))
            );
            setConversationSummaries(visibleRemoteSummaries);
        } catch (error: unknown) {
            if (error instanceof ApiAuthError) {
                handleLogout();
                return;
            }

            const message = error instanceof Error ? error.message : String(error);
            setSyncError(message);
        }
    }, [handleLogout, session, setupState]);

    useEffect(() => {
        void refreshConversationList();
    }, [refreshConversationList]);

    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 250);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [searchQuery]);

    useEffect(() => {
        const query = debouncedSearchQuery.trim();
        if (!query) {
            setConversationSearchResults(null);
            setConversationSearchError(null);
            setIsConversationSearchLoading(false);
            return;
        }

        if (setupState !== 'ready' || !session) {
            setConversationSearchResults(null);
            setIsConversationSearchLoading(false);
            return;
        }

        let cancelled = false;
        setIsConversationSearchLoading(true);
        setConversationSearchError(null);

        const searchConversations = async () => {
            try {
                const remoteSummaries = await fetchRemoteConversationList(query);
                const visibleRemoteSummaries = sortConversationSummaries(
                    remoteSummaries.filter((summary) => summary.isVisible !== false)
                );

                if (!cancelled) {
                    setConversationSearchResults(visibleRemoteSummaries);
                }
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                if (!cancelled) {
                    const message = error instanceof Error ? error.message : String(error);
                    setConversationSearchError(message);
                    setConversationSearchResults([]);
                }
            } finally {
                if (!cancelled) {
                    setIsConversationSearchLoading(false);
                }
            }
        };

        void searchConversations();

        return () => {
            cancelled = true;
        };
    }, [debouncedSearchQuery, handleLogout, session, setupState]);

    useEffect(() => {
        if (!session) {
            setAvatarUrl(getGravatarFallbackAvatarUrl(''));
            return;
        }

        const avatarName = session.user.displayName || session.user.username;
        setAvatarUrl(getGravatarAvatarUrl(session.user.avatarSha256, avatarName));
    }, [session]);

    const handleNewChat = useCallback(() => {
        if (!session) return;

        setCurrentConversation(createEmptyConversation(draftConversationId, session.user.id));
        navigateToDraftConversation();
    }, [navigateToDraftConversation, session]);

    const handleOpenConversation = useCallback(
        (conversationId: string) => {
            navigateToConversation(conversationId);
        },
        [navigateToConversation]
    );

    useEffect(() => {
        if (conversationId && !isConversationRouteId(conversationId)) {
            navigate('/', { replace: true });
        }
    }, [conversationId, navigate]);

    useEffect(() => {
        setOpenConversationMenuId(null);
        setRenamingConversationId(null);
        setIsSharePanelOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!openConversationMenuId) {
            return;
        }

        const handlePointerDown = () => {
            setOpenConversationMenuId(null);
        };

        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [openConversationMenuId]);

    useEffect(() => {
        if (setupState !== 'ready' || !session || routeConversationId || !isDraftRoute) {
            return;
        }

        setCurrentConversation((prev) =>
            prev && prev.id === draftConversationId
                ? prev
                : createEmptyConversation(draftConversationId, session.user.id)
        );
    }, [isDraftRoute, routeConversationId, session, setupState]);

    useEffect(() => {
        if (setupState !== 'ready' || !session || !routeConversationId) {
            return;
        }

        if (clientCreatedConversationIdsRef.current.has(routeConversationId)) {
            clientCreatedConversationIdsRef.current.delete(routeConversationId);
            return;
        }

        let cancelled = false;

        const loadConversation = async () => {
            setSyncError(null);
            const localConversation = isShareRoute
                ? null
                : await getLocalConversation(
                    session.user.id,
                    routeConversationId
                );
            const emptyConversation = createEmptyConversation(routeConversationId, session.user.id);

            if (!cancelled) {
                setCurrentConversation(isShareRoute ? null : localConversation ?? emptyConversation);
            }

            try {
                const remoteConversation = await fetchRemoteConversation(routeConversationId);
                let nextConversation = remoteConversation;

                if (
                    !isShareRoute &&
                    localConversation &&
                    localConversation.canWrite &&
                    timestampMs(localConversation.updatedAt) > timestampMs(remoteConversation.updatedAt)
                ) {
                    nextConversation = await saveRemoteConversation(localConversation);
                }

                if (!cancelled) {
                    setCurrentConversation(nextConversation);
                    if (!isShareRoute) {
                        upsertConversationSummaryState(toSummary(nextConversation));
                    }
                }
                if (!isShareRoute) {
                    await saveLocalConversation(session.user.id, nextConversation);
                }
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                if (error instanceof ApiRequestError && error.status === 404) {
                    await deleteLocalConversation(session.user.id, routeConversationId);
                    if (!cancelled) {
                        removeConversationSummaryState(routeConversationId);
                        setCurrentConversation(
                            createEmptyConversation(draftConversationId, session.user.id)
                        );
                        navigateToDraftConversation(true);
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
    }, [
        handleLogout,
        isShareRoute,
        navigateToDraftConversation,
        refreshConversationList,
        removeConversationSummaryState,
        routeConversationId,
        session,
        setupState,
        upsertConversationSummaryState,
    ]);

    useEffect(() => {
        if (
            setupState !== 'ready' ||
            !session ||
            !currentConversation ||
            isShareRoute ||
            currentConversation.id === draftConversationId
        ) {
            return;
        }

        const timer = window.setTimeout(() => {
            void saveLocalConversation(session.user.id, currentConversation);
        }, 300);

        return () => window.clearTimeout(timer);
    }, [currentConversation, isShareRoute, session, setupState]);

    const setMessages = useCallback<Dispatch<SetStateAction<Message[]>>>((value) => {
        setCurrentConversation((prev) => {
            if (!prev) {
                return prev;
            }

            const nextMessages = typeof value === 'function' ? value(prev.messages) : value;
            return withMessages(prev, nextMessages);
        });
    }, []);

    const ensureCurrentConversationId = useCallback(() => {
        if (!session || !currentConversation) {
            return null;
        }

        if (currentConversation.id !== draftConversationId) {
            return currentConversation.id;
        }

        const conversation = createEmptyConversation(createConversationId(), session.user.id);
        clientCreatedConversationIdsRef.current.add(conversation.id);
        setCurrentConversation(withMessages(conversation, currentConversation.messages));
        navigateToConversation(conversation.id, true);
        return conversation.id;
    }, [currentConversation, navigateToConversation, session]);

    const handleMessagesCommitted = useCallback(
        async (conversationId: string, messages: Message[]) => {
            if (!session) {
                return;
            }

            const baseConversation =
                currentConversation?.id === conversationId
                    ? currentConversation
                    : createEmptyConversation(conversationId, session.user.id);
            const nextConversation = withMessages(baseConversation, messages);
            setCurrentConversation(nextConversation);
            await saveLocalConversation(session.user.id, nextConversation);

            if (!nextConversation.canWrite) {
                return;
            }

            try {
                const savedConversation = await saveRemoteConversation(nextConversation);
                setCurrentConversation((prev) =>
                    prev?.id === savedConversation.id ? savedConversation : prev
                );
                upsertConversationSummaryState(toSummary(savedConversation));
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
        [currentConversation, handleLogout, session, upsertConversationSummaryState]
    );

    const saveConversationMetadataLocally = useCallback(
        async (
            conversationId: string,
            patch: Partial<
                Pick<
                    Conversation,
                    'title' | 'isPinned' | 'pinnedAt' | 'isVisible' | 'updatedAt'
                >
            >
        ) => {
            if (!session) {
                return;
            }

            const localConversation =
                currentConversation?.id === conversationId
                    ? currentConversation
                    : await getLocalConversation(session.user.id, conversationId);

            if (!localConversation) {
                return;
            }

            await saveLocalConversation(session.user.id, {
                ...localConversation,
                ...patch,
            });
        },
        [currentConversation, session]
    );

    const commitRemoteConversation = useCallback(
        async (conversation: Conversation) => {
            if (!session) {
                return;
            }

            setCurrentConversation((prev) =>
                prev?.id === conversation.id ? conversation : prev
            );
            upsertConversationSummaryState(toSummary(conversation));
            await saveLocalConversation(session.user.id, conversation);
        },
        [session, upsertConversationSummaryState]
    );

    const removeMissingRemoteConversation = useCallback(
        async (conversationId: string) => {
            if (!session) {
                return;
            }

            await deleteLocalConversation(session.user.id, conversationId);
            removeConversationSummaryState(conversationId);

            if (currentConversation?.id === conversationId || routeConversationId === conversationId) {
                setCurrentConversation(createEmptyConversation(draftConversationId, session.user.id));
                navigateToDraftConversation(true);
            }
        },
        [
            currentConversation?.id,
            navigateToDraftConversation,
            removeConversationSummaryState,
            routeConversationId,
            session,
        ]
    );

    const handleShareScopeChange = useCallback(
        async (shareScope: ConversationShareScope) => {
            if (
                !session ||
                !currentConversation ||
                currentConversation.id === draftConversationId ||
                currentConversation.permission !== 'owner'
            ) {
                return;
            }

            const optimisticConversation = {
                ...currentConversation,
                shareScope,
                updatedAt: nowIso(),
            };
            setCurrentConversation(optimisticConversation);
            await saveLocalConversation(session.user.id, optimisticConversation);

            try {
                const savedConversation = await updateRemoteConversationShare(
                    currentConversation.id,
                    shareScope
                );
                setCurrentConversation(savedConversation);
                upsertConversationSummaryState(toSummary(savedConversation));
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
        [currentConversation, handleLogout, session, upsertConversationSummaryState]
    );

    const handleContinueSharedConversation = useCallback(async () => {
        if (
            !session ||
            !currentConversation ||
            !isShareRoute ||
            currentConversation.id === draftConversationId ||
            currentConversation.shareScope !== 'link_write'
        ) {
            return;
        }

        try {
            const savedConversation = await continueRemoteSharedConversation(currentConversation.id);
            setCurrentConversation(savedConversation);
            upsertConversationSummaryState(toSummary(savedConversation));
            await saveLocalConversation(session.user.id, savedConversation);
            setSyncError(null);
            setIsSharePanelOpen(false);
            navigateToConversation(savedConversation.id, true);
            void refreshConversationList();
        } catch (error: unknown) {
            if (error instanceof ApiAuthError) {
                handleLogout();
                return;
            }

            const message = error instanceof Error ? error.message : String(error);
            setSyncError(message);
        }
    }, [
        currentConversation,
        handleLogout,
        isShareRoute,
        navigateToConversation,
        refreshConversationList,
        session,
        upsertConversationSummaryState,
    ]);

    const handleStartRenameConversation = useCallback(
        (summary: ConversationSummary) => {
            if (summary.permission !== 'owner') {
                return;
            }

            setRenameDraft(summary.title || t('newChat'));
            setRenamingConversationId(summary.id);
            setOpenConversationMenuId(null);
        },
        [t]
    );

    const handleCancelRenameConversation = useCallback(() => {
        setRenamingConversationId(null);
        setRenameDraft('');
    }, []);

    const handleRenameConversation = useCallback(
        async (summary: ConversationSummary) => {
            if (!session || summary.permission !== 'owner') {
                return;
            }

            const title = renameDraft.trim() || defaultConversationTitle;
            const updatedAt = nowIso();

            setRenamingConversationId(null);
            setRenameDraft('');
            setCurrentConversation((prev) =>
                prev?.id === summary.id ? { ...prev, title, updatedAt } : prev
            );
            await saveConversationMetadataLocally(summary.id, { title, updatedAt });

            try {
                const savedConversation = await renameRemoteConversation(summary.id, title);
                await commitRemoteConversation(savedConversation);
                setSyncError(null);
            } catch (error: unknown) {
                if (error instanceof ApiRequestError && error.status === 404) {
                    await removeMissingRemoteConversation(summary.id);
                    setSyncError(null);
                    return;
                }

                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setSyncError(message);
            }
        },
        [
            commitRemoteConversation,
            handleLogout,
            renameDraft,
            removeMissingRemoteConversation,
            saveConversationMetadataLocally,
            session,
        ]
    );

    const handleToggleConversationPin = useCallback(
        async (summary: ConversationSummary) => {
            if (!session || summary.permission !== 'owner') {
                return;
            }

            const nextPinned = !summary.isPinned;
            const updatedAt = nowIso();
            const optimisticSummary: ConversationSummary = {
                ...summary,
                isPinned: nextPinned,
                pinnedAt: nextPinned ? updatedAt : null,
                updatedAt,
            };

            setOpenConversationMenuId(null);
            setCurrentConversation((prev) =>
                prev?.id === summary.id
                    ? {
                        ...prev,
                        isPinned: optimisticSummary.isPinned,
                        pinnedAt: optimisticSummary.pinnedAt,
                        updatedAt,
                    }
                    : prev
            );
            await saveConversationMetadataLocally(summary.id, {
                isPinned: optimisticSummary.isPinned,
                pinnedAt: optimisticSummary.pinnedAt,
                updatedAt,
            });

            try {
                const savedConversation = await updateRemoteConversationPin(
                    summary.id,
                    nextPinned
                );
                await commitRemoteConversation(savedConversation);
                setSyncError(null);
            } catch (error: unknown) {
                if (error instanceof ApiRequestError && error.status === 404) {
                    await removeMissingRemoteConversation(summary.id);
                    setSyncError(null);
                    return;
                }

                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setSyncError(message);
            }
        },
        [
            commitRemoteConversation,
            handleLogout,
            removeMissingRemoteConversation,
            saveConversationMetadataLocally,
            session,
        ]
    );

    const handleDeleteConversation = useCallback(
        async (summary: ConversationSummary) => {
            if (!session || summary.permission !== 'owner') {
                return;
            }

            const confirmed = window.confirm(
                t('deleteConversationConfirm', { title: summary.title || t('newChat') })
            );
            if (!confirmed) {
                return;
            }

            setOpenConversationMenuId(null);
            setRenamingConversationId(null);
            removeConversationSummaryState(summary.id);
            await deleteLocalConversation(session.user.id, summary.id);

            if (currentConversation?.id === summary.id || routeConversationId === summary.id) {
                setCurrentConversation(createEmptyConversation(draftConversationId, session.user.id));
                navigateToDraftConversation(true);
            }

            try {
                await deleteRemoteConversation(summary.id);
                setSyncError(null);
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    handleLogout();
                    return;
                }

                if (error instanceof ApiRequestError && error.status === 404) {
                    setSyncError(null);
                    return;
                }

                const message = error instanceof Error ? error.message : String(error);
                setSyncError(message);
                void refreshConversationList();
            }
        },
        [
            currentConversation?.id,
            handleLogout,
            navigateToDraftConversation,
            removeConversationSummaryState,
            refreshConversationList,
            routeConversationId,
            session,
            t,
        ]
    );

    const shareUrl = currentConversation && currentConversation.id !== draftConversationId
        ? `${window.location.origin}/share/${currentConversation.id}`
        : '';

    const handleShareButtonClick = useCallback(() => {
        if (!currentConversation || currentConversation.id === draftConversationId) {
            return;
        }

        setShowProfilePanel(false);
        setOpenConversationMenuId(null);
        setShareCopied(false);
        setIsSharePanelOpen((prev) => !prev);
    }, [currentConversation]);

    const handleCopyShareLink = useCallback(async () => {
        if (!shareUrl) return;

        await navigator.clipboard.writeText(shareUrl);
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 1600);
    }, [shareUrl]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                e.preventDefault();
                navigate('/settings');
            }

            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                handleNewChat();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleNewChat, navigate]);

    const activeSearchQuery = searchQuery.trim();
    const filteredConversationSummaries = useMemo(() => {
        const visibleSummaries = conversationSummaries.filter(
            (summary) => summary.isVisible !== false
        );
        const query = activeSearchQuery.toLowerCase();
        if (!query) {
            return visibleSummaries;
        }

        if (
            conversationSearchResults !== null
            && debouncedSearchQuery.trim().toLowerCase() === query
        ) {
            return conversationSearchResults;
        }

        return visibleSummaries.filter((summary) =>
            summary.title.toLowerCase().includes(query)
        );
    }, [
        activeSearchQuery,
        conversationSearchResults,
        conversationSummaries,
        debouncedSearchQuery,
    ]);

    const conversationListEmptyMessage = activeSearchQuery
        ? isConversationSearchLoading
            ? t('searchingConversations')
            : conversationSearchError ?? t('noSearchResults')
        : syncError ?? t('noConversations');

    const shareOptions: Array<{ label: string; scope: ConversationShareScope }> = [
        { label: t('sharePrivate'), scope: 'private' },
        { label: t('shareRead'), scope: 'link_read' },
        { label: t('shareWrite'), scope: 'link_write' },
    ];
    const canManageCurrentConversationShare =
        currentConversation !== null &&
        currentConversation.id !== draftConversationId &&
        currentConversation.permission === 'owner';
    const canContinueCurrentShare =
        isShareRoute &&
        currentConversation !== null &&
        currentConversation.id !== draftConversationId &&
        currentConversation.permission !== 'owner' &&
        currentConversation.shareScope === 'link_write';

    if (setupState === 'checking') {
        return (
            <div
                className="relative isolate flex min-h-screen w-full items-center justify-center overflow-hidden bg-cover bg-center font-sans text-white transition-all duration-500"
                style={backgroundStyle}
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
                style={backgroundStyle}
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
                style={backgroundStyle}
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
                        {activeSearchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                                title={t('clearSearch')}
                            >
                                <Cancel01Icon size={15} />
                            </button>
                        )}
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
                    {canContinueCurrentShare && (
                        <button
                            type="button"
                            onClick={handleContinueSharedConversation}
                            className="flex h-10 items-center gap-2 rounded-full bg-[#c2e7ff] px-3 text-sm font-medium text-[#001d35] transition-colors hover:bg-[#b3dcf5]"
                        >
                            <Edit01Icon size={17} />
                            <span className="hidden sm:inline">{t('continueConversation')}</span>
                        </button>
                    )}
                    {canManageCurrentConversationShare && currentConversation && (
                        <div className="relative">
                            <button
                                onClick={handleShareButtonClick}
                                className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                                title={t('share')}
                            >
                                <Share01Icon size={20} />
                            </button>
                            {isSharePanelOpen && (
                                <div className="absolute right-0 top-11 w-72 rounded-2xl border border-white/20 bg-[#151923]/95 p-3 shadow-2xl backdrop-blur-xl">
                                    <div className="px-2 pb-2 text-sm font-semibold text-white">
                                        {t('share')}
                                    </div>
                                    <div className="space-y-1">
                                        {shareOptions.map((option) => (
                                            <button
                                                key={option.scope}
                                                type="button"
                                                onClick={() => handleShareScopeChange(option.scope)}
                                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                                                    currentConversation.shareScope === option.scope
                                                        ? 'bg-white/15 text-white'
                                                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                                                }`}
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
                        type="button"
                        onClick={() => {
                            setShowProfilePanel(false);
                            navigate('/settings');
                        }}
                        title="Shortcut: Cmd/Ctrl + ,"
                        className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                    >
                        <Settings01Icon size={20} />
                    </button>
                    {session.user.userType === 'admin' && (
                        <button
                            type="button"
                            onClick={() => {
                                setShowProfilePanel(false);
                                navigate('/admin');
                            }}
                            title="Admin 管理中心"
                            className="p-2 hover:bg-white/10 rounded-full text-white transition-colors hidden sm:block"
                        >
                            <GridIcon size={20} />
                        </button>
                    )}
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

            <div className="absolute inset-0 flex overflow-hidden z-10 sm:pl-0">
                <button
                    type="button"
                    aria-label="Close sidebar"
                    onClick={() => setIsSidebarOpen(false)}
                    className={`absolute inset-0 z-10 bg-black/15 transition-opacity sm:hidden ${
                        isSidebarOpen
                            ? 'opacity-100'
                            : 'pointer-events-none opacity-0'
                    }`}
                />
                <div
                    className={`absolute sm:relative z-20 h-full pt-16 bg-white/95 text-gray-800 backdrop-blur-md dark:bg-[#1a1a1a]/95 dark:text-white sm:bg-transparent sm:text-white sm:backdrop-blur-none dark:sm:bg-transparent flex flex-col shrink-0 transition-all duration-300 ${
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
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full bg-black/5 text-gray-950 cursor-pointer font-medium dark:bg-white/20 dark:text-white sm:bg-white/20 sm:text-white">
                            <div className="flex items-center gap-3">
                                <Chat01Icon size={16} />
                                <span className="text-sm">{t('chat')}</span>
                            </div>
                            <span className="text-xs font-bold">{conversationSummaries.length}</span>
                        </div>
                        <button
                            type="button"
                            onClick={handleOpenFiles}
                            className="flex w-full items-center justify-between px-4 py-1.5 rounded-r-full text-left text-gray-700 hover:bg-black/5 hover:text-gray-950 cursor-pointer dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white sm:text-white/80 sm:hover:bg-white/10 sm:hover:text-white"
                        >
                            <div className="flex items-center gap-3">
                                <Folder01Icon size={16} />
                                <span className="text-sm">{t('files')}</span>
                            </div>
                        </button>
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full text-gray-700 hover:bg-black/5 hover:text-gray-950 cursor-pointer dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white sm:text-white/80 sm:hover:bg-white/10 sm:hover:text-white">
                            <div className="flex items-center gap-3">
                                <BotIcon size={16} />
                                <span className="text-sm">{t('agent')}</span>
                            </div>
                        </div>

                        <div
                            className="mt-6 mb-2 px-4 flex items-center justify-between group cursor-pointer"
                            onClick={handleNewChat}
                        >
                            <span className="text-sm font-medium text-gray-800 dark:text-white/90 sm:text-white/90">
                                {t('chatHistory')}
                            </span>
                            <Add01Icon
                                size={16}
                                className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity dark:text-white/70 sm:text-white/70"
                            />
                        </div>
                        {filteredConversationSummaries.length === 0 ? (
                            <div className="px-4 py-2 text-sm text-gray-500 dark:text-white/55 sm:text-white/55">
                                {conversationListEmptyMessage}
                            </div>
                        ) : (
                            filteredConversationSummaries.map((summary) => (
                                <ChatItem
                                    key={summary.id}
                                    text={summary.title || t('newChat')}
                                    active={summary.id === currentConversation?.id}
                                    pinned={summary.isPinned}
                                    canManage={summary.permission === 'owner'}
                                    menuOpen={openConversationMenuId === summary.id}
                                    renaming={renamingConversationId === summary.id}
                                    renameValue={renameDraft}
                                    onClick={() => handleOpenConversation(summary.id)}
                                    onMenuToggle={() =>
                                        setOpenConversationMenuId((prev) =>
                                            prev === summary.id ? null : summary.id
                                        )
                                    }
                                    onPinToggle={() => handleToggleConversationPin(summary)}
                                    onRenameStart={() => handleStartRenameConversation(summary)}
                                    onRenameValueChange={setRenameDraft}
                                    onRenameSubmit={() => handleRenameConversation(summary)}
                                    onRenameCancel={handleCancelRenameConversation}
                                    onDelete={() => handleDeleteConversation(summary)}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="relative flex-1 overflow-hidden flex flex-col text-gray-800 dark:text-gray-200">
                    <div className="relative z-0 flex min-h-0 flex-1 flex-col">
                        {currentConversation ? (
                            <Suspense fallback={<ContentLoadingFallback />}>
                                <MainChat
                                    canWrite={currentConversation.canWrite}
                                    messages={currentConversation.messages}
                                    setMessages={setMessages}
                                    ensureConversationId={ensureCurrentConversationId}
                                    onMessagesCommitted={handleMessagesCommitted}
                                    onAuthExpired={handleLogout}
                                    onOpenRagSource={handleOpenRagSource}
                                />
                            </Suspense>
                        ) : (
                            <div className="flex min-h-0 flex-1 items-center justify-center pt-16 text-white/75">
                                {t('loadingConversation')}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <Suspense fallback={null}>
                <RagFileBrowser
                    isOpen={isFileBrowserOpen}
                    openRequest={ragFileOpenRequest}
                    onClose={() => setIsFileBrowserOpen(false)}
                    onAuthExpired={handleLogout}
                />
            </Suspense>
        </div>
    );
}
