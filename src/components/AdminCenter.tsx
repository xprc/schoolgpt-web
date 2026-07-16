import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import '@material/web/button/filled-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/progress/circular-progress.js';
import '@material/web/select/outlined-select.js';
import '@material/web/select/select-option.js';
import '@material/web/switch/switch.js';
import '@material/web/tabs/primary-tab.js';
import '@material/web/tabs/tabs.js';
import '@material/web/textfield/outlined-text-field.js';
import {
    Add01Icon,
    BotIcon,
    Cancel01Icon,
    Chat01Icon,
    Delete02Icon,
    Edit01Icon,
    GridIcon,
    Refresh01Icon,
    Search01Icon,
    Tick02Icon,
} from 'hugeicons-react';
import { ApiAuthError } from '../api/chat';
import {
    createAdminUser,
    deleteAdminConversation,
    deleteRagFile,
    fetchAdminConversations,
    fetchAdminDashboard,
    fetchAdminUsers,
    fetchModelConfig,
    fetchModelProviderOptions,
    fetchPaddleOcrConfig,
    fetchRagStatus,
    fetchWebSearchConfig,
    rebuildRagDatabase,
    updateAdminConversationVisibility,
    updateAdminUser,
    updateAdminUserPassword,
    updateModelConfig,
    updatePaddleOcrConfig,
    updateWebSearchConfig,
    uploadRagFiles,
    type AdminConversation,
    type AdminDashboard,
    type AdminUser,
    type AdminUserDraft,
    type ModelConfig,
    type ModelProviderOption,
    type PaddleOcrConfig,
    type RagStatus,
    type UserType,
    type WebSearchConfig,
} from '../api/admin';
import { renderFileTypeIcon } from '../utils/fileTypeIcons';
import '../styles/md3-theme.css';
import '../styles/admin-md3.css';

type AdminTab = 'dashboard' | 'users' | 'conversations' | 'model' | 'web-search' | 'ocr' | 'rag';

type AdminCenterProps = {
    onClose: () => void;
    onAuthExpired: () => void;
};

type MaterialSelectElement = HTMLElement & {
    value: string;
};

type MaterialSwitchElement = HTMLElement & {
    selected: boolean;
};

type MaterialTabsElement = HTMLElement & {
    activeTabIndex: number;
};

type MaterialTextFieldElement = HTMLElement & {
    value: string;
};

const selectedOptionProps = (selected: boolean): { selected?: boolean } => {
    return selected ? { selected: true } : {};
};

const getMaterialSelected = (event: FormEvent<HTMLElement>): boolean => {
    return (event.currentTarget as MaterialSwitchElement).selected;
};

const getMaterialValue = (event: FormEvent<HTMLElement>): string => {
    return (event.currentTarget as MaterialSelectElement | MaterialTextFieldElement).value;
};

const emptyUserDraft: AdminUserDraft = {
    username: '',
    email: '',
    password: '',
    displayName: '',
    userType: 'student',
    isActive: true,
};

type AdminTabDefinition = { key: AdminTab; label: string; icon: typeof GridIcon };

const activeRagFileStatuses = new Set(['pending', 'extracting', 'ocr', 'rendering', 'indexing']);

const isRagFileProcessing = (status: string): boolean => {
    return activeRagFileStatuses.has(status);
};

const ragFileStatusTranslationKey = (status: string, indexed: boolean): string => {
    if (status === 'failed') {
        return 'admin.ragStatuses.failed';
    }

    if (status === 'pending') {
        return 'admin.ragStatuses.pending';
    }

    if (status === 'extracting') {
        return 'admin.ragStatuses.extracting';
    }

    if (status === 'ocr') {
        return 'admin.ragStatuses.ocr';
    }

    if (status === 'rendering') {
        return 'admin.ragStatuses.rendering';
    }

    if (status === 'indexing') {
        return 'admin.ragStatuses.indexing';
    }

    return indexed ? 'admin.ragStatuses.indexed' : 'admin.ragStatuses.waiting';
};

const ragFileStatusBadgeClass = (status: string, indexed: boolean): string => {
    if (status === 'failed') {
        return 'admin-md3__chip admin-md3__chip--error';
    }

    if (indexed) {
        return 'admin-md3__chip admin-md3__chip--success';
    }

    if (isRagFileProcessing(status)) {
        return 'admin-md3__chip admin-md3__chip--info';
    }

    return 'admin-md3__chip admin-md3__chip--warning';
};

const formatDate = (value: string | null, locale: string): string => {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatCount = (value: number, locale: string): string => {
    return new Intl.NumberFormat(locale).format(value);
};

const formatFileSize = (value: number): string => {
    if (value < 1024) {
        return `${value} B`;
    }

    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const modelDraftFromConfig = (config: ModelConfig): {
    provider: 'deepseek' | 'qwen';
    modelName: string;
    baseUrl: string;
    apiPath: string;
    apiKey: string;
} => {
    return {
        provider: config.provider,
        modelName: config.modelName,
        baseUrl: config.baseUrl,
        apiPath: config.apiPath,
        apiKey: '',
    };
};

const webSearchDraftFromConfig = (config: WebSearchConfig): {
    apiKey: string;
    isEnabled: boolean;
} => {
    return {
        apiKey: '',
        isEnabled: config.isEnabled,
    };
};

const paddleOcrDraftFromConfig = (): { apiKey: string } => {
    return { apiKey: '' };
};

export default function AdminCenter({ onClose, onAuthExpired }: AdminCenterProps) {
    const { t, i18n } = useTranslation();
    const currentLocale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
    const userTypeLabels = useMemo<Record<UserType, string>>(() => ({
        student: t('admin.userTypes.student'),
        teacher: t('admin.userTypes.teacher'),
        maintenance: t('admin.userTypes.maintenance'),
        admin: t('admin.userTypes.admin'),
    }), [t]);
    const tabs = useMemo<AdminTabDefinition[]>(() => [
        { key: 'dashboard', label: t('admin.tabs.dashboard'), icon: GridIcon },
        { key: 'users', label: t('admin.tabs.users'), icon: Edit01Icon },
        { key: 'conversations', label: t('admin.tabs.conversations'), icon: Chat01Icon },
        { key: 'model', label: t('admin.tabs.model'), icon: BotIcon },
        { key: 'web-search', label: t('admin.tabs.webSearch'), icon: Search01Icon },
        { key: 'ocr', label: t('admin.tabs.ocr'), icon: BotIcon },
        { key: 'rag', label: t('admin.tabs.rag'), icon: Search01Icon },
    ], [t]);
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
    const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
    const [webSearchConfig, setWebSearchConfig] = useState<WebSearchConfig | null>(null);
    const [paddleOcrConfig, setPaddleOcrConfig] = useState<PaddleOcrConfig | null>(null);
    const [providerOptions, setProviderOptions] = useState<ModelProviderOption[]>([]);
    const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
    const [ragUploadFiles, setRagUploadFiles] = useState<File[]>([]);
    const [ragFileInputKey, setRagFileInputKey] = useState(0);
    const [userDraft, setUserDraft] = useState<AdminUserDraft>(emptyUserDraft);
    const [editingUserId, setEditingUserId] = useState<number | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [conversationSearch, setConversationSearch] = useState('');
    const [modelDraft, setModelDraft] = useState(modelDraftFromConfig({
        id: 0,
        provider: 'deepseek',
        providerLabel: 'DeepSeek',
        modelName: 'deepseek-v4-pro',
        baseUrl: 'https://api.deepseek.com',
        apiPath: '/chat/completions',
        hasApiKey: false,
        apiKeyMask: '',
        isActive: true,
        createdAt: '',
        updatedAt: '',
    }));
    const [webSearchDraft, setWebSearchDraft] = useState({
        apiKey: '',
        isEnabled: true,
    });
    const [paddleOcrDraft, setPaddleOcrDraft] = useState({ apiKey: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleError = useCallback((error: unknown) => {
        if (error instanceof ApiAuthError) {
            onAuthExpired();
            return;
        }

        setErrorMessage(error instanceof Error ? error.message : String(error));
    }, [onAuthExpired]);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const [
                nextDashboard,
                nextUsers,
                nextConversations,
                nextConfig,
                nextProviderOptions,
                nextWebSearchConfig,
                nextPaddleOcrConfig,
                nextRagStatus,
            ] = await Promise.all([
                fetchAdminDashboard(),
                fetchAdminUsers(),
                fetchAdminConversations(),
                fetchModelConfig(),
                fetchModelProviderOptions(),
                fetchWebSearchConfig(),
                fetchPaddleOcrConfig(),
                fetchRagStatus(),
            ]);
            setDashboard(nextDashboard);
            setUsers(nextUsers);
            setConversations(nextConversations);
            setModelConfig(nextConfig);
            setProviderOptions(nextProviderOptions);
            setWebSearchConfig(nextWebSearchConfig);
            setPaddleOcrConfig(nextPaddleOcrConfig);
            setRagStatus(nextRagStatus);
            setModelDraft(modelDraftFromConfig(nextConfig));
            setWebSearchDraft(webSearchDraftFromConfig(nextWebSearchConfig));
            setPaddleOcrDraft(paddleOcrDraftFromConfig());
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void refreshAll();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [refreshAll]);

    useEffect(() => {
        const hasActiveRagTask = ragStatus?.files.some((file) => {
            return isRagFileProcessing(file.status);
        }) ?? false;

        if (activeTab !== 'rag' || !hasActiveRagTask) {
            return undefined;
        }

        const timer = window.setInterval(() => {
            fetchRagStatus()
                .then(setRagStatus)
                .catch((error: unknown) => {
                    if (error instanceof ApiAuthError) {
                        onAuthExpired();
                        return;
                    }

                    setErrorMessage(error instanceof Error ? error.message : String(error));
                });
        }, 2500);

        return () => window.clearInterval(timer);
    }, [activeTab, ragStatus, onAuthExpired]);

    const filteredUsers = useMemo(() => {
        const query = userSearch.trim().toLowerCase();
        if (!query) {
            return users;
        }

        return users.filter((user) => {
            return [
                user.username,
                user.email,
                user.displayName,
                userTypeLabels[user.userType],
            ].some((value) => value.toLowerCase().includes(query));
        });
    }, [userSearch, userTypeLabels, users]);

    const filteredConversations = useMemo(() => {
        const query = conversationSearch.trim().toLowerCase();
        if (!query) {
            return conversations;
        }

        return conversations.filter((conversation) => {
            return [
                conversation.title,
                conversation.ownerUsername,
                conversation.ownerEmail,
                conversation.shareScope,
            ].some((value) => value.toLowerCase().includes(query));
        });
    }, [conversationSearch, conversations]);

    const selectedProvider = providerOptions.find(
        (option) => option.provider === modelDraft.provider
    );
    const activeTabIndex = Math.max(0, tabs.findIndex((tab) => tab.key === activeTab));

    const handleTabsChange = (event: FormEvent<HTMLElement>) => {
        const nextIndex = (event.currentTarget as MaterialTabsElement).activeTabIndex;
        const nextTab = tabs[nextIndex];
        if (nextTab) {
            setActiveTab(nextTab.key);
        }
    };

    const resetUserForm = () => {
        setEditingUserId(null);
        setUserDraft(emptyUserDraft);
    };

    const handleEditUser = (user: AdminUser) => {
        setEditingUserId(user.id);
        setUserDraft({
            username: user.username,
            email: user.email,
            password: '',
            displayName: user.displayName,
            userType: user.userType,
            isActive: user.isActive,
        });
        setActiveTab('users');
    };

    const handleUserSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            if (editingUserId === null) {
                if (!userDraft.password) {
                    throw new Error(t('admin.messages.passwordRequired'));
                }
                const createdUser = await createAdminUser(userDraft);
                setUsers((prev) => [createdUser, ...prev]);
                setStatusMessage(t('admin.messages.userCreated'));
            } else {
                const updatedUser = await updateAdminUser(editingUserId, userDraft);
                if (userDraft.password) {
                    await updateAdminUserPassword(editingUserId, userDraft.password);
                }
                setUsers((prev) =>
                    prev.map((user) => user.id === updatedUser.id ? updatedUser : user)
                );
                setStatusMessage(t('admin.messages.userUpdated'));
            }

            resetUserForm();
            const nextDashboard = await fetchAdminDashboard();
            setDashboard(nextDashboard);
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleConversationVisibility = async (
        conversation: AdminConversation,
        isVisible: boolean
    ) => {
        setErrorMessage(null);
        setStatusMessage(null);
        try {
            const updatedConversation = await updateAdminConversationVisibility(
                conversation.id,
                isVisible
            );
            setConversations((prev) =>
                prev.map((item) =>
                    item.id === updatedConversation.id ? updatedConversation : item
                )
            );
            const nextDashboard = await fetchAdminDashboard();
            setDashboard(nextDashboard);
        } catch (error: unknown) {
            handleError(error);
        }
    };

    const handleDeleteConversation = async (conversation: AdminConversation) => {
        if (!window.confirm(t('admin.messages.deleteConversationConfirm', { title: conversation.title }))) {
            return;
        }

        setErrorMessage(null);
        setStatusMessage(null);
        try {
            await deleteAdminConversation(conversation.id);
            setConversations((prev) => prev.filter((item) => item.id !== conversation.id));
            const nextDashboard = await fetchAdminDashboard();
            setDashboard(nextDashboard);
        } catch (error: unknown) {
            handleError(error);
        }
    };

    const handleProviderChange = (provider: 'deepseek' | 'qwen') => {
        const option = providerOptions.find((item) => item.provider === provider);
        setModelDraft((prev) => ({
            ...prev,
            provider,
            modelName: option?.models[0] ?? prev.modelName,
            baseUrl: option?.baseUrl ?? prev.baseUrl,
            apiPath: option?.apiPath ?? prev.apiPath,
        }));
    };

    const handleModelSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const updatedConfig = await updateModelConfig({
                provider: modelDraft.provider,
                modelName: modelDraft.modelName,
                baseUrl: modelDraft.baseUrl,
                apiPath: modelDraft.apiPath,
                apiKey: modelDraft.apiKey.trim() ? modelDraft.apiKey.trim() : undefined,
            });
            setModelConfig(updatedConfig);
            setModelDraft(modelDraftFromConfig(updatedConfig));
            const nextDashboard = await fetchAdminDashboard();
            setDashboard(nextDashboard);
            setStatusMessage(t('admin.messages.modelSaved'));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleWebSearchSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const updatedConfig = await updateWebSearchConfig({
                apiKey: webSearchDraft.apiKey.trim()
                    ? webSearchDraft.apiKey.trim()
                    : undefined,
                isEnabled: webSearchDraft.isEnabled,
            });
            setWebSearchConfig(updatedConfig);
            setWebSearchDraft(webSearchDraftFromConfig(updatedConfig));
            setStatusMessage(t('admin.messages.webSearchSaved'));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handlePaddleOcrSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const updatedConfig = await updatePaddleOcrConfig({
                apiKey: paddleOcrDraft.apiKey.trim()
                    ? paddleOcrDraft.apiKey.trim()
                    : undefined,
            });
            setPaddleOcrConfig(updatedConfig);
            setPaddleOcrDraft(paddleOcrDraftFromConfig());
            setStatusMessage(t('admin.messages.paddleOcrSaved'));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleRagFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        setRagUploadFiles(Array.from(event.target.files ?? []));
    };

    const handleRagUpload = async () => {
        if (ragUploadFiles.length === 0) {
            setErrorMessage(t('admin.messages.selectRagFile'));
            return;
        }

        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const nextStatus = await uploadRagFiles(ragUploadFiles);
            setRagStatus(nextStatus);
            setRagUploadFiles([]);
            setRagFileInputKey((prev) => prev + 1);
            setStatusMessage(t('admin.messages.ragUploaded'));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleRagRebuild = async () => {
        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const nextStatus = await rebuildRagDatabase();
            setRagStatus(nextStatus);
            setStatusMessage(t('admin.messages.ragRebuildStarted'));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleRagDelete = async (fileId: number, fileName: string) => {
        if (!window.confirm(t('admin.messages.deleteRagFileConfirm', { name: fileName }))) {
            return;
        }

        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const nextStatus = await deleteRagFile(fileId);
            setRagStatus(nextStatus);
            setStatusMessage(t('admin.messages.ragFileDeleted'));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const renderDashboard = () => {
        if (!dashboard) {
            return null;
        }

        const stats = [
            { label: t('admin.dashboard.totalUsers'), value: dashboard.totalUsers },
            { label: t('admin.dashboard.activeUsers'), value: dashboard.activeUsers },
            { label: t('admin.dashboard.totalConversations'), value: dashboard.totalConversations },
            { label: t('admin.dashboard.totalMessages'), value: dashboard.totalMessages },
        ];

        return (
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="admin-md3__pane p-5"
                        >
                            <div className="admin-md3__muted text-sm">
                                {stat.label}
                            </div>
                            <div className="mt-2 text-3xl font-semibold">
                                {formatCount(stat.value, currentLocale)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <div className="admin-md3__pane p-5">
                        <h3 className="text-base font-semibold">
                            {t('admin.dashboard.userTypes')}
                        </h3>
                        <div className="mt-4 space-y-3">
                            {Object.entries(userTypeLabels).map(([userType, label]) => (
                                <div key={userType}>
                                    <div className="admin-md3__muted mb-1 flex items-center justify-between text-sm">
                                        <span>{label}</span>
                                        <span>{dashboard.usersByType[userType] ?? 0}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-[var(--md-sys-color-surface-container-highest)]">
                                        <div
                                            className="h-2 rounded-full bg-[var(--md-sys-color-primary)]"
                                            style={{
                                                width: `${dashboard.totalUsers > 0
                                                    ? ((dashboard.usersByType[userType] ?? 0) / dashboard.totalUsers) * 100
                                                    : 0}%`,
                                            }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="admin-md3__pane p-5">
                        <h3 className="text-base font-semibold">
                            {t('admin.dashboard.currentModel')}
                        </h3>
                        <dl className="mt-4 grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <dt className="admin-md3__muted">{t('admin.fields.provider')}</dt>
                                <dd className="font-medium">
                                    {dashboard.activeModel.providerLabel}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="admin-md3__muted">{t('admin.fields.model')}</dt>
                                <dd className="font-medium">
                                    {dashboard.activeModel.modelName}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="admin-md3__muted">API Key</dt>
                                <dd className={dashboard.activeModel.hasApiKey
                                    ? 'font-medium text-emerald-600 dark:text-emerald-300'
                                    : 'font-medium text-[var(--md-sys-color-error)]'}
                                >
                                    {dashboard.activeModel.hasApiKey ? t('configured') : t('notConfigured')}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </div>
        );
    };

    const renderUsers = () => {
        return (
            <div className="grid min-h-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <form
                    onSubmit={handleUserSubmit}
                    className="admin-md3__pane p-4 sm:p-5"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold">
                            {editingUserId === null ? t('admin.users.newUser') : t('admin.users.editUser')}
                        </h3>
                        {editingUserId !== null && (
                            <md-icon-button
                                type="button"
                                onClick={resetUserForm}
                                title={t('admin.users.cancelEdit')}
                            >
                                <Cancel01Icon size={16} />
                            </md-icon-button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <md-outlined-text-field
                            className="admin-md3__field"
                            label={t('admin.fields.username')}
                            value={userDraft.username}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setUserDraft((prev) => ({
                                    ...prev,
                                    username: value,
                                }));
                            }}
                        />
                        <md-outlined-text-field
                            className="admin-md3__field"
                            label={t('admin.fields.displayName')}
                            value={userDraft.displayName}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setUserDraft((prev) => ({
                                    ...prev,
                                    displayName: value,
                                }));
                            }}
                        />
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="email"
                            label={t('admin.fields.email')}
                            value={userDraft.email}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setUserDraft((prev) => ({
                                    ...prev,
                                    email: value,
                                }));
                            }}
                        />
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="password"
                            label={t('admin.fields.password')}
                            supportingText={editingUserId === null ? '' : t('admin.users.passwordUnchanged')}
                            value={userDraft.password ?? ''}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setUserDraft((prev) => ({
                                    ...prev,
                                    password: value,
                                }));
                            }}
                        />
                        <md-outlined-select
                            className="admin-md3__field"
                            label={t('admin.fields.userType')}
                            value={userDraft.userType}
                            menuPositioning="fixed"
                            onInput={(event) => {
                                const value = getMaterialValue(event) as UserType;
                                setUserDraft((prev) => ({
                                    ...prev,
                                    userType: value,
                                }));
                            }}
                        >
                            {Object.entries(userTypeLabels).map(([value, label]) => (
                                <md-select-option
                                    key={value}
                                    value={value}
                                    {...selectedOptionProps(userDraft.userType === value)}
                                >
                                    <div slot="headline">{label}</div>
                                </md-select-option>
                            ))}
                        </md-outlined-select>
                        <label className="admin-md3__muted flex items-center gap-3 text-sm">
                            <md-switch
                                selected={userDraft.isActive}
                                onChange={(event) => {
                                    const selected = getMaterialSelected(event);
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        isActive: selected,
                                    }));
                                }}
                            />
                            <span>{t('admin.users.enableAccount')}</span>
                        </label>
                    </div>

                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5 w-full"
                    >
                        <span slot="icon" className="admin-md3__slot-icon">
                            {editingUserId === null ? <Add01Icon size={16} /> : <Tick02Icon size={16} />}
                        </span>
                        {editingUserId === null ? t('admin.users.createUser') : t('admin.users.saveUser')}
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane min-w-0 overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-[var(--md-sys-color-outline-variant)] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-base font-semibold">
                            {t('admin.users.list')}
                        </h3>
                        <md-outlined-text-field
                            className="admin-md3__field sm:max-w-xs"
                            type="search"
                            label={t('admin.users.search')}
                            value={userSearch}
                            onInput={(event) => setUserSearch(getMaterialValue(event))}
                        >
                            <span slot="leading-icon" className="admin-md3__slot-icon">
                                <Search01Icon size={16} />
                            </span>
                        </md-outlined-text-field>
                    </div>
                    <div className="divide-y divide-[var(--md-sys-color-outline-variant)] md:hidden">
                        {filteredUsers.map((user) => (
                            <article
                                key={user.id}
                                className="p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h4 className="truncate text-sm font-semibold">
                                            {user.displayName}
                                        </h4>
                                        <p className="admin-md3__muted mt-1 break-all text-xs">
                                            {user.username} · {user.email}
                                        </p>
                                    </div>
                                    <span className={user.isActive
                                        ? 'admin-md3__chip admin-md3__chip--success shrink-0'
                                        : 'admin-md3__chip admin-md3__chip--neutral shrink-0'}
                                    >
                                        {user.isActive ? t('enabled') : t('disabled')}
                                    </span>
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <dt className="admin-md3__muted text-xs">
                                            {t('admin.fields.type')}
                                        </dt>
                                        <dd className="mt-1 font-medium">
                                            {userTypeLabels[user.userType]}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="admin-md3__muted text-xs">
                                            {t('admin.fields.lastLogin')}
                                        </dt>
                                        <dd className="mt-1 font-medium">
                                            {formatDate(user.lastLoginAt, currentLocale)}
                                        </dd>
                                    </div>
                                </dl>
                                <div className="mt-3 flex justify-end">
                                    <md-icon-button
                                        type="button"
                                        onClick={() => handleEditUser(user)}
                                        title={t('admin.users.edit')}
                                    >
                                        <Edit01Icon size={16} />
                                    </md-icon-button>
                                </div>
                            </article>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="admin-md3__table min-w-[760px]">
                            <thead>
                                <tr>
                                    <th>{t('admin.fields.user')}</th>
                                    <th>{t('admin.fields.type')}</th>
                                    <th>{t('admin.fields.status')}</th>
                                    <th>{t('admin.fields.lastLogin')}</th>
                                    <th className="text-right">{t('admin.fields.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => (
                                    <tr key={user.id}>
                                        <td>
                                            <div className="font-medium">
                                                {user.displayName}
                                            </div>
                                            <div className="admin-md3__muted text-xs">
                                                {user.username} · {user.email}
                                            </div>
                                        </td>
                                        <td>
                                            {userTypeLabels[user.userType]}
                                        </td>
                                        <td>
                                            <span className={user.isActive
                                                ? 'admin-md3__chip admin-md3__chip--success'
                                                : 'admin-md3__chip admin-md3__chip--neutral'}
                                            >
                                                {user.isActive ? t('enabled') : t('disabled')}
                                            </span>
                                        </td>
                                        <td className="admin-md3__muted">
                                            {formatDate(user.lastLoginAt, currentLocale)}
                                        </td>
                                        <td>
                                            <div className="flex justify-end">
                                                <md-icon-button
                                                    type="button"
                                                    onClick={() => handleEditUser(user)}
                                                    title={t('admin.users.edit')}
                                                >
                                                    <Edit01Icon size={16} />
                                                </md-icon-button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderConversations = () => {
        return (
            <div className="admin-md3__pane overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-[var(--md-sys-color-outline-variant)] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-base font-semibold">
                        {t('admin.conversations.list')}
                    </h3>
                    <md-outlined-text-field
                        className="admin-md3__field sm:max-w-xs"
                        type="search"
                        label={t('admin.conversations.search')}
                        value={conversationSearch}
                        onInput={(event) => setConversationSearch(getMaterialValue(event))}
                    >
                        <span slot="leading-icon" className="admin-md3__slot-icon">
                            <Search01Icon size={16} />
                        </span>
                    </md-outlined-text-field>
                </div>
                <div className="divide-y divide-[var(--md-sys-color-outline-variant)] md:hidden">
                    {filteredConversations.map((conversation) => (
                        <article
                            key={conversation.id}
                            className="p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold">
                                        {conversation.title}
                                    </h4>
                                    <p className="admin-md3__muted mt-1 break-all text-xs">
                                        {conversation.id}
                                    </p>
                                </div>
                                <span className={conversation.isVisible
                                    ? 'admin-md3__chip admin-md3__chip--success shrink-0'
                                    : 'admin-md3__chip admin-md3__chip--neutral shrink-0'}
                                >
                                    {conversation.isVisible
                                        ? t('admin.conversations.visible')
                                        : t('admin.conversations.hidden')}
                                </span>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="admin-md3__muted text-xs">
                                        {t('admin.fields.owner')}
                                    </dt>
                                    <dd className="mt-1 break-all font-medium">
                                        {conversation.ownerUsername}
                                    </dd>
                                    <dd className="admin-md3__muted mt-0.5 break-all text-xs">
                                        {conversation.ownerEmail}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="admin-md3__muted text-xs">
                                        {t('admin.fields.updatedAt')}
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {formatDate(conversation.updatedAt, currentLocale)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="admin-md3__muted text-xs">
                                        {t('admin.fields.sharing')}
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {conversation.shareScope}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="admin-md3__muted text-xs">
                                        {t('admin.fields.messages')}
                                    </dt>
                                    <dd className="mt-1 font-medium">
                                        {conversation.messageCount}
                                    </dd>
                                </div>
                            </dl>
                            <div className="mt-3 flex justify-end gap-1">
                                <md-icon-button
                                    type="button"
                                    onClick={() =>
                                        handleConversationVisibility(
                                            conversation,
                                            !conversation.isVisible
                                        )
                                    }
                                    title={conversation.isVisible
                                        ? t('admin.conversations.hide')
                                        : t('admin.conversations.restore')}
                                >
                                    {conversation.isVisible
                                        ? <Cancel01Icon size={16} />
                                        : <Tick02Icon size={16} />}
                                </md-icon-button>
                                <md-icon-button
                                    type="button"
                                    onClick={() => handleDeleteConversation(conversation)}
                                    title={t('deleteConversation')}
                                >
                                    <Delete02Icon size={16} />
                                </md-icon-button>
                            </div>
                        </article>
                    ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                    <table className="admin-md3__table min-w-[920px]">
                        <thead>
                            <tr>
                                <th>{t('admin.fields.conversation')}</th>
                                <th>{t('admin.fields.owner')}</th>
                                <th>{t('admin.fields.sharing')}</th>
                                <th>{t('admin.fields.messages')}</th>
                                <th>{t('admin.fields.updatedAt')}</th>
                                <th>{t('admin.fields.status')}</th>
                                <th className="text-right">{t('admin.fields.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredConversations.map((conversation) => (
                                <tr key={conversation.id}>
                                    <td>
                                        <div className="max-w-[280px] truncate font-medium">
                                            {conversation.title}
                                        </div>
                                        <div className="admin-md3__muted text-xs">
                                            {conversation.id}
                                        </div>
                                    </td>
                                    <td>
                                        <div>
                                            {conversation.ownerUsername}
                                        </div>
                                        <div className="admin-md3__muted text-xs">
                                            {conversation.ownerEmail}
                                        </div>
                                    </td>
                                    <td className="admin-md3__muted">
                                        {conversation.shareScope}
                                    </td>
                                    <td className="admin-md3__muted">
                                        {conversation.messageCount}
                                    </td>
                                    <td className="admin-md3__muted">
                                        {formatDate(conversation.updatedAt, currentLocale)}
                                    </td>
                                    <td>
                                        <span className={conversation.isVisible
                                            ? 'admin-md3__chip admin-md3__chip--success'
                                            : 'admin-md3__chip admin-md3__chip--neutral'}
                                        >
                                            {conversation.isVisible
                                                ? t('admin.conversations.visible')
                                                : t('admin.conversations.hidden')}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="flex justify-end gap-1">
                                            <md-icon-button
                                                type="button"
                                                onClick={() =>
                                                    handleConversationVisibility(
                                                        conversation,
                                                        !conversation.isVisible
                                                    )
                                                }
                                                title={conversation.isVisible
                                                    ? t('admin.conversations.hide')
                                                    : t('admin.conversations.restore')}
                                            >
                                                {conversation.isVisible
                                                    ? <Cancel01Icon size={16} />
                                                    : <Tick02Icon size={16} />}
                                            </md-icon-button>
                                            <md-icon-button
                                                type="button"
                                                onClick={() => handleDeleteConversation(conversation)}
                                                title={t('deleteConversation')}
                                            >
                                                <Delete02Icon size={16} />
                                            </md-icon-button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderModelConfig = () => {
        return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form
                    onSubmit={handleModelSubmit}
                    className="admin-md3__pane p-5"
                >
                    <h3 className="text-base font-semibold">
                        {t('admin.model.title')}
                    </h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <md-outlined-select
                            className="admin-md3__field"
                            label={t('admin.model.provider')}
                            value={modelDraft.provider}
                            menuPositioning="fixed"
                            onInput={(event) =>
                                handleProviderChange(getMaterialValue(event) as 'deepseek' | 'qwen')
                            }
                        >
                            {providerOptions.map((option) => (
                                <md-select-option
                                    key={option.provider}
                                    value={option.provider}
                                    {...selectedOptionProps(modelDraft.provider === option.provider)}
                                >
                                    <div slot="headline">{option.label}</div>
                                </md-select-option>
                            ))}
                        </md-outlined-select>
                        <md-outlined-text-field
                            className="admin-md3__field"
                            label={t('admin.model.name')}
                            value={modelDraft.modelName}
                            supportingText={selectedProvider?.models.length
                                ? t('admin.model.available', {
                                    models: selectedProvider.models.slice(0, 3).join(', '),
                                })
                                : ''}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setModelDraft((prev) => ({
                                    ...prev,
                                    modelName: value,
                                }));
                            }}
                        />
                        <md-outlined-text-field
                            className="admin-md3__field sm:col-span-2"
                            label="Base URL"
                            value={modelDraft.baseUrl}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setModelDraft((prev) => ({
                                    ...prev,
                                    baseUrl: value,
                                }));
                            }}
                        />
                        <md-outlined-text-field
                            className="admin-md3__field sm:col-span-2"
                            label="Chat API Path"
                            value={modelDraft.apiPath}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setModelDraft((prev) => ({
                                    ...prev,
                                    apiPath: value,
                                }));
                            }}
                        />
                        <md-outlined-text-field
                            className="admin-md3__field sm:col-span-2"
                            type="password"
                            label="API Key"
                            value={modelDraft.apiKey}
                            supportingText={modelConfig?.hasApiKey
                                ? t('savedApiKey', { mask: modelConfig.apiKeyMask })
                                : t('admin.model.apiKeyPlaceholder')}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setModelDraft((prev) => ({
                                    ...prev,
                                    apiKey: value,
                                }));
                            }}
                        />
                    </div>
                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5"
                    >
                        <span slot="icon" className="admin-md3__slot-icon">
                            <Tick02Icon size={16} />
                        </span>
                        {t('admin.config.save')}
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane p-5">
                    <h3 className="text-base font-semibold">
                        {t('admin.config.current')}
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.provider')}</dt>
                            <dd className="mt-1 font-medium">
                                {modelConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.model')}</dt>
                            <dd className="mt-1 font-medium">
                                {modelConfig?.modelName ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.endpoint')}</dt>
                            <dd className="mt-1 break-all font-medium">
                                {modelConfig
                                    ? `${modelConfig.baseUrl}${modelConfig.apiPath}`
                                    : '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">API Key</dt>
                            <dd className={modelConfig?.hasApiKey
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'mt-1 font-medium text-[var(--md-sys-color-error)]'}
                            >
                                {modelConfig?.hasApiKey ? modelConfig.apiKeyMask : t('notConfigured')}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        );
    };

    const renderWebSearchConfig = () => {
        return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form
                    onSubmit={handleWebSearchSubmit}
                    className="admin-md3__pane p-5"
                >
                    <h3 className="text-base font-semibold">
                        {t('admin.webSearch.title')}
                    </h3>
                    <div className="mt-5 space-y-4">
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="password"
                            label="Tavily API Key"
                            value={webSearchDraft.apiKey}
                            supportingText={webSearchConfig?.hasApiKey
                                ? t('savedApiKey', { mask: webSearchConfig.apiKeyMask })
                                : t('admin.webSearch.apiKeyPlaceholder')}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setWebSearchDraft((prev) => ({
                                    ...prev,
                                    apiKey: value,
                                }));
                            }}
                        />
                        <label className="admin-md3__muted flex items-center gap-3 text-sm">
                            <md-switch
                                selected={webSearchDraft.isEnabled}
                                onChange={(event) => {
                                    const selected = getMaterialSelected(event);
                                    setWebSearchDraft((prev) => ({
                                        ...prev,
                                        isEnabled: selected,
                                    }));
                                }}
                            />
                            <span>{t('admin.webSearch.enable')}</span>
                        </label>
                    </div>
                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5"
                    >
                        <span slot="icon" className="admin-md3__slot-icon">
                            <Tick02Icon size={16} />
                        </span>
                        {t('admin.config.save')}
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane p-5">
                    <h3 className="text-base font-semibold">
                        {t('admin.config.current')}
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.provider')}</dt>
                            <dd className="mt-1 font-medium">
                                {webSearchConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.status')}</dt>
                            <dd className={webSearchConfig?.isEnabled
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'admin-md3__muted mt-1 font-medium'}
                            >
                                {webSearchConfig?.isEnabled ? t('enabled') : t('disabled')}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">API Key</dt>
                            <dd className={webSearchConfig?.hasApiKey
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'mt-1 font-medium text-[var(--md-sys-color-error)]'}
                            >
                                {webSearchConfig?.hasApiKey
                                    ? webSearchConfig.apiKeyMask
                                    : t('notConfigured')}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.updatedAt')}</dt>
                            <dd className="mt-1 font-medium">
                                {formatDate(webSearchConfig?.updatedAt ?? null, currentLocale)}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        );
    };

    const renderPaddleOcrConfig = () => {
        return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form
                    onSubmit={handlePaddleOcrSubmit}
                    className="admin-md3__pane p-5"
                >
                    <h3 className="text-base font-semibold">
                        {t('admin.ocr.title')}
                    </h3>
                    <p className="admin-md3__muted mt-2 text-sm leading-6">
                        {t('admin.ocr.description')}
                    </p>
                    <div className="mt-5 space-y-4">
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="password"
                            label={t('admin.ocr.apiKey')}
                            value={paddleOcrDraft.apiKey}
                            supportingText={paddleOcrConfig?.hasApiKey
                                ? t('savedApiKey', { mask: paddleOcrConfig.apiKeyMask })
                                : t('admin.ocr.apiKeyPlaceholder')}
                            onInput={(event) => {
                                const value = getMaterialValue(event);
                                setPaddleOcrDraft({
                                    apiKey: value,
                                });
                            }}
                        />
                    </div>
                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5"
                    >
                        <span slot="icon" className="admin-md3__slot-icon">
                            <Tick02Icon size={16} />
                        </span>
                        {t('admin.config.save')}
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane p-5">
                    <h3 className="text-base font-semibold">
                        {t('admin.config.current')}
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.provider')}</dt>
                            <dd className="mt-1 font-medium">
                                {paddleOcrConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.model')}</dt>
                            <dd className="mt-1 font-medium">
                                {paddleOcrConfig?.modelName ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">API Key</dt>
                            <dd className={paddleOcrConfig?.hasApiKey
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'mt-1 font-medium text-[var(--md-sys-color-error)]'}
                            >
                                {paddleOcrConfig?.hasApiKey
                                    ? paddleOcrConfig.apiKeyMask
                                    : t('notConfigured')}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">{t('admin.fields.updatedAt')}</dt>
                            <dd className="mt-1 font-medium">
                                {formatDate(paddleOcrConfig?.updatedAt ?? null, currentLocale)}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        );
    };

    const renderRag = () => {
        if (!ragStatus) {
            return null;
        }

        const ragStats = [
            { label: t('admin.rag.totalFiles'), value: ragStatus.totalFiles },
            { label: t('admin.rag.indexedFiles'), value: ragStatus.indexedFiles },
            { label: t('admin.rag.vectorCount'), value: ragStatus.vectorCount },
        ];
        const uploadAccept = ragStatus.allowedFileTypes
            .map((fileType) => fileType.startsWith('.') ? fileType : `.${fileType}`)
            .join(',');

        return (
            <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                    {ragStats.map((stat) => (
                        <div
                            key={stat.label}
                            className="admin-md3__pane p-5"
                        >
                            <div className="admin-md3__muted text-sm">
                                {stat.label}
                            </div>
                            <div className="mt-2 text-3xl font-semibold">
                                {formatCount(stat.value, currentLocale)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="admin-md3__pane min-w-0 overflow-hidden">
                        <div className="flex flex-col gap-3 border-b border-[var(--md-sys-color-outline-variant)] p-4 lg:flex-row lg:items-center lg:justify-between">
                            <h3 className="text-base font-semibold">
                                {t('admin.rag.knowledgeFiles')}
                            </h3>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    key={ragFileInputKey}
                                    type="file"
                                    multiple
                                    accept={uploadAccept}
                                    onChange={handleRagFileChange}
                                    className="admin-md3__file-input max-w-full"
                                />
                                <md-filled-button
                                    type="button"
                                    onClick={() => void handleRagUpload()}
                                    disabled={saving || ragUploadFiles.length === 0}
                                    className="w-full sm:w-auto"
                                >
                                    <span slot="icon" className="admin-md3__slot-icon">
                                        <Add01Icon size={16} />
                                    </span>
                                    {t('admin.rag.upload')}
                                </md-filled-button>
                            </div>
                            {ragUploadFiles.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {ragUploadFiles.map((file, index) => (
                                        <span
                                            key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                                            className="admin-md3__chip admin-md3__chip--neutral max-w-full"
                                        >
                                            {renderFileTypeIcon(file.name, {
                                                size: 14,
                                            })}
                                            <span className="max-w-[12rem] truncate font-medium">
                                                {file.name}
                                            </span>
                                            <span className="shrink-0 text-gray-400">
                                                {formatFileSize(file.size)}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] md:hidden">
                            {ragStatus.files.length === 0 ? (
                                <div className="admin-md3__muted px-4 py-10 text-center text-sm">
                                    {t('admin.rag.empty')}
                                </div>
                            ) : ragStatus.files.map((file) => (
                                <article
                                    key={file.id}
                                    className="p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        {renderFileTypeIcon(file.name, {
                                            className: 'mt-0.5 shrink-0',
                                        })}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h4 className="truncate text-sm font-semibold">
                                                        {file.name}
                                                    </h4>
                                                    <p className="admin-md3__muted mt-1 text-xs">
                                                        {file.sha256 ? file.sha256.slice(0, 12) : '-'}
                                                    </p>
                                                </div>
                                                <span className={`${ragFileStatusBadgeClass(file.status, file.indexed)} shrink-0`}>
                                                    {t(ragFileStatusTranslationKey(file.status, file.indexed))}
                                                </span>
                                            </div>
                                            {file.usedOcr && (
                                                <span className="admin-md3__chip admin-md3__chip--info mt-2 text-[11px]">
                                                    PaddleOCR
                                                </span>
                                            )}
                                            {file.errorMessage && (
                                                <p className="mt-2 break-all text-xs text-[var(--md-sys-color-error)]">
                                                    {file.errorMessage}
                                                </p>
                                            )}
                                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <dt className="admin-md3__muted text-xs">
                                                        {t('admin.fields.size')}
                                                    </dt>
                                                    <dd className="mt-1 font-medium">
                                                        {formatFileSize(file.size)}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="admin-md3__muted text-xs">
                                                        {t('admin.fields.chunks')}
                                                    </dt>
                                                    <dd className="mt-1 font-medium">
                                                        {file.chunkCount}
                                                    </dd>
                                                </div>
                                                <div className="col-span-2">
                                                    <dt className="admin-md3__muted text-xs">
                                                        {t('admin.fields.updatedAt')}
                                                    </dt>
                                                    <dd className="mt-1 font-medium">
                                                        {formatDate(file.modifiedAt, currentLocale)}
                                                    </dd>
                                                </div>
                                            </dl>
                                            <div className="mt-3 flex justify-end">
                                                <md-icon-button
                                                    type="button"
                                                    onClick={() => void handleRagDelete(file.id, file.name)}
                                                    disabled={saving}
                                                    title={t('deleteConversation')}
                                                >
                                                    <Delete02Icon size={16} />
                                                </md-icon-button>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="admin-md3__table min-w-[780px]">
                                <thead>
                                    <tr>
                                        <th>{t('admin.fields.file')}</th>
                                        <th>{t('admin.fields.size')}</th>
                                        <th>{t('admin.fields.chunks')}</th>
                                        <th>{t('admin.fields.updatedAt')}</th>
                                        <th>{t('admin.fields.status')}</th>
                                        <th className="text-right">{t('admin.fields.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ragStatus.files.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="admin-md3__muted py-10 text-center"
                                            >
                                                {t('admin.rag.empty')}
                                            </td>
                                        </tr>
                                    ) : ragStatus.files.map((file) => (
                                        <tr key={file.id}>
                                            <td>
                                                <div className="flex max-w-[320px] items-start gap-2">
                                                    {renderFileTypeIcon(file.name, {
                                                        className: 'mt-0.5 shrink-0',
                                                    })}
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium">
                                                            {file.name}
                                                        </div>
                                                        {file.usedOcr && (
                                                            <span className="admin-md3__chip admin-md3__chip--info mt-1 text-[11px]">
                                                                PaddleOCR
                                                            </span>
                                                        )}
                                                        <div className="admin-md3__muted text-xs">
                                                            {file.sha256 ? file.sha256.slice(0, 12) : '-'}
                                                        </div>
                                                        {file.errorMessage && (
                                                            <div className="mt-1 truncate text-xs text-[var(--md-sys-color-error)]">
                                                                {file.errorMessage}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="admin-md3__muted">
                                                {formatFileSize(file.size)}
                                            </td>
                                            <td className="admin-md3__muted">
                                                {file.chunkCount}
                                            </td>
                                            <td className="admin-md3__muted">
                                                {formatDate(file.modifiedAt, currentLocale)}
                                            </td>
                                            <td>
                                                <span className={ragFileStatusBadgeClass(file.status, file.indexed)}>
                                                    {t(ragFileStatusTranslationKey(file.status, file.indexed))}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex justify-end">
                                                    <md-icon-button
                                                        type="button"
                                                        onClick={() => void handleRagDelete(file.id, file.name)}
                                                        disabled={saving}
                                                        title={t('deleteConversation')}
                                                    >
                                                        <Delete02Icon size={16} />
                                                    </md-icon-button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="admin-md3__pane p-5">
                        <h3 className="text-base font-semibold">
                            {t('admin.rag.vectorDatabase')}
                        </h3>
                        <dl className="mt-4 space-y-3 text-sm">
                            <div>
                                <dt className="admin-md3__muted">{t('admin.fields.collection')}</dt>
                                <dd className="mt-1 break-all font-medium">
                                    {ragStatus.collectionName}
                                </dd>
                            </div>
                            <div>
                                <dt className="admin-md3__muted">{t('admin.fields.dataPath')}</dt>
                                <dd className="mt-1 break-all font-medium">
                                    {ragStatus.dataPath}
                                </dd>
                            </div>
                            <div>
                                <dt className="admin-md3__muted">{t('admin.fields.persistDirectory')}</dt>
                                <dd className="mt-1 break-all font-medium">
                                    {ragStatus.persistDirectory}
                                </dd>
                            </div>
                            <div>
                                <dt className="admin-md3__muted">{t('admin.fields.fileTypes')}</dt>
                                <dd className="mt-1 font-medium">
                                    {ragStatus.allowedFileTypes.join(', ')}
                                </dd>
                            </div>
                        </dl>
                        <md-filled-button
                            type="button"
                            onClick={() => void handleRagRebuild()}
                            disabled={saving}
                            className="mt-5 w-full"
                        >
                            <span slot="icon" className="admin-md3__slot-icon">
                                <Refresh01Icon size={16} className={saving ? 'animate-spin' : ''} />
                            </span>
                            {t('admin.rag.rebuild')}
                        </md-filled-button>
                    </div>
                </div>
            </div>
        );
    };

    const renderActiveTab = () => {
        if (loading) {
            return (
                <div className="admin-md3__muted flex min-h-[320px] items-center justify-center gap-3">
                    <md-circular-progress indeterminate></md-circular-progress>
                    <span>{t('loading')}</span>
                </div>
            );
        }

        if (activeTab === 'dashboard') {
            return renderDashboard();
        }

        if (activeTab === 'users') {
            return renderUsers();
        }

        if (activeTab === 'conversations') {
            return renderConversations();
        }

        if (activeTab === 'rag') {
            return renderRag();
        }

        if (activeTab === 'web-search') {
            return renderWebSearchConfig();
        }

        if (activeTab === 'ocr') {
            return renderPaddleOcrConfig();
        }

        return renderModelConfig();
    };

    return (
        <div className="admin-md3 flex min-h-0 flex-1 flex-col">
            <div className="admin-md3__top-app-bar flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                    <h2 className="text-2xl font-semibold">
                        {t('admin.title')}
                    </h2>
                    <p className="admin-md3__muted mt-1 text-sm">
                        {t('admin.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <md-icon-button
                        type="button"
                        onClick={() => void refreshAll()}
                        title={t('refresh')}
                    >
                        <Refresh01Icon size={18} />
                    </md-icon-button>
                    <md-icon-button
                        type="button"
                        onClick={onClose}
                        title={t('close')}
                    >
                        <Cancel01Icon size={18} />
                    </md-icon-button>
                </div>
            </div>

            <div className="admin-md3__tab-bar px-3 sm:px-6">
                <md-tabs
                    activeTabIndex={activeTabIndex}
                    onChange={handleTabsChange}
                >
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <md-primary-tab
                                key={tab.key}
                            >
                                <span slot="icon" className="admin-md3__slot-icon">
                                    <Icon size={16} />
                                </span>
                                {tab.label}
                            </md-primary-tab>
                        );
                    })}
                </md-tabs>
            </div>

            {(errorMessage || statusMessage) && (
                <div className="px-3 pt-3 sm:px-6 sm:pt-4">
                    <div className={errorMessage
                        ? 'rounded-2xl border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)] break-words'
                        : 'rounded-2xl border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-primary-container)] break-words'}
                    >
                        {errorMessage ?? statusMessage}
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
                {renderActiveTab()}
            </div>
        </div>
    );
}
