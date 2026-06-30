import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    Add01Icon,
    Cancel01Icon,
    Delete02Icon,
    Edit01Icon,
    Search01Icon,
    Tick02Icon,
} from 'hugeicons-react';
import { useTranslation } from 'react-i18next';
import { ApiAuthError } from '../utils/apiChat';
import {
    createUserMemory,
    deleteUserMemory,
    fetchUserMemories,
    updateUserMemory,
} from '../utils/apiMemories';
import {
    AuthSessionError,
    updateCurrentUserPreferences,
    type AuthSession,
    type UserLanguage,
} from '../utils/auth';
import { DARK_BG, LIGHT_BG } from '../utils/backgrounds';
import type { UserMemory } from '../utils/types';

type SettingsPageProps = {
    theme: 'system' | 'light' | 'dark';
    setTheme: (theme: 'system' | 'light' | 'dark') => void;
    lightBg: string;
    setLightBg: (bg: string) => void;
    darkBg: string;
    setDarkBg: (bg: string) => void;
    onClose: () => void;
    onAuthExpired: () => void;
    onSessionUpdate: (session: AuthSession) => void;
};

const formatDate = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function SettingsPage({
    theme,
    setTheme,
    lightBg,
    setLightBg,
    darkBg,
    setDarkBg,
    onClose,
    onAuthExpired,
    onSessionUpdate
}: SettingsPageProps) {
    const { t, i18n } = useTranslation();
    const currentLanguage = i18n.language?.startsWith('zh') ? 'zh' : 'en';
    const [preferenceError, setPreferenceError] = useState<string | null>(null);
    const [memories, setMemories] = useState<UserMemory[]>([]);
    const [memoryDraft, setMemoryDraft] = useState('');
    const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
    const [memorySearch, setMemorySearch] = useState('');
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memorySaving, setMemorySaving] = useState(false);
    const [memoryError, setMemoryError] = useState<string | null>(null);

    const persistPreferences = async (
        updates: Partial<{
            preferredLanguage: UserLanguage;
            lightBackground: string;
            darkBackground: string;
        }>
    ) => {
        setPreferenceError(null);
        try {
            const nextSession = await updateCurrentUserPreferences({
                preferredLanguage: updates.preferredLanguage ?? currentLanguage,
                lightBackground: updates.lightBackground ?? lightBg,
                darkBackground: updates.darkBackground ?? darkBg,
            });
            onSessionUpdate(nextSession);
        } catch (error: unknown) {
            if (error instanceof AuthSessionError) {
                onAuthExpired();
                return;
            }

            setPreferenceError(error instanceof Error ? error.message : String(error));
        }
    };

    const handleLanguageChange = (lang: UserLanguage) => {
        void i18n.changeLanguage(lang);
        void persistPreferences({ preferredLanguage: lang });
    };

    const filteredMemories = useMemo(() => {
        const query = memorySearch.trim().toLowerCase();
        if (!query) {
            return memories;
        }

        return memories.filter((memory) =>
            memory.content.toLowerCase().includes(query)
        );
    }, [memories, memorySearch]);

    useEffect(() => {
        let cancelled = false;

        const loadMemories = async () => {
            setMemoryLoading(true);
            setMemoryError(null);
            try {
                const nextMemories = await fetchUserMemories();
                if (!cancelled) {
                    setMemories(nextMemories);
                }
            } catch (error: unknown) {
                if (error instanceof ApiAuthError) {
                    onAuthExpired();
                    return;
                }

                if (!cancelled) {
                    setMemoryError(error instanceof Error ? error.message : String(error));
                }
            } finally {
                if (!cancelled) {
                    setMemoryLoading(false);
                }
            }
        };

        void loadMemories();

        return () => {
            cancelled = true;
        };
    }, [onAuthExpired]);

    const resetMemoryForm = () => {
        setEditingMemoryId(null);
        setMemoryDraft('');
    };

    const handleMemorySubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const content = memoryDraft.trim();
        if (!content || memorySaving) {
            return;
        }

        setMemorySaving(true);
        setMemoryError(null);
        try {
            const savedMemory = editingMemoryId
                ? await updateUserMemory(editingMemoryId, content)
                : await createUserMemory(content);
            setMemories((prev) => [
                savedMemory,
                ...prev.filter((memory) => memory.id !== savedMemory.id),
            ]);
            resetMemoryForm();
        } catch (error: unknown) {
            if (error instanceof ApiAuthError) {
                onAuthExpired();
                return;
            }

            setMemoryError(error instanceof Error ? error.message : String(error));
        } finally {
            setMemorySaving(false);
        }
    };

    const handleEditMemory = (memory: UserMemory) => {
        setEditingMemoryId(memory.id);
        setMemoryDraft(memory.content);
    };

    const handleDeleteMemory = async (memory: UserMemory) => {
        if (!window.confirm('确定删除这条记忆？')) {
            return;
        }

        setMemoryError(null);
        try {
            await deleteUserMemory(memory.id);
            setMemories((prev) => prev.filter((item) => item.id !== memory.id));
            if (editingMemoryId === memory.id) {
                resetMemoryForm();
            }
        } catch (error: unknown) {
            if (error instanceof ApiAuthError) {
                onAuthExpired();
                return;
            }

            setMemoryError(error instanceof Error ? error.message : String(error));
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-[#1a1a1a] overflow-hidden transition-colors duration-200">
            <div className="p-6 border-b border-gray-200/60 dark:border-gray-800/60 flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings')}</h2>
                <button
                    onClick={onClose}
                    className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] rounded-full transition-colors"
                    title={t('close')}
                >
                    <Cancel01Icon size={20} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
                <div className="max-w-3xl space-y-8">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            {t('language')}
                        </h3>
                        <div className="flex gap-4">
                            <button
                                onClick={() => handleLanguageChange('en')}
                                className={`px-6 py-3 rounded-lg border font-medium transition-colors ${
                                    currentLanguage === 'en'
                                        ? 'border-[#5b6ef5] bg-[#f0f3ff] text-[#5b6ef5] dark:bg-[#1a1a1a] dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                                }`}
                            >
                                {t('english')}
                            </button>
                            <button
                                onClick={() => handleLanguageChange('zh')}
                                className={`px-6 py-3 rounded-lg border font-medium transition-colors ${
                                    currentLanguage === 'zh'
                                        ? 'border-[#5b6ef5] bg-[#f0f3ff] text-[#5b6ef5] dark:bg-[#1a1a1a] dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                                }`}
                            >
                                {t('chinese')}
                            </button>
                        </div>
                        {preferenceError && (
                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                                {preferenceError}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {t('theme')} & {t('background')}
                            </h3>
                            <button
                                onClick={() => setTheme('system')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                                    theme === 'system'
                                        ? 'border-[#5b6ef5] bg-[#f0f3ff] text-[#5b6ef5] dark:bg-[#1a1a1a] dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                                }`}
                            >
                                {t('system')}
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <div className="text-sm font-medium text-gray-500 mb-3">{t('light')}</div>
                                <div className="flex gap-4 flex-wrap">
                                    {LIGHT_BG.map((bg) => (
                                        <button
                                            key={bg}
                                            onClick={() => {
                                                setTheme('light');
                                                setLightBg(bg);
                                                void persistPreferences({ lightBackground: bg });
                                            }}
                                            className={`w-32 h-20 rounded-lg border-2 overflow-hidden transition-all ${
                                                theme === 'light' && lightBg === bg
                                                    ? 'border-[#5b6ef5] scale-105 shadow-md'
                                                    : 'border-transparent hover:scale-105'
                                            }`}
                                        >
                                            <img
                                                src={bg}
                                                alt="Background"
                                                className="w-full h-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="text-sm font-medium text-gray-500 mb-3">{t('dark')}</div>
                                <div className="flex gap-4 flex-wrap">
                                    {DARK_BG.map((bg) => (
                                        <button
                                            key={bg}
                                            onClick={() => {
                                                setTheme('dark');
                                                setDarkBg(bg);
                                                void persistPreferences({ darkBackground: bg });
                                            }}
                                            className={`w-32 h-20 rounded-lg border-2 overflow-hidden transition-all ${
                                                theme === 'dark' && darkBg === bg
                                                    ? 'border-[#5b6ef5] scale-105 shadow-md'
                                                    : 'border-transparent hover:scale-105'
                                            }`}
                                        >
                                            <img
                                                src={bg}
                                                alt="Background"
                                                className="w-full h-full object-cover"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                记忆
                            </h3>
                            <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-gray-600 dark:border-gray-800 dark:text-gray-300">
                                <Search01Icon size={16} className="text-gray-400" />
                                <input
                                    value={memorySearch}
                                    onChange={(event) => setMemorySearch(event.target.value)}
                                    placeholder="搜索记忆"
                                    className="h-full min-w-0 bg-transparent text-sm outline-none placeholder:text-gray-400"
                                />
                            </div>
                        </div>

                        <form onSubmit={handleMemorySubmit} className="space-y-3">
                            <textarea
                                value={memoryDraft}
                                onChange={(event) => setMemoryDraft(event.target.value)}
                                maxLength={4000}
                                rows={4}
                                placeholder="写入一条长期记忆"
                                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-800 outline-none transition-colors focus:border-[#5b6ef5] dark:border-gray-800 dark:bg-[#202020] dark:text-gray-100"
                            />
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {editingMemoryId ? '正在编辑' : `${memories.length} 条记忆`}
                                </div>
                                <div className="flex gap-2">
                                    {editingMemoryId && (
                                        <button
                                            type="button"
                                            onClick={resetMemoryForm}
                                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-[#242424]"
                                        >
                                            <Cancel01Icon size={16} />
                                            取消
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={!memoryDraft.trim() || memorySaving}
                                        className="inline-flex items-center gap-2 rounded-lg bg-[#c2e7ff] px-4 py-2 text-sm font-medium text-[#001d35] transition-colors hover:bg-[#b3dcf5] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800"
                                    >
                                        {editingMemoryId ? <Tick02Icon size={16} /> : <Add01Icon size={16} />}
                                        {memorySaving ? '保存中' : editingMemoryId ? '保存' : '添加'}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {memoryError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                                {memoryError}
                            </div>
                        )}

                        <div className="space-y-2">
                            {memoryLoading ? (
                                <div className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                                    正在加载
                                </div>
                            ) : filteredMemories.length === 0 ? (
                                <div className="rounded-lg border border-gray-200 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                                    暂无记忆
                                </div>
                            ) : (
                                filteredMemories.map((memory) => (
                                    <div
                                        key={memory.id}
                                        className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#202020]"
                                    >
                                        <div className="flex gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800 dark:text-gray-100">
                                                    {memory.content}
                                                </p>
                                                <div className="mt-3 text-xs text-gray-500 dark:text-gray-500">
                                                    {formatDate(memory.updatedAt)}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEditMemory(memory)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-white"
                                                    title="编辑"
                                                >
                                                    <Edit01Icon size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDeleteMemory(memory)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                                                    title="删除"
                                                >
                                                    <Delete02Icon size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
