import { apiBaseUrl } from './apiConfig';

export type AuthUser = {
    id: number;
    username: string;
    email: string;
    avatarSha256: string;
    displayName: string;
};

export type AuthSession = {
    accessToken: string;
    user: AuthUser;
};

type LoginResponse = {
    access_token: string;
    token_type: string;
    user: {
        id: number;
        username: string;
        email: string;
        avatar_sha256: string;
        display_name: string;
    };
};

const authStorageKey = 'schoolgpt.auth.session';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const normalizeUser = (user: LoginResponse['user']): AuthUser => {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarSha256: user.avatar_sha256,
        displayName: user.display_name,
    };
};

const readErrorMessage = async (response: Response): Promise<string> => {
    try {
        const payload: unknown = await response.json();

        if (isRecord(payload) && typeof payload.detail === 'string') {
            return payload.detail;
        }
    } catch {
        return '登录失败，请稍后重试';
    }

    return '登录失败，请稍后重试';
};

export const getStoredSession = (): AuthSession | null => {
    const rawSession = localStorage.getItem(authStorageKey);
    if (!rawSession) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(rawSession);
        if (!isRecord(parsed) || typeof parsed.accessToken !== 'string') {
            return null;
        }

        const user = parsed.user;
        if (!isRecord(user)) {
            return null;
        }

        if (
            typeof user.id !== 'number' ||
            typeof user.username !== 'string' ||
            typeof user.email !== 'string' ||
            typeof user.displayName !== 'string'
        ) {
            return null;
        }

        return {
            accessToken: parsed.accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatarSha256: typeof user.avatarSha256 === 'string' ? user.avatarSha256 : '',
                displayName: user.displayName,
            },
        };
    } catch {
        return null;
    }
};

export const saveAuthSession = (session: AuthSession): void => {
    localStorage.setItem(authStorageKey, JSON.stringify(session));
};

export const clearAuthSession = (): void => {
    localStorage.removeItem(authStorageKey);
};

export const getAccessToken = (): string | null => {
    return getStoredSession()?.accessToken ?? null;
};

export const login = async (identifier: string, password: string): Promise<AuthSession> => {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier, password }),
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    const payload = (await response.json()) as LoginResponse;
    const session: AuthSession = {
        accessToken: payload.access_token,
        user: normalizeUser(payload.user),
    };

    saveAuthSession(session);
    return session;
};
