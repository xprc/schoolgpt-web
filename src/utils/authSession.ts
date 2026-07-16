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

const authStorageKey = 'schoolgpt.auth.session';
const defaultLanguage = 'zh';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const normalizeLanguage = (value: unknown): UserLanguage => {
    return value === 'en' || value === 'zh' ? value : defaultLanguage;
};

export const normalizeUserType = (value: unknown, username: string): UserType => {
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

export const readStoredLanguage = (): UserLanguage => {
    return normalizeLanguage(localStorage.getItem('language'));
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
