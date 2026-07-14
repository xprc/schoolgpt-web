import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
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
} from '../utils/apiAdmin';
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
    { key: 'ocr', label: '百度 OCR', icon: BotIcon },
    { key: 'rag', label: 'RAG 知识库', icon: Search01Icon },
];

const activeRagFileStatuses = new Set(['pending', 'extracting', 'ocr', 'rendering', 'indexing']);

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

    if (status === 'extracting') {
        return '提取中';
    }

    if (status === 'ocr') {
        return 'OCR 识别中';
    }

    if (status === 'rendering') {
        return '生成预览';
    }

    if (status === 'indexing') {
        return '入库中';
    }

    return indexed ? '已入库' : '待生成';
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

const paddleOcrDraftFromConfig = (): { apiKey: string } => {
    return { apiKey: '' };
};

export default function AdminCenter({ onClose, onAuthExpired }: AdminCenterProps) {
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
            setStatusMessage('百度 PaddleOCR 配置已保存');
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
                            className="admin-md3__pane p-5"
                        >
                            <div className="admin-md3__muted text-sm">
                                {stat.label}
                            </div>
                            <div className="mt-2 text-3xl font-semibold">
                                {formatCount(stat.value)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <div className="admin-md3__pane p-5">
                        <h3 className="text-base font-semibold">
                            用户类型
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
                            当前模型
                        </h3>
                        <dl className="mt-4 grid gap-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <dt className="admin-md3__muted">供应商</dt>
                                <dd className="font-medium">
                                    {dashboard.activeModel.providerLabel}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <dt className="admin-md3__muted">模型</dt>
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
                    className="admin-md3__pane p-5"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-base font-semibold">
                            {editingUserId === null ? '新增用户' : '编辑用户'}
                        </h3>
                        {editingUserId !== null && (
                            <md-icon-button
                                type="button"
                                onClick={resetUserForm}
                                title="取消编辑"
                            >
                                <Cancel01Icon size={16} />
                            </md-icon-button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <md-outlined-text-field
                            className="admin-md3__field"
                            label="用户名"
                            value={userDraft.username}
                            onInput={(event) =>
                                setUserDraft((prev) => ({
                                    ...prev,
                                    username: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-text-field
                            className="admin-md3__field"
                            label="显示名称"
                            value={userDraft.displayName}
                            onInput={(event) =>
                                setUserDraft((prev) => ({
                                    ...prev,
                                    displayName: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="email"
                            label="邮箱"
                            value={userDraft.email}
                            onInput={(event) =>
                                setUserDraft((prev) => ({
                                    ...prev,
                                    email: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="password"
                            label="密码"
                            supportingText={editingUserId === null ? '' : '留空则不修改'}
                            value={userDraft.password ?? ''}
                            onInput={(event) =>
                                setUserDraft((prev) => ({
                                    ...prev,
                                    password: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-select
                            className="admin-md3__field"
                            label="用户类型"
                            value={userDraft.userType}
                            menuPositioning="fixed"
                            onInput={(event) =>
                                setUserDraft((prev) => ({
                                    ...prev,
                                    userType: (event.currentTarget as MaterialSelectElement).value as UserType,
                                }))
                            }
                        >
                            {Object.entries(userTypeLabels).map(([value, label]) => (
                                <md-select-option
                                    key={value}
                                    value={value}
                                    headline={label}
                                    selected={userDraft.userType === value}
                                />
                            ))}
                        </md-outlined-select>
                        <label className="admin-md3__muted flex items-center gap-3 text-sm">
                            <md-switch
                                selected={userDraft.isActive}
                                onChange={(event) =>
                                    setUserDraft((prev) => ({
                                        ...prev,
                                        isActive: (event.currentTarget as MaterialSwitchElement).selected,
                                    }))
                                }
                            />
                            <span>启用账号</span>
                        </label>
                    </div>

                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5 w-full"
                    >
                        {editingUserId === null ? <Add01Icon size={16} /> : <Tick02Icon size={16} />}
                        {editingUserId === null ? '创建用户' : '保存用户'}
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane min-w-0 overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-[var(--md-sys-color-outline-variant)] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-base font-semibold">
                            用户列表
                        </h3>
                        <md-outlined-text-field
                            className="admin-md3__field sm:max-w-xs"
                            type="search"
                            label="搜索用户"
                            value={userSearch}
                            onInput={(event) =>
                                setUserSearch((event.currentTarget as MaterialTextFieldElement).value)
                            }
                        >
                            <Search01Icon slot="leading-icon" size={16} />
                        </md-outlined-text-field>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="admin-md3__table min-w-[760px]">
                            <thead>
                                <tr>
                                    <th>用户</th>
                                    <th>类型</th>
                                    <th>状态</th>
                                    <th>最后登录</th>
                                    <th className="text-right">操作</th>
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
                                                {user.isActive ? '启用' : '停用'}
                                            </span>
                                        </td>
                                        <td className="admin-md3__muted">
                                            {formatDate(user.lastLoginAt)}
                                        </td>
                                        <td>
                                            <div className="flex justify-end">
                                                <md-icon-button
                                                    type="button"
                                                    onClick={() => handleEditUser(user)}
                                                    title="编辑"
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
                        对话列表
                    </h3>
                    <md-outlined-text-field
                        className="admin-md3__field sm:max-w-xs"
                        type="search"
                        label="搜索标题或用户"
                        value={conversationSearch}
                        onInput={(event) =>
                            setConversationSearch((event.currentTarget as MaterialTextFieldElement).value)
                        }
                    >
                        <Search01Icon slot="leading-icon" size={16} />
                    </md-outlined-text-field>
                </div>
                <div className="overflow-x-auto">
                    <table className="admin-md3__table min-w-[920px]">
                        <thead>
                            <tr>
                                <th>对话</th>
                                <th>所有者</th>
                                <th>共享</th>
                                <th>消息数</th>
                                <th>更新时间</th>
                                <th>状态</th>
                                <th className="text-right">操作</th>
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
                                        {formatDate(conversation.updatedAt)}
                                    </td>
                                    <td>
                                        <span className={conversation.isVisible
                                            ? 'admin-md3__chip admin-md3__chip--success'
                                            : 'admin-md3__chip admin-md3__chip--neutral'}
                                        >
                                            {conversation.isVisible ? '可见' : '已隐藏'}
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
                                                title={conversation.isVisible ? '隐藏' : '恢复'}
                                            >
                                                {conversation.isVisible
                                                    ? <Cancel01Icon size={16} />
                                                    : <Tick02Icon size={16} />}
                                            </md-icon-button>
                                            <md-icon-button
                                                type="button"
                                                onClick={() => handleDeleteConversation(conversation)}
                                                title="删除"
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
                        模型配置
                    </h3>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <md-outlined-select
                            className="admin-md3__field"
                            label="模型供应商"
                            value={modelDraft.provider}
                            menuPositioning="fixed"
                            onInput={(event) =>
                                handleProviderChange((event.currentTarget as MaterialSelectElement).value as 'deepseek' | 'qwen')
                            }
                        >
                            {providerOptions.map((option) => (
                                <md-select-option
                                    key={option.provider}
                                    value={option.provider}
                                    headline={option.label}
                                    selected={modelDraft.provider === option.provider}
                                />
                            ))}
                        </md-outlined-select>
                        <md-outlined-text-field
                            className="admin-md3__field"
                            label="模型名称"
                            value={modelDraft.modelName}
                            supportingText={selectedProvider?.models.length
                                ? `可用：${selectedProvider.models.slice(0, 3).join(', ')}`
                                : ''}
                            onInput={(event) =>
                                setModelDraft((prev) => ({
                                    ...prev,
                                    modelName: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-text-field
                            className="admin-md3__field sm:col-span-2"
                            label="Base URL"
                            value={modelDraft.baseUrl}
                            onInput={(event) =>
                                setModelDraft((prev) => ({
                                    ...prev,
                                    baseUrl: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-text-field
                            className="admin-md3__field sm:col-span-2"
                            label="Chat API Path"
                            value={modelDraft.apiPath}
                            onInput={(event) =>
                                setModelDraft((prev) => ({
                                    ...prev,
                                    apiPath: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <md-outlined-text-field
                            className="admin-md3__field sm:col-span-2"
                            type="password"
                            label="API Key"
                            value={modelDraft.apiKey}
                            supportingText={modelConfig?.hasApiKey
                                ? `已保存 ${modelConfig.apiKeyMask}`
                                : '请输入 API Key'}
                            onInput={(event) =>
                                setModelDraft((prev) => ({
                                    ...prev,
                                    apiKey: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                    </div>
                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5"
                    >
                        <Tick02Icon slot="icon" size={16} />
                        保存配置
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane p-5">
                    <h3 className="text-base font-semibold">
                        当前生效
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="admin-md3__muted">供应商</dt>
                            <dd className="mt-1 font-medium">
                                {modelConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">模型</dt>
                            <dd className="mt-1 font-medium">
                                {modelConfig?.modelName ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">接口</dt>
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
                    className="admin-md3__pane p-5"
                >
                    <h3 className="text-base font-semibold">
                        联网搜索
                    </h3>
                    <div className="mt-5 space-y-4">
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="password"
                            label="Tavily API Key"
                            value={webSearchDraft.apiKey}
                            supportingText={webSearchConfig?.hasApiKey
                                ? `已保存 ${webSearchConfig.apiKeyMask}`
                                : '请输入 Tavily API Key'}
                            onInput={(event) =>
                                setWebSearchDraft((prev) => ({
                                    ...prev,
                                    apiKey: (event.currentTarget as MaterialTextFieldElement).value,
                                }))
                            }
                        />
                        <label className="admin-md3__muted flex items-center gap-3 text-sm">
                            <md-switch
                                selected={webSearchDraft.isEnabled}
                                onChange={(event) =>
                                    setWebSearchDraft((prev) => ({
                                        ...prev,
                                        isEnabled: (event.currentTarget as MaterialSwitchElement).selected,
                                    }))
                                }
                            />
                            <span>启用联网搜索</span>
                        </label>
                    </div>
                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5"
                    >
                        <Tick02Icon slot="icon" size={16} />
                        保存配置
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane p-5">
                    <h3 className="text-base font-semibold">
                        当前生效
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="admin-md3__muted">供应商</dt>
                            <dd className="mt-1 font-medium">
                                {webSearchConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">状态</dt>
                            <dd className={webSearchConfig?.isEnabled
                                ? 'mt-1 font-medium text-emerald-600 dark:text-emerald-300'
                                : 'admin-md3__muted mt-1 font-medium'}
                            >
                                {webSearchConfig?.isEnabled ? '启用' : '停用'}
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
                                    : '未配置'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">更新时间</dt>
                            <dd className="mt-1 font-medium">
                                {formatDate(webSearchConfig?.updatedAt ?? null)}
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
                        百度 PaddleOCR
                    </h3>
                    <p className="admin-md3__muted mt-2 text-sm leading-6">
                        用于 PNG、JPG、JPEG 和图片型 PDF 的异步识别。这里填写的是百度 AI Studio
                        访问令牌（Access Token），界面按 API Key 管理。
                    </p>
                    <div className="mt-5 space-y-4">
                        <md-outlined-text-field
                            className="admin-md3__field"
                            type="password"
                            label="百度 API Key / Access Token"
                            value={paddleOcrDraft.apiKey}
                            supportingText={paddleOcrConfig?.hasApiKey
                                ? `已保存 ${paddleOcrConfig.apiKeyMask}`
                                : '请输入 AI Studio Access Token'}
                            onInput={(event) =>
                                setPaddleOcrDraft({
                                    apiKey: (event.currentTarget as MaterialTextFieldElement).value,
                                })
                            }
                        />
                    </div>
                    <md-filled-button
                        type="submit"
                        disabled={saving}
                        className="mt-5"
                    >
                        <Tick02Icon slot="icon" size={16} />
                        保存配置
                    </md-filled-button>
                </form>

                <div className="admin-md3__pane p-5">
                    <h3 className="text-base font-semibold">
                        当前生效
                    </h3>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div>
                            <dt className="admin-md3__muted">供应商</dt>
                            <dd className="mt-1 font-medium">
                                {paddleOcrConfig?.providerLabel ?? '-'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">模型</dt>
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
                                    : '未配置'}
                            </dd>
                        </div>
                        <div>
                            <dt className="admin-md3__muted">更新时间</dt>
                            <dd className="mt-1 font-medium">
                                {formatDate(paddleOcrConfig?.updatedAt ?? null)}
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
                            className="admin-md3__pane p-5"
                        >
                            <div className="admin-md3__muted text-sm">
                                {stat.label}
                            </div>
                            <div className="mt-2 text-3xl font-semibold">
                                {formatCount(stat.value)}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="admin-md3__pane min-w-0 overflow-hidden">
                        <div className="flex flex-col gap-3 border-b border-[var(--md-sys-color-outline-variant)] p-4 lg:flex-row lg:items-center lg:justify-between">
                            <h3 className="text-base font-semibold">
                                知识文件
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
                                >
                                    <Add01Icon slot="icon" size={16} />
                                    上传
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
                        <div className="overflow-x-auto">
                            <table className="admin-md3__table min-w-[780px]">
                                <thead>
                                    <tr>
                                        <th>文件</th>
                                        <th>大小</th>
                                        <th>分片</th>
                                        <th>更新时间</th>
                                        <th>状态</th>
                                        <th className="text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ragStatus.files.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={6}
                                                className="admin-md3__muted py-10 text-center"
                                            >
                                                暂无知识文件
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
                                                {formatDate(file.modifiedAt)}
                                            </td>
                                            <td>
                                                <span className={ragFileStatusBadgeClass(file.status, file.indexed)}>
                                                    {ragFileStatusLabel(file.status, file.indexed)}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex justify-end">
                                                    <md-icon-button
                                                        type="button"
                                                        onClick={() => void handleRagDelete(file.id, file.name)}
                                                        disabled={saving}
                                                        title="删除"
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
                            向量库
                        </h3>
                        <dl className="mt-4 space-y-3 text-sm">
                            <div>
                                <dt className="admin-md3__muted">Collection</dt>
                                <dd className="mt-1 break-all font-medium">
                                    {ragStatus.collectionName}
                                </dd>
                            </div>
                            <div>
                                <dt className="admin-md3__muted">文件目录</dt>
                                <dd className="mt-1 break-all font-medium">
                                    {ragStatus.dataPath}
                                </dd>
                            </div>
                            <div>
                                <dt className="admin-md3__muted">数据库目录</dt>
                                <dd className="mt-1 break-all font-medium">
                                    {ragStatus.persistDirectory}
                                </dd>
                            </div>
                            <div>
                                <dt className="admin-md3__muted">文件类型</dt>
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
                            <Refresh01Icon slot="icon" size={16} className={saving ? 'animate-spin' : ''} />
                            生成数据库
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
                    <span>加载中</span>
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
                        Admin 管理中心
                    </h2>
                    <p className="admin-md3__muted mt-1 text-sm">
                        数据、用户、对话、模型、联网搜索、OCR 和 RAG 配置
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <md-icon-button
                        type="button"
                        onClick={() => void refreshAll()}
                        title="刷新"
                    >
                        <Refresh01Icon size={18} />
                    </md-icon-button>
                    <md-icon-button
                        type="button"
                        onClick={onClose}
                        title="关闭"
                    >
                        <Cancel01Icon size={18} />
                    </md-icon-button>
                </div>
            </div>

            <div className="admin-md3__tab-bar px-4 sm:px-6">
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
                                <Icon slot="icon" size={16} />
                                {tab.label}
                            </md-primary-tab>
                        );
                    })}
                </md-tabs>
            </div>

            {(errorMessage || statusMessage) && (
                <div className="px-4 pt-4 sm:px-6">
                    <div className={errorMessage
                        ? 'rounded-2xl border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]'
                        : 'rounded-2xl border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-primary-container)]'}
                    >
                        {errorMessage ?? statusMessage}
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {renderActiveTab()}
            </div>
        </div>
    );
}
