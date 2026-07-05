import { apiBaseUrl } from './apiConfig';
import { ApiAuthError } from './apiChat';
import { ApiRequestError } from './apiConversations';
import { getAccessToken } from './auth';

export type UserType = 'student' | 'teacher' | 'maintenance' | 'admin';

export type AdminUser = {
    id: number;
    username: string;
    email: string;
    avatarSha256: string;
    displayName: string;
    userType: UserType;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    lastLoginAt: string | null;
};

export type AdminConversation = {
    id: string;
    title: string;
    ownerUserId: number;
    ownerUsername: string;
    ownerEmail: string;
    shareScope: string;
    isVisible: boolean;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
};

export type ModelProviderOption = {
    provider: 'deepseek' | 'qwen';
    label: string;
    baseUrl: string;
    apiPath: string;
    models: string[];
};

export type ModelConfig = {
    id: number;
    provider: 'deepseek' | 'qwen';
    providerLabel: string;
    modelName: string;
    baseUrl: string;
    apiPath: string;
    hasApiKey: boolean;
    apiKeyMask: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type WebSearchConfig = {
    id: number;
    provider: 'tavily';
    providerLabel: string;
    hasApiKey: boolean;
    apiKeyMask: string;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AdminDashboard = {
    totalUsers: number;
    activeUsers: number;
    usersByType: Record<string, number>;
    totalConversations: number;
    visibleConversations: number;
    totalMessages: number;
    activeModel: ModelConfig;
};

export type RagKnowledgeFile = {
    id: number;
    name: string;
    size: number;
    modifiedAt: string;
    sha256: string;
    status: string;
    errorMessage: string | null;
    ocrUsed: boolean;
    indexed: boolean;
    chunkCount: number;
};

export type RagStatus = {
    collectionName: string;
    dataPath: string;
    persistDirectory: string;
    allowedFileTypes: string[];
    totalFiles: number;
    indexedFiles: number;
    vectorCount: number;
    files: RagKnowledgeFile[];
};

type AdminUserResponse = {
    id: number;
    username: string;
    email: string;
    avatar_sha256: string;
    display_name: string;
    user_type: UserType;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_login_at: string | null;
};

type AdminConversationResponse = {
    id: string;
    title: string;
    owner_user_id: number;
    owner_username: string;
    owner_email: string;
    share_scope: string;
    is_visible: boolean;
    message_count: number;
    created_at: string;
    updated_at: string;
};

type ModelProviderOptionResponse = {
    provider: 'deepseek' | 'qwen';
    label: string;
    base_url: string;
    api_path: string;
    models: string[];
};

type ModelConfigResponse = {
    id: number;
    provider: 'deepseek' | 'qwen';
    provider_label: string;
    model_name: string;
    base_url: string;
    api_path: string;
    has_api_key: boolean;
    api_key_mask: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

type WebSearchConfigResponse = {
    id: number;
    provider: 'tavily';
    provider_label: string;
    has_api_key: boolean;
    api_key_mask: string;
    is_enabled: boolean;
    created_at: string;
    updated_at: string;
};

type AdminDashboardResponse = {
    total_users: number;
    active_users: number;
    users_by_type: Record<string, number>;
    total_conversations: number;
    visible_conversations: number;
    total_messages: number;
    active_model: ModelConfigResponse;
};

type RagKnowledgeFileResponse = {
    id: number;
    name: string;
    size: number;
    modified_at: string;
    sha256: string;
    status: string;
    error_message: string | null;
    ocr_used: boolean;
    indexed: boolean;
    chunk_count: number;
};

type RagStatusResponse = {
    collection_name: string;
    data_path: string;
    persist_directory: string;
    allowed_file_types: string[];
    total_files: number;
    indexed_files: number;
    vector_count: number;
    files: RagKnowledgeFileResponse[];
};

export type AdminUserDraft = {
    username: string;
    email: string;
    password?: string;
    displayName: string;
    userType: UserType;
    isActive: boolean;
};

export type ModelConfigDraft = {
    provider: 'deepseek' | 'qwen';
    modelName: string;
    baseUrl: string;
    apiPath: string;
    apiKey?: string | null;
};

export type WebSearchConfigDraft = {
    apiKey?: string | null;
    isEnabled: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const readErrorMessage = async (response: Response): Promise<string> => {
    try {
        const payload: unknown = await response.json();
        if (isRecord(payload) && typeof payload.detail === 'string') {
            return payload.detail;
        }
    } catch {
        return '请求失败，请稍后重试';
    }

    return '请求失败，请稍后重试';
};

const authHeaders = (): HeadersInit => {
    const accessToken = getAccessToken();
    if (!accessToken) {
        throw new ApiAuthError('请先登录');
    }

    return {
        Authorization: `Bearer ${accessToken}`,
    };
};

const jsonAuthHeaders = (): HeadersInit => {
    return {
        ...authHeaders(),
        'Content-Type': 'application/json',
    };
};

const ensureOk = async (response: Response): Promise<void> => {
    if (response.ok) {
        return;
    }

    if (response.status === 401) {
        throw new ApiAuthError('登录已过期，请重新登录');
    }

    throw new ApiRequestError(response.status, await readErrorMessage(response));
};

const normalizeUser = (user: AdminUserResponse): AdminUser => {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarSha256: user.avatar_sha256,
        displayName: user.display_name,
        userType: user.user_type,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastLoginAt: user.last_login_at,
    };
};

const normalizeConversation = (
    conversation: AdminConversationResponse
): AdminConversation => {
    return {
        id: conversation.id,
        title: conversation.title,
        ownerUserId: conversation.owner_user_id,
        ownerUsername: conversation.owner_username,
        ownerEmail: conversation.owner_email,
        shareScope: conversation.share_scope,
        isVisible: conversation.is_visible,
        messageCount: conversation.message_count,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
    };
};

const normalizeProviderOption = (
    option: ModelProviderOptionResponse
): ModelProviderOption => {
    return {
        provider: option.provider,
        label: option.label,
        baseUrl: option.base_url,
        apiPath: option.api_path,
        models: option.models,
    };
};

const normalizeModelConfig = (config: ModelConfigResponse): ModelConfig => {
    return {
        id: config.id,
        provider: config.provider,
        providerLabel: config.provider_label,
        modelName: config.model_name,
        baseUrl: config.base_url,
        apiPath: config.api_path,
        hasApiKey: config.has_api_key,
        apiKeyMask: config.api_key_mask,
        isActive: config.is_active,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
    };
};

const normalizeWebSearchConfig = (
    config: WebSearchConfigResponse
): WebSearchConfig => {
    return {
        id: config.id,
        provider: config.provider,
        providerLabel: config.provider_label,
        hasApiKey: config.has_api_key,
        apiKeyMask: config.api_key_mask,
        isEnabled: config.is_enabled,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
    };
};

const normalizeDashboard = (dashboard: AdminDashboardResponse): AdminDashboard => {
    return {
        totalUsers: dashboard.total_users,
        activeUsers: dashboard.active_users,
        usersByType: dashboard.users_by_type,
        totalConversations: dashboard.total_conversations,
        visibleConversations: dashboard.visible_conversations,
        totalMessages: dashboard.total_messages,
        activeModel: normalizeModelConfig(dashboard.active_model),
    };
};

const normalizeRagFile = (file: RagKnowledgeFileResponse): RagKnowledgeFile => {
    return {
        id: file.id,
        name: file.name,
        size: file.size,
        modifiedAt: file.modified_at,
        sha256: file.sha256,
        status: file.status,
        errorMessage: file.error_message,
        ocrUsed: file.ocr_used,
        indexed: file.indexed,
        chunkCount: file.chunk_count,
    };
};

const normalizeRagStatus = (status: RagStatusResponse): RagStatus => {
    return {
        collectionName: status.collection_name,
        dataPath: status.data_path,
        persistDirectory: status.persist_directory,
        allowedFileTypes: status.allowed_file_types,
        totalFiles: status.total_files,
        indexedFiles: status.indexed_files,
        vectorCount: status.vector_count,
        files: status.files.map(normalizeRagFile),
    };
};

export const fetchAdminDashboard = async (): Promise<AdminDashboard> => {
    const response = await fetch(`${apiBaseUrl}/admin/dashboard`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeDashboard((await response.json()) as AdminDashboardResponse);
};

export const fetchAdminUsers = async (): Promise<AdminUser[]> => {
    const response = await fetch(`${apiBaseUrl}/admin/users`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    const payload = (await response.json()) as AdminUserResponse[];
    return payload.map(normalizeUser);
};

export const createAdminUser = async (draft: AdminUserDraft): Promise<AdminUser> => {
    const response = await fetch(`${apiBaseUrl}/admin/users`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            username: draft.username,
            email: draft.email,
            password: draft.password,
            display_name: draft.displayName,
            user_type: draft.userType,
            is_active: draft.isActive,
        }),
    });
    await ensureOk(response);

    return normalizeUser((await response.json()) as AdminUserResponse);
};

export const updateAdminUser = async (
    userId: number,
    draft: AdminUserDraft
): Promise<AdminUser> => {
    const response = await fetch(`${apiBaseUrl}/admin/users/${userId}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            username: draft.username,
            email: draft.email,
            display_name: draft.displayName,
            user_type: draft.userType,
            is_active: draft.isActive,
        }),
    });
    await ensureOk(response);

    return normalizeUser((await response.json()) as AdminUserResponse);
};

export const updateAdminUserPassword = async (
    userId: number,
    password: string
): Promise<void> => {
    const response = await fetch(`${apiBaseUrl}/admin/users/${userId}/password`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            password,
        }),
    });
    await ensureOk(response);
};

export const fetchAdminConversations = async (): Promise<AdminConversation[]> => {
    const response = await fetch(`${apiBaseUrl}/admin/conversations`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    const payload = (await response.json()) as AdminConversationResponse[];
    return payload.map(normalizeConversation);
};

export const updateAdminConversationVisibility = async (
    conversationId: string,
    isVisible: boolean
): Promise<AdminConversation> => {
    const response = await fetch(`${apiBaseUrl}/admin/conversations/${conversationId}/visibility`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            is_visible: isVisible,
        }),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as AdminConversationResponse);
};

export const deleteAdminConversation = async (conversationId: string): Promise<void> => {
    const response = await fetch(`${apiBaseUrl}/admin/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    await ensureOk(response);
};

export const fetchModelConfig = async (): Promise<ModelConfig> => {
    const response = await fetch(`${apiBaseUrl}/admin/model-config`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeModelConfig((await response.json()) as ModelConfigResponse);
};

export const fetchModelProviderOptions = async (): Promise<ModelProviderOption[]> => {
    const response = await fetch(`${apiBaseUrl}/admin/model-config/providers`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    const payload = (await response.json()) as ModelProviderOptionResponse[];
    return payload.map(normalizeProviderOption);
};

export const updateModelConfig = async (
    draft: ModelConfigDraft
): Promise<ModelConfig> => {
    const payload: Record<string, unknown> = {
        provider: draft.provider,
        model_name: draft.modelName,
        base_url: draft.baseUrl,
        api_path: draft.apiPath,
    };

    if (draft.apiKey !== undefined) {
        payload.api_key = draft.apiKey;
    }

    const response = await fetch(`${apiBaseUrl}/admin/model-config`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(payload),
    });
    await ensureOk(response);

    return normalizeModelConfig((await response.json()) as ModelConfigResponse);
};

export const fetchWebSearchConfig = async (): Promise<WebSearchConfig> => {
    const response = await fetch(`${apiBaseUrl}/admin/web-search-config`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeWebSearchConfig(
        (await response.json()) as WebSearchConfigResponse
    );
};

export const updateWebSearchConfig = async (
    draft: WebSearchConfigDraft
): Promise<WebSearchConfig> => {
    const payload: Record<string, unknown> = {
        is_enabled: draft.isEnabled,
    };

    if (draft.apiKey !== undefined) {
        payload.api_key = draft.apiKey;
    }

    const response = await fetch(`${apiBaseUrl}/admin/web-search-config`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(payload),
    });
    await ensureOk(response);

    return normalizeWebSearchConfig(
        (await response.json()) as WebSearchConfigResponse
    );
};

export const fetchRagStatus = async (): Promise<RagStatus> => {
    const response = await fetch(`${apiBaseUrl}/admin/rag`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeRagStatus((await response.json()) as RagStatusResponse);
};

export const uploadRagFiles = async (files: File[]): Promise<RagStatus> => {
    const formData = new FormData();
    files.forEach((file) => {
        formData.append('files', file);
    });

    const response = await fetch(`${apiBaseUrl}/admin/rag/files`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    });
    await ensureOk(response);

    return normalizeRagStatus((await response.json()) as RagStatusResponse);
};

export const deleteRagFile = async (fileId: number): Promise<RagStatus> => {
    const response = await fetch(`${apiBaseUrl}/admin/rag/files/${fileId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeRagStatus((await response.json()) as RagStatusResponse);
};

export const rebuildRagDatabase = async (): Promise<RagStatus> => {
    const response = await fetch(`${apiBaseUrl}/admin/rag/rebuild`, {
        method: 'POST',
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeRagStatus((await response.json()) as RagStatusResponse);
};
