import { apiBaseUrl } from './apiConfig';
import { ApiAuthError } from './apiChat';
import { ApiRequestError } from './apiConversations';
import { getAccessToken } from './auth';

export type RagFileSummary = {
    id: number;
    name: string;
    size: number;
    modifiedAt: string;
    sha256: string;
    status: string;
    errorMessage: string | null;
    indexed: boolean;
    chunkCount: number;
};

export type RagFileDetail = RagFileSummary & {
    chunkIndex: number | null;
    pageNumber: number | null;
    snippet: string | null;
};

type RagFileSummaryResponse = {
    id: number;
    name: string;
    size: number;
    modified_at: string;
    sha256: string;
    status: string;
    error_message: string | null;
    indexed: boolean;
    chunk_count: number;
};

type RagFileDetailResponse = RagFileSummaryResponse & {
    chunk_index: number | null;
    page_number: number | null;
    snippet: string | null;
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

const ensureOk = async (response: Response): Promise<void> => {
    if (response.ok) {
        return;
    }

    if (response.status === 401) {
        throw new ApiAuthError('登录已过期，请重新登录');
    }

    throw new ApiRequestError(response.status, await readErrorMessage(response));
};

const normalizeSummary = (file: RagFileSummaryResponse): RagFileSummary => {
    return {
        id: file.id,
        name: file.name,
        size: file.size,
        modifiedAt: file.modified_at,
        sha256: file.sha256,
        status: file.status,
        errorMessage: file.error_message,
        indexed: file.indexed,
        chunkCount: file.chunk_count,
    };
};

const normalizeDetail = (file: RagFileDetailResponse): RagFileDetail => {
    return {
        ...normalizeSummary(file),
        chunkIndex: file.chunk_index,
        pageNumber: file.page_number,
        snippet: file.snippet,
    };
};

export const fetchRagFiles = async (): Promise<RagFileSummary[]> => {
    const response = await fetch(`${apiBaseUrl}/rag/files`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    const payload = (await response.json()) as RagFileSummaryResponse[];
    return payload.map(normalizeSummary);
};

export const fetchRagFile = async (
    fileId: number,
    chunkIndex?: number | null
): Promise<RagFileDetail> => {
    const params = new URLSearchParams();
    if (typeof chunkIndex === 'number' && Number.isFinite(chunkIndex)) {
        params.set('chunk_index', String(chunkIndex));
    }

    const response = await fetch(
        `${apiBaseUrl}/rag/files/${fileId}${params.toString() ? `?${params}` : ''}`,
        {
            headers: authHeaders(),
        }
    );
    await ensureOk(response);

    return normalizeDetail((await response.json()) as RagFileDetailResponse);
};

export const fetchRagFilePreview = async (fileId: number): Promise<Blob> => {
    const response = await fetch(`${apiBaseUrl}/rag/files/${fileId}/preview`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    return response.blob();
};
