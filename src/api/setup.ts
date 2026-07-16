import { apiBaseUrl } from './config';
import i18n from '../utils/i18n';

export type FirstRunSetupPayload = {
    database: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
    };
    adminUsername: string;
    adminEmail: string;
    adminPassword: string;
    adminDisplayName: string;
};

type SetupStatusResponse = {
    is_configured: boolean;
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
        return i18n.t('errors.setupFailed');
    }

    return i18n.t('errors.setupFailed');
};

export const fetchSetupStatus = async (): Promise<boolean> => {
    const response = await fetch(`${apiBaseUrl}/setup/status`);
    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }

    const payload = (await response.json()) as SetupStatusResponse;
    return payload.is_configured;
};

export const submitFirstRunSetup = async (
    payload: FirstRunSetupPayload
): Promise<void> => {
    const response = await fetch(`${apiBaseUrl}/setup`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            database: payload.database,
            admin_username: payload.adminUsername,
            admin_email: payload.adminEmail,
            admin_password: payload.adminPassword,
            admin_display_name: payload.adminDisplayName,
        }),
    });

    if (!response.ok) {
        throw new Error(await readErrorMessage(response));
    }
};
