import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Refresh01Icon, Tick02Icon } from 'hugeicons-react';
import {
    submitFirstRunSetup,
    type FirstRunSetupPayload,
} from '../api/setup';

type FirstRunSetupPageProps = {
    onSetupComplete: () => void;
};

const defaultForm: FirstRunSetupPayload = {
    database: {
        host: '127.0.0.1',
        port: 3306,
        username: 'root',
        password: '',
        database: 'schoolgpt',
    },
    adminUsername: 'admin',
    adminEmail: 'admin@schoolgpt.local',
    adminPassword: '',
    adminDisplayName: '',
};

export default function FirstRunSetupPage({
    onSetupComplete,
}: FirstRunSetupPageProps) {
    const { t } = useTranslation();
    const [form, setForm] = useState<FirstRunSetupPayload>(() => ({
        ...defaultForm,
        adminDisplayName: t('setup.defaultAdminName'),
    }));
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const updateDatabase = (
        key: keyof FirstRunSetupPayload['database'],
        value: string | number
    ) => {
        setForm((prev) => ({
            ...prev,
            database: {
                ...prev.database,
                [key]: value,
            },
        }));
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage(null);

        try {
            await submitFirstRunSetup(form);
            onSetupComplete();
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-8">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-3xl rounded-lg border border-white/30 bg-white/92 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-white/10 dark:bg-[#151923]/94"
            >
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">
                        {t('setup.title')}
                    </h1>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {t('setup.subtitle')}
                    </p>
                </div>

                {errorMessage && (
                    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                        {errorMessage}
                    </div>
                )}

                <div className="grid gap-5 md:grid-cols-2">
                    <section className="space-y-4">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                            {t('setup.database')}
                        </h2>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.host')}
                            </span>
                            <input
                                value={form.database.host}
                                onChange={(event) => updateDatabase('host', event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.port')}
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                value={form.database.port}
                                onChange={(event) =>
                                    updateDatabase('port', Number(event.target.value))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.databaseName')}
                            </span>
                            <input
                                value={form.database.database}
                                onChange={(event) =>
                                    updateDatabase('database', event.target.value)
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.username')}
                            </span>
                            <input
                                value={form.database.username}
                                onChange={(event) =>
                                    updateDatabase('username', event.target.value)
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.password')}
                            </span>
                            <input
                                type="password"
                                value={form.database.password}
                                onChange={(event) =>
                                    updateDatabase('password', event.target.value)
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                            {t('setup.admin')}
                        </h2>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.username')}
                            </span>
                            <input
                                value={form.adminUsername}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        adminUsername: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.displayName')}
                            </span>
                            <input
                                value={form.adminDisplayName}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        adminDisplayName: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.email')}
                            </span>
                            <input
                                type="email"
                                value={form.adminEmail}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        adminEmail: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {t('setup.password')}
                            </span>
                            <input
                                type="password"
                                value={form.adminPassword}
                                onChange={(event) =>
                                    setForm((prev) => ({
                                        ...prev,
                                        adminPassword: event.target.value,
                                    }))
                                }
                                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#5b6ef5] dark:border-white/10 dark:bg-black/20 dark:text-white"
                            />
                        </label>
                    </section>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center justify-center gap-2 rounded-lg bg-[#5b6ef5] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        {saving ? (
                            <Refresh01Icon size={16} className="animate-spin" />
                        ) : (
                            <Tick02Icon size={16} />
                        )}
                        {t('setup.submit')}
                    </button>
                </div>
            </form>
        </div>
    );
}
