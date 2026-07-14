import { apiBaseUrl } from './apiConfig';
import { getAccessToken } from './auth';
import { ApiAuthError } from './apiChat';
import type {
    Conversation,
    ConversationShareScope,
    ConversationSummary,
    Message,
    RagSource,
} from '../types';

type ConversationMessageResponse = {
    id: string;
    role: 'user' | 'ai';
    content: string;
    rag_sources?: Array<{
        file_id?: number;
        file_name: string;
        chunk_index?: number | null;
        page_number?: number | null;
        snippet?: string;
        confidence: number;
    }>;
    reasoning_content?: string | null;
    reasoning_duration_ms?: number | null;
    created_at: string;
    updated_at: string;
};

type ConversationResponse = {
    id: string;
    title: string;
    owner_user_id: number;
    share_scope: ConversationShareScope;
    permission: 'owner' | 'read' | 'write';
    can_write: boolean;
    is_pinned: boolean;
    pinned_at: string | null;
    is_visible: boolean;
    created_at: string;
    updated_at: string;
    messages: ConversationMessageResponse[];
};

type ConversationSummaryResponse = {
    id: string;
    title: string;
    share_scope: ConversationShareScope;
    permission: 'owner' | 'read' | 'write';
    can_write: boolean;
    is_pinned: boolean;
    pinned_at: string | null;
    is_visible: boolean;
    created_at: string;
    updated_at: string;
};

export class ApiRequestError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
    }
}

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

const normalizeRagSources = (
    sources: ConversationMessageResponse['rag_sources']
): RagSource[] => {
    if (!Array.isArray(sources)) {
        return [];
    }

    return sources
        .map((source): RagSource => {
            const confidence = Number(source.confidence ?? 0);
            const fileId = Number(source.file_id);
            const chunkIndex = Number(source.chunk_index);
            const pageNumber = Number(source.page_number);
            const normalizedSource: RagSource = {
                fileName: source.file_name,
                confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
            };
            if (Number.isFinite(fileId)) {
                normalizedSource.fileId = fileId;
            }
            if (Number.isFinite(chunkIndex)) {
                normalizedSource.chunkIndex = chunkIndex;
            }
            if (Number.isFinite(pageNumber)) {
                normalizedSource.pageNumber = pageNumber;
            }
            if (typeof source.snippet === 'string' && source.snippet.trim()) {
                normalizedSource.snippet = source.snippet;
            }

            return normalizedSource;
        })
        .filter((source) => source.fileName.trim().length > 0);
};

const normalizeMessage = (message: ConversationMessageResponse): Message => {
    return {
        id: message.id,
        role: message.role,
        content: message.content,
        ragSources: normalizeRagSources(message.rag_sources),
        reasoningContent: message.reasoning_content ?? null,
        reasoningDurationMs: message.reasoning_duration_ms ?? null,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
    };
};

const normalizeConversation = (conversation: ConversationResponse): Conversation => {
    return {
        id: conversation.id,
        title: conversation.title,
        ownerUserId: conversation.owner_user_id,
        shareScope: conversation.share_scope,
        permission: conversation.permission,
        canWrite: conversation.can_write,
        isPinned: conversation.is_pinned ?? false,
        pinnedAt: conversation.pinned_at ?? null,
        isVisible: conversation.is_visible ?? true,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messages: conversation.messages.map(normalizeMessage),
    };
};

const normalizeSummary = (summary: ConversationSummaryResponse): ConversationSummary => {
    return {
        id: summary.id,
        title: summary.title,
        shareScope: summary.share_scope,
        permission: summary.permission,
        canWrite: summary.can_write,
        isPinned: summary.is_pinned ?? false,
        pinnedAt: summary.pinned_at ?? null,
        isVisible: summary.is_visible ?? true,
        createdAt: summary.created_at,
        updatedAt: summary.updated_at,
    };
};

export const fetchRemoteConversationList = async (
    query = ''
): Promise<ConversationSummary[]> => {
    const params = new URLSearchParams();
    const normalizedQuery = query.trim();
    if (normalizedQuery) {
        params.set('query', normalizedQuery);
    }

    const queryString = params.toString();
    const response = await fetch(`${apiBaseUrl}/conversations${queryString ? `?${queryString}` : ''}`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    const payload = (await response.json()) as ConversationSummaryResponse[];
    return payload.map(normalizeSummary);
};

export const fetchRemoteConversation = async (conversationId: string): Promise<Conversation> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as ConversationResponse);
};

export const saveRemoteConversation = async (
    conversation: Conversation
): Promise<Conversation> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversation.id}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            title: conversation.title,
            share_scope: conversation.shareScope,
            client_updated_at: conversation.updatedAt,
            messages: conversation.messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                rag_sources: (message.ragSources ?? []).map((source) => ({
                    file_id: source.fileId,
                    file_name: source.fileName,
                    chunk_index: source.chunkIndex,
                    page_number: source.pageNumber,
                    snippet: source.snippet,
                    confidence: source.confidence,
                })),
                reasoning_content: message.reasoningContent ?? null,
                reasoning_duration_ms: message.reasoningDurationMs ?? null,
                created_at: message.createdAt ?? null,
                updated_at: message.updatedAt ?? null,
            })),
        }),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as ConversationResponse);
};

export const updateRemoteConversationShare = async (
    conversationId: string,
    shareScope: ConversationShareScope
): Promise<Conversation> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}/share`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            share_scope: shareScope,
        }),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as ConversationResponse);
};

export const continueRemoteSharedConversation = async (
    conversationId: string
): Promise<Conversation> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}/share/continue`, {
        method: 'POST',
        headers: authHeaders(),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as ConversationResponse);
};

export const renameRemoteConversation = async (
    conversationId: string,
    title: string
): Promise<Conversation> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}/rename`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            title,
        }),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as ConversationResponse);
};

export const updateRemoteConversationPin = async (
    conversationId: string,
    isPinned: boolean
): Promise<Conversation> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}/pin`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
            is_pinned: isPinned,
        }),
    });
    await ensureOk(response);

    return normalizeConversation((await response.json()) as ConversationResponse);
};

export const deleteRemoteConversation = async (conversationId: string): Promise<void> => {
    const response = await fetch(`${apiBaseUrl}/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    await ensureOk(response);
};
