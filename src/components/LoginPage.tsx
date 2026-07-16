import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { login } from '../api/auth';
import type { AuthSession } from '../utils/authSession';

type LoginPageProps = {
    onLogin: (session: AuthSession) => void;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
    const { t } = useTranslation();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedIdentifier = identifier.trim();

        if (!trimmedIdentifier || !password || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const session = await login(trimmedIdentifier, password);
            onLogin(session);
        } catch (loginError: unknown) {
            const message = loginError instanceof Error ? loginError.message : String(loginError);
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-8 text-gray-900 dark:text-gray-100">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-[420px] rounded-lg border border-white/60 bg-white/86 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#10131b]/88 sm:p-8"
            >
                <div className="mb-7 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center text-white">
                        <img src="/favicon.ico" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">
                            {t('loginTitle')}
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {t('loginSubtitle')}
                        </p>
                    </div>
                </div>

                <label className="mb-5 block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('account')}
                    </span>
                    <input
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value)}
                        autoComplete="username"
                        className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-[15px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#5b6ef5] focus:ring-2 focus:ring-[#5b6ef5]/15 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-gray-500"
                        placeholder={t('accountPlaceholder')}
                    />
                </label>

                <label className="mb-5 block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('password')}
                    </span>
                    <input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        type="password"
                        autoComplete="current-password"
                        className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-[15px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#5b6ef5] focus:ring-2 focus:ring-[#5b6ef5]/15 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-gray-500"
                        placeholder={t('passwordPlaceholder')}
                    />
                </label>

                {error && (
                    <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isSubmitting || !identifier.trim() || !password}
                    className="flex h-11 w-full items-center justify-center rounded-md bg-[#5b6ef5] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4a5ce0] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white dark:disabled:bg-white/15 dark:disabled:text-white/45"
                >
                    {isSubmitting ? t('loggingIn') : t('login')}
                </button>
            </form>
        </div>
    );
}
