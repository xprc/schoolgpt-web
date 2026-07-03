import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
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
import { ApiAuthError } from '../utils/apiChat';
import {
    createAdminUser,
    deleteAdminConversation,
    deleteRagFile,
    fetchAdminConversations,
    fetchAdminDashboard,
    fetchAdminUsers,
    fetchModelConfig,
    fetchModelProviderOptions,
    fetchRagStatus,
    fetchWebSearchConfig,
    rebuildRagDatabase,
    updateAdminConversationVisibility,
    updateAdminUser,
    updateAdminUserPassword,
    updateModelConfig,
    updateWebSearchConfig,
    uploadRagFiles,
    type AdminConversation,
    type AdminDashboard,
    type AdminUser,
    type AdminUserDraft,
    type ModelConfig,
    type ModelProviderOption,
    type RagStatus,
    type UserType,
    type WebSearchConfig,
} from '../utils/apiAdmin';

type AdminTab = 'dashboard' | 'users' | 'conversations' | 'model' | 'web-search' | 'rag';

type AdminCenterProps = {
    onClose: () => void;
    onAuthExpired: () => void;
};

const emptyUserDraft: AdminUserDraft = {
    username: '',
    email: '',
    password: '',
    displayName: '',
    userType: 'student',
    isActive: true,
};

const userTypeLabels: Record<UserType, string> = {
    student: '学生',
    teacher: '老师',
    maintenance: '维护',
    admin: '管理员',
};

const tabs: Array<{ key: AdminTab; label: string; icon: typeof GridIcon }> = [
    { key: 'dashboard', label: '数据看板', icon: GridIcon },
    { key: 'users', label: '用户设置', icon: Edit01Icon },
    { key: 'conversations', label: '对话管理', icon: Chat01Icon },
    { key: 'model', label: '模型配置', icon: BotIcon },
    { key: 'web-search', label: '联网搜索', icon: Search01Icon },
    { key: 'rag', label: 'RAG 知识库', icon: Search01Icon },
];

const activeRagFileStatuses = new Set(['pending', 'converting', 'indexing']);

const isRagFileProcessing = (status: string): boolean => {
    return activeRagFileStatuses.has(status);
};

const ragFileStatusLabel = (status: string, indexed: boolean): string => {
    if (status === 'failed') {
        return '处理失败';
    }

    if (status === 'pending') {
        return '待处理';
    }

    if (status === 'converting') {
        return '转换中';
    }

    if (status === 'indexing') {
        return '入库中';
    }

    return indexed ? '已入库' : '待生成';
};

const ragFileStatusBadgeClass = (status: string, indexed: boolean): string => {
    if (status === 'failed') {
        return 'rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-200';
    }

    if (indexed) {
        return 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200';
    }

    if (isRagFileProcessing(status)) {
        return 'rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-200';
    }

    return 'rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-200';
};

const formatDate = (value: string | null): string => {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatCount = (value: number): string => {
    return new Intl.NumberFormat('zh-CN').format(value);
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

export default function AdminCenter({ onClose, onAuthExpired }: AdminCenterProps) {
    const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
    const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
    const [webSearchConfig, setWebSearchConfig] = useState<WebSearchConfig | null>(null);
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
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleError = (error: unknown) => {
        if (error instanceof ApiAuthError) {
            onAuthExpired();
            return;
        }

        setErrorMessage(error instanceof Error ? error.message : String(error));
    };

    const refreshAll = async () => {
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
                nextRagStatus,
            ] = await Promise.all([
                fetchAdminDashboard(),
                fetchAdminUsers(),
                fetchAdminConversations(),
                fetchModelConfig(),
                fetchModelProviderOptions(),
                fetchWebSearchConfig(),
                fetchRagStatus(),
            ]);
            setDashboard(nextDashboard);
            setUsers(nextUsers);
            setConversations(nextConversations);
            setModelConfig(nextConfig);
            setProviderOptions(nextProviderOptions);
            setWebSearchConfig(nextWebSearchConfig);
            setRagStatus(nextRagStatus);
            setModelDraft(modelDraftFromConfig(nextConfig));
            setWebSearchDraft(webSearchDraftFromConfig(nextWebSearchConfig));
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refreshAll();
    }, []);

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
    }, [userSearch, users]);

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
                    throw new Error('新建用户需要填写密码');
                }
                const createdUser = await createAdminUser(userDraft);
                setUsers((prev) => [createdUser, ...prev]);
                setStatusMessage('用户已创建');
            } else {
                const updatedUser = await updateAdminUser(editingUserId, userDraft);
                if (userDraft.password) {
                    await updateAdminUserPassword(editingUserId, userDraft.password);
                }
                setUsers((prev) =>
                    prev.map((user) => user.id === updatedUser.id ? updatedUser : user)
                );
                setStatusMessage('用户已更新');
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
        if (!window.confirm(`确定删除对话「${conversation.title}」？`)) {
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
            setStatusMessage('模型配置已保存');
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
            setStatusMessage('联网搜索配置已保存');
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
            setErrorMessage('请选择要上传的知识库文件');
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
            setStatusMessage('知识库文件已上传，正在后台生成');
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
            setStatusMessage('RAG 向量数据库已开始后台重建');
        } catch (error: unknown) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const handleRagDelete = async (fileId: number, fileName: string) => {
        if (!window.confirm(`确定删除知识库文件「${fileName}」？`)) {
            return;
        }

        setSaving(true);
        setErrorMessage(null);
        setStatusMessage(null);

        try {
            const nextStatus = await deleteRagFile(fileId);
            setRagStatus(nextStatus);
            setStatusMessage('知识库文件已删除');
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
            { label: '用户总数', value: dashboard.totalUsers },
            { label: '启用用户', value: dashboard.activeUsers },
            { label: '对话总数', value: dashboard.totalConversations },
            { label: '消息总数', value: dashboard.totalMessages },
        ];

        return (
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]"
                        >
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                {stat.label}
                            </div>
                            <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">
                                {formatCount(stat.value)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]">
                        <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                            用户类型
                        </h3>
                        <div className="mt-4 space-y-3">
                            {Object.entries(userTypeLabels).map(([userType, label]) => (
                                <div key={userType}>
                                    <div className="mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
                                        <span>{label}</span>
                                        <span>{dashboard.usersByType[userType] ?? 0}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10">
                                        <div
                                            className="h-2 rounded-full bg-[#5b6ef5]"
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

                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]">
                        <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                            当前模型
                        </h3>
                        <dl className="mt-4 grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-gray-500 dark:text-gray-400">供应商</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">
                                    {dashboard.activeModel.providerLabel}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-gray-500 dark:text-gray-400">模型</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">
                                    {dashboard.activeModel.modelName}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="text-gray-500 dark:text-gray-400">API Key</dt>
                                <dd className={dashboard.activeModel.hasApiKey
                                    ? 'font-medium text-emerald-600 dark:text-emerald-300'
                                    : 'font-medium text-red-600 dark:text-red-300'}
                                >
                                    {dashboard.activeModel.hasApiKey ? '已配置' : '未配置'}
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
                    className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                            {editingUserId === null ? '新增用户' : '编辑用户'}
                        </h3>
                        {editingUserId !== null && (
                            <button
                                type="button"
                                onClick={resetUserForm}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="取消编辑"
                            >
                                <Cancel01Icon size={16} />
                            </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                用户名
                            </span>
                            <input
                                value={userDraft.username}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        username: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                显示名称
                            </span>
                            <input
                                value={userDraft.displayName}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        displayName: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                邮箱
                            </span>
                            <input
                                type="email"
                                value={userDraft.email}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        email: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                密码
                            </span>
                            <input
                                type="password"
                                value={userDraft.password ?? ''}
                                placeholder={editingUserId === null ? '' : '留空则不修改'}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        password: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                用户类型
                            </span>
                            <select
                                value={userDraft.userType}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        userType: event.target.value as UserType,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            >
                                {Object.entries(userTypeLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={userDraft.isActive}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        isActive: event.target.checked,
                                    }))
                                }
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            启用账号
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5b6ef5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        {editingUserId === null ? <Add01Icon size={16} /> : <Tick02Icon size={16} />}
                        {editingUserId === null ? '创建用户' : '保存用户'}
                    </button>
                </form>

                <div className="min-w-0 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#151923]">
                    <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                            用户列表
                        </h3>
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
                            <Search01Icon size={16} className="text-gray-400" />
                            <input
                                value={userSearch}
                                onChange={(event) => setUserSearch(event.target.value)}
                                placeholder="搜索用户"
                                className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                                <tr>
                                    <th className="px-4 py-3">用户</th>
                                    <th className="px-4 py-3">类型</th>
                                    <th className="px-4 py-3">状态</th>
                                    <th className="px-4 py-3">最后登录</th>
                                    <th className="px-4 py-3 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id}>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-950 dark:text-white">
                                                {user.displayName}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {user.username} · {user.email}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                            {userTypeLabels[user.userType]}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={user.isActive
                                                ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                                                : 'rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-300'}
                                            >
                                                {user.isActive ? '启用' : '停用'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                            {formatDate(user.lastLoginAt)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditUser(user)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                                                    title="编辑"
                                                >
                                                    <Edit01Icon size={16} />
                                                </button>
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
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#151923]">
                <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                        对话列表
                    </h3>
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 dark:border-white/10">
                        <Search01Icon size={16} className="text-gray-400" />
                        <input
                            value={conversationSearch}
                            onChange={(event) => setConversationSearch(event.target.value)}
                            placeholder="搜索标题或用户"
                            className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-sm">
                        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                            <tr>
                                <th className="px-4 py-3">对话</th>
                                <th className="px-4 py-3">所有者</th>
                                <th className="px-4 py-3">共享</th>
                                <th className="px-4 py-3">消息数</th>
                                <th className="px-4 py-3">更新时间</th>
                                <th className="px-4 py-3">状态</th>
                                <th className="px-4 py-3 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                            {filteredConversations.map((conversation) => (
                                <tr key={conversation.id}>
                                    <td className="px-4 py-3">
                                        <div className="max-w-[280px] truncate font-medium text-gray-950 dark:text-white">
                                            {conversation.title}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {conversation.id}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-gray-800 dark:text-gray-200">
                                            {conversation.ownerUsername}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {conversation.ownerEmail}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                        {conversation.shareScope}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                        {conversation.messageCount}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                        {formatDate(conversation.updatedAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={conversation.isVisible
                                            ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                                            : 'rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-gray-300'}
                                        >
                                            {conversation.isVisible ? '可见' : '已隐藏'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleConversationVisibility(
                                                        conversation,
                                                        !conversation.isVisible
                                                    )
                                                }
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                                                title={conversation.isVisible ? '隐藏' : '恢复'}
                                            >
                                                {conversation.isVisible
                                                    ? <Cancel01Icon size={16} />
                                                    : <Tick02Icon size={16} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteConversation(conversation)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-200 dark:hover:bg-red-500/15"
                                                title="删除"
                                            >
                                                <Delete02Icon size={16} />
                                            </button>
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
                    className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]"
                >
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                        模型配置
                    </h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                模型供应商
                            </span>
                            <select
                                value={modelDraft.provider}
                                onChange={(event) =>
                                    handleProviderChange(event.target.value as 'deepseek' | 'qwen')
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            >
                                {providerOptions.map((option) => (
                                    <option key={option.provider} value={option.provider}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                模型名称
                            </span>
                            <input
                                list="admin-model-options"
                                value={modelDraft.modelName}
                                onChange={(event) =>
                                    setModelDraft((prev) => ({
                                        ...prev,
                                        modelName: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                            <datalist id="admin-model-options">
                                {selectedProvider?.models.map((model) => (
                                    <option key={model} value={model} />
                                ))}
                            </datalist>
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                Base URL
                            </span>
                            <input
                                value={modelDraft.baseUrl}
                                onChange={(event) =>
                                    setModelDraft((prev) => ({
                                        ...prev,
                                        baseUrl: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                Chat API Path
                            </span>
                            <input
                                value={modelDraft.apiPath}
                                onChange={(event) =>
                                    setModelDraft((prev) => ({
                                        ...prev,
                                        apiPath: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                API Key
                            </span>
                            <input
                                type="password"
                                value={modelDraft.apiKey}
                                placeholder={modelConfig?.hasApiKey
                                    ? `已保存 ${modelConfig.apiKeyMask}`
                                    : '请输入 API Key'}
                                onChange={(event) =>
                                    setModelDraft((prev) => ({
                                        ...prev,
                                        apiKey: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-[#5b6ef5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        <Tick02Icon size={16} />
                        保存配置
                    </button>
                </form>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]">
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                        当前生效
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">供应商</dt>
                            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                                {modelConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">模型</dt>
                            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                                {modelConfig?.modelName ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">接口</dt>
                            <dd className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                                {modelConfig
                                    ? `${modelConfig.baseUrl}${modelConfig.apiPath}`
                                    : '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">API Key</dt>
                            <dd className={modelConfig?.hasApiKey
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'mt-1 font-medium text-red-600 dark:text-red-300'}
                            >
                                {modelConfig?.hasApiKey ? modelConfig.apiKeyMask : '未配置'}
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
                    className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]"
                >
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                        联网搜索
                    </h3>
                    <div className="mt-5 space-y-4">
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                Tavily API Key
                            </span>
                            <input
                                type="password"
                                value={webSearchDraft.apiKey}
                                placeholder={webSearchConfig?.hasApiKey
                                    ? `已保存 ${webSearchConfig.apiKeyMask}`
                                    : '请输入 Tavily API Key'}
                                onChange={(event) =>
                                    setWebSearchDraft((prev) => ({
                                        ...prev,
                                        apiKey: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={webSearchDraft.isEnabled}
                                onChange={(event) =>
                                    setWebSearchDraft((prev) => ({
                                        ...prev,
                                        isEnabled: event.target.checked,
                                    }))
                                }
                                className="h-4 w-4 rounded border-gray-300"
                            />
                            启用联网搜索
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-[#5b6ef5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        <Tick02Icon size={16} />
                        保存配置
                    </button>
                </form>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]">
                    <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                        当前生效
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">供应商</dt>
                            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                                {webSearchConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">状态</dt>
                            <dd className={webSearchConfig?.isEnabled
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'mt-1 font-medium text-gray-500 dark:text-gray-300'}
                            >
                                {webSearchConfig?.isEnabled ? '启用' : '停用'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">API Key</dt>
                            <dd className={webSearchConfig?.hasApiKey
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'mt-1 font-medium text-red-600 dark:text-red-300'}
                            >
                                {webSearchConfig?.hasApiKey
                                    ? webSearchConfig.apiKeyMask
                                    : '未配置'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500 dark:text-gray-400">更新时间</dt>
                            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                                {formatDate(webSearchConfig?.updatedAt ?? null)}
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
            { label: '知识文件', value: ragStatus.totalFiles },
            { label: '已入库文件', value: ragStatus.indexedFiles },
            { label: '向量数量', value: ragStatus.vectorCount },
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
                            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]"
                        >
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                {stat.label}
                            </div>
                            <div className="mt-2 text-3xl font-semibold text-gray-950 dark:text-white">
                                {formatCount(stat.value)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="min-w-0 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#151923]">
                        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
                            <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                                知识文件
                            </h3>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                    key={ragFileInputKey}
                                    type="file"
                                    multiple
                                    accept={uploadAccept}
                                    onChange={handleRagFileChange}
                                    className="max-w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#eef2ff] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#4a5ce0] hover:file:bg-[#e0e7ff] dark:text-gray-300 dark:file:bg-white/10 dark:file:text-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleRagUpload()}
                                    disabled={saving || ragUploadFiles.length === 0}
                                    className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#5b6ef5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300"
                                >
                                    <Add01Icon size={16} />
                                    上传
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[780px] text-left text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                                    <tr>
                                        <th className="px-4 py-3">文件</th>
                                        <th className="px-4 py-3">大小</th>
                                        <th className="px-4 py-3">分片</th>
                                        <th className="px-4 py-3">更新时间</th>
                                        <th className="px-4 py-3">状态</th>
                                        <th className="px-4 py-3 text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                                    {ragStatus.files.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                                            >
                                                暂无知识文件
                                            </td>
                                        </tr>
                                    ) : ragStatus.files.map((file) => (
                                        <tr key={file.id}>
                                            <td className="px-4 py-3">
                                                <div className="max-w-[320px] truncate font-medium text-gray-950 dark:text-white">
                                                    {file.name}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {file.sha256 ? file.sha256.slice(0, 12) : '-'}
                                                </div>
                                                {file.errorMessage && (
                                                    <div className="mt-1 max-w-[320px] truncate text-xs text-red-600 dark:text-red-300">
                                                        {file.errorMessage}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                                {formatFileSize(file.size)}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                                {file.chunkCount}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                                {formatDate(file.modifiedAt)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={ragFileStatusBadgeClass(file.status, file.indexed)}>
                                                    {ragFileStatusLabel(file.status, file.indexed)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleRagDelete(file.id, file.name)}
                                                        disabled={saving}
                                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-200 dark:hover:bg-red-500/15"
                                                        title="删除"
                                                    >
                                                        <Delete02Icon size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#151923]">
                        <h3 className="text-base font-semibold text-gray-950 dark:text-white">
                            向量库
                        </h3>
                        <dl className="mt-4 space-y-3 text-sm">
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Collection</dt>
                                <dd className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                                    {ragStatus.collectionName}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">文件目录</dt>
                                <dd className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                                    {ragStatus.dataPath}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">数据库目录</dt>
                                <dd className="mt-1 break-all font-medium text-gray-900 dark:text-white">
                                    {ragStatus.persistDirectory}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">文件类型</dt>
                                <dd className="mt-1 font-medium text-gray-900 dark:text-white">
                                    {ragStatus.allowedFileTypes.join(', ')}
                                </dd>
                            </div>
                        </dl>
                        <button
                            type="button"
                            onClick={() => void handleRagRebuild()}
                            disabled={saving}
                            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5b6ef5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                            <Refresh01Icon size={16} className={saving ? 'animate-spin' : ''} />
                            生成数据库
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderActiveTab = () => {
        if (loading) {
            return (
                <div className="flex min-h-[320px] items-center justify-center text-gray-500 dark:text-gray-300">
                    <Refresh01Icon size={18} className="mr-2 animate-spin" />
                    加载中
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

        return renderModelConfig();
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white text-gray-900 dark:bg-[#1a1a1a] dark:text-gray-100">
            <div className="flex flex-col gap-4 border-b border-gray-200/70 p-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-950 dark:text-white">
                        Admin 管理中心
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        数据、用户、对话、模型、联网搜索和 RAG 配置
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void refreshAll()}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                        title="刷新"
                    >
                        <Refresh01Icon size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
                        title="关闭"
                    >
                        <Cancel01Icon size={18} />
                    </button>
                </div>
            </div>

            <div className="border-b border-gray-200/70 px-4 dark:border-white/10 sm:px-6">
                <div className="flex gap-1 overflow-x-auto py-3">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                                    active
                                        ? 'bg-[#eef2ff] text-[#4a5ce0] dark:bg-white/12 dark:text-white'
                                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {(errorMessage || statusMessage) && (
                <div className="px-4 pt-4 sm:px-6">
                    <div className={errorMessage
                        ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                        : 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'}
                    >
                        {errorMessage ?? statusMessage}
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 dark:bg-[#1a1a1a] sm:p-6">
                {renderActiveTab()}
            </div>
        </div>
    );
}
