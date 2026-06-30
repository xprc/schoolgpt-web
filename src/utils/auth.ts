import { apiBaseUrl } from './apiConfig';
import { DARK_BG, LIGHT_BG, normalizeBackground } from './backgrounds';

export type UserLanguage = 'en' | 'zh';
export type UserType = 'student' | 'teacher' | 'maintenance' | 'admin';

export type AuthUser = {
    id: number;
    username: string;
    email: string;
    avatarSha256: string;
    displayName: string;
    userType: UserType;
    preferredLanguage: UserLanguage;
    lightBackground: string;
    darkBackground: string;
};

export type AuthSession = {
    accessToken: string;
    user: AuthUser;
};

type UserProfileResponse = {
    id: number;
    username: string;
    email: string;
    avatar_sha256: string;
    display_name: string;
    user_type: UserType;
    preferred_language?: UserLanguage;
    light_background?: string;
    dark_background?: string;
};

type LoginResponse = {
    access_token: string;
    token_type: string;
    user: UserProfileResponse;
};

const authStorageKey = 'schoolgpt.auth.session';
const defaultLanguage = 'zh';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export class AuthSessionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthSessionError';
    }
}

const normalizeLanguage = (value: unknown): UserLanguage => {
    return value === 'en' || value === 'zh' ? value : defaultLanguage;
};

const normalizeUserType = (value: unknown, username: string): UserType => {
    if (
        value === 'student' ||
        value === 'teacher' ||
        value === 'maintenance' ||
        value === 'admin'
    ) {
        return value;
    }

    return username === 'admin' ? 'admin' : 'student';
};

const readStoredLanguage = (): UserLanguage => {
    return normalizeLanguage(localStorage.getItem('language'));
};

const normalizeUser = (user: UserProfileResponse): AuthUser => {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarSha256: user.avatar_sha256,
        displayName: user.display_name,
        userType: normalizeUserType(user.user_type, user.username),
        preferredLanguage: normalizeLanguage(user.preferred_language ?? readStoredLanguage()),
        lightBackground: normalizeBackground(user.light_background ?? null, LIGHT_BG[0]),
        darkBackground: normalizeBackground(user.dark_background ?? null, DARK_BG[0]),
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
                userType: normalizeUserType(user.userType, user.username),
                preferredLanguage: normalizeLanguage(user.preferredLanguage ?? readStoredLanguage()),
                lightBackground: normalizeBackground(
                    typeof user.lightBackground === 'string' ? user.lightBackground : null,
                    LIGHT_BG[0]
                ),
                darkBackground: normalizeBackground(
                    typeof user.darkBackground === 'string' ? user.darkBackground : null,
                    DARK_BG[0]
                ),
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

export type UserPreferencesUpdate = {
    preferredLanguage: UserLanguage;
    lightBackground: string;
    darkBackground: string;
};

export const updateCurrentUserPreferences = async (
    preferences: UserPreferencesUpdate
): Promise<AuthSession> => {
    const session = getStoredSession();
    if (!session) {
        throw new AuthSessionError('请先登录');
    }

    const response = await fetch(`${apiBaseUrl}/auth/me`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
            preferred_language: preferences.preferredLanguage,
            light_background: preferences.lightBackground,
            dark_background: preferences.darkBackground,
        }),
    });

    if (response.status === 401) {
        throw new AuthSessionError('登录已过期，请重新登录');
    }

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    const nextSession: AuthSession = {
        accessToken: session.accessToken,
        user: normalizeUser((await response.json()) as UserProfileResponse),
    };

    saveAuthSession(nextSession);
    return nextSession;
};
