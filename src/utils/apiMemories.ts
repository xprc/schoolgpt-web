import { apiBaseUrl } from './apiConfig';
import { ApiAuthError } from './apiChat';
import { getAccessToken } from './auth';
import type { UserMemory } from '../types';

type UserMemoryResponse = {
    id: string;
    content: string;
    created_at: string;
    updated_at: string;
};

export class MemoryApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'MemoryApiError';
        this.status = status;
    }
}

const authHeaders = (): HeadersInit => {
    const accessToken = getAccessToken();
    if (!accessToken) {
        throw new ApiAuthError('请先登录');
    }

    return {
        Authorization: `Bearer ${accessToken}`,
    };
};

const jsonAuthHeaders = (): HeadersInit => ({
    ...authHeaders(),
    'Content-Type': 'application/json',
});

const normalizeMemory = (memory: UserMemoryResponse): UserMemory => ({
    id: memory.id,
    content: memory.content,
    createdAt: memory.created_at,
    updatedAt: memory.updated_at,
});

const readErrorMessage = async (response: Response): Promise<string> => {
    try {
        const payload: unknown = await response.json();
        if (
            typeof payload === 'object'
            && payload !== null
            && 'detail' in payload
            && typeof payload.detail === 'string'
        ) {
            return payload.detail;
        }
    } catch {
        // Ignore malformed error bodies.
    }

    return '请求失败';
};

const ensureOk = async (response: Response): Promise<void> => {
    if (response.ok) {
        return;
    }

    if (response.status === 401) {
        throw new ApiAuthError('登录已过期，请重新登录');
    }

    throw new MemoryApiError(response.status, await readErrorMessage(response));
};

export const fetchUserMemories = async (): Promise<UserMemory[]> => {
    const response = await fetch(`${apiBaseUrl}/memories`, {
        headers: authHeaders(),
    });
    await ensureOk(response);

    const payload = (await response.json()) as UserMemoryResponse[];
    return payload.map(normalizeMemory);
};

export const createUserMemory = async (content: string): Promise<UserMemory> => {
    const response = await fetch(`${apiBaseUrl}/memories`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content }),
    });
    await ensureOk(response);

    return normalizeMemory((await response.json()) as UserMemoryResponse);
};

export const updateUserMemory = async (
    memoryId: string,
    content: string
): Promise<UserMemory> => {
    const response = await fetch(`${apiBaseUrl}/memories/${memoryId}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content }),
    });
    await ensureOk(response);

    return normalizeMemory((await response.json()) as UserMemoryResponse);
};

export const deleteUserMemory = async (memoryId: string): Promise<void> => {
    const response = await fetch(`${apiBaseUrl}/memories/${memoryId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    await ensureOk(response);
};
