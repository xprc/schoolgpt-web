import { useEffect, useMemo, useState, type FormEvent } from 'react';
import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/textfield/outlined-text-field.js';
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
import type { UserMemory } from '../types';
import '../styles/md3-theme.css';
import '../styles/settings-md3.css';

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

type MaterialTextFieldElement = HTMLElement & {
    value: string;
};

const getMaterialValue = (event: FormEvent<HTMLElement>): string => {
    return (event.currentTarget as MaterialTextFieldElement).value;
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
    onSessionUpdate,
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
        <div className="settings-md3 flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-colors duration-200">
            <div className="settings-md3__top-app-bar flex items-center justify-between px-6 py-5">
                <h2 className="text-2xl font-semibold">{t('settings')}</h2>
                <md-icon-button
                    onClick={onClose}
                    title={t('close')}
                >
                    <Cancel01Icon size={20} />
                </md-icon-button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8">
                <div className="max-w-3xl space-y-8">
                    <section className="settings-md3__pane p-5">
                        <h3 className="mb-4 text-lg font-semibold">
                            {t('language')}
                        </h3>
                        <div className="flex flex-wrap gap-3">
                            {currentLanguage === 'en' ? (
                                <md-filled-tonal-button
                                    type="button"
                                    onClick={() => handleLanguageChange('en')}
                                >
                                    {t('english')}
                                </md-filled-tonal-button>
                            ) : (
                                <md-outlined-button
                                    type="button"
                                    onClick={() => handleLanguageChange('en')}
                                >
                                    {t('english')}
                                </md-outlined-button>
                            )}
                            {currentLanguage === 'zh' ? (
                                <md-filled-tonal-button
                                    type="button"
                                    onClick={() => handleLanguageChange('zh')}
                                >
                                    {t('chinese')}
                                </md-filled-tonal-button>
                            ) : (
                                <md-outlined-button
                                    type="button"
                                    onClick={() => handleLanguageChange('zh')}
                                >
                                    {t('chinese')}
                                </md-outlined-button>
                            )}
                        </div>
                        {preferenceError && (
                            <div className="mt-3 rounded-2xl border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]">
                                {preferenceError}
                            </div>
                        )}
                    </section>

                    <section className="settings-md3__pane p-5">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold">
                                {t('theme')} & {t('background')}
                            </h3>
                            {theme === 'system' ? (
                                <md-filled-tonal-button
                                    type="button"
                                    onClick={() => setTheme('system')}
                                >
                                    {t('system')}
                                </md-filled-tonal-button>
                            ) : (
                                <md-outlined-button
                                    type="button"
                                    onClick={() => setTheme('system')}
                                >
                                    {t('system')}
                                </md-outlined-button>
                            )}
                        </div>

                        <div className="space-y-6">
                            <div>
                                <div className="settings-md3__muted mb-3 text-sm font-medium">{t('light')}</div>
                                <div className="flex flex-wrap gap-4">
                                    {LIGHT_BG.map((bg) => (
                                        <button
                                            key={bg}
                                            type="button"
                                            onClick={() => {
                                                setTheme('light');
                                                setLightBg(bg);
                                                void persistPreferences({ lightBackground: bg });
                                            }}
                                            className={`settings-md3__background-option ${
                                                theme === 'light' && lightBg === bg
                                                    ? 'settings-md3__background-option--active'
                                                    : ''
                                            }`}
                                        >
                                            <img
                                                src={bg}
                                                alt="Background"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="settings-md3__muted mb-3 text-sm font-medium">{t('dark')}</div>
                                <div className="flex flex-wrap gap-4">
                                    {DARK_BG.map((bg) => (
                                        <button
                                            key={bg}
                                            type="button"
                                            onClick={() => {
                                                setTheme('dark');
                                                setDarkBg(bg);
                                                void persistPreferences({ darkBackground: bg });
                                            }}
                                            className={`settings-md3__background-option ${
                                                theme === 'dark' && darkBg === bg
                                                    ? 'settings-md3__background-option--active'
                                                    : ''
                                            }`}
                                        >
                                            <img
                                                src={bg}
                                                alt="Background"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="settings-md3__pane p-5">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h3 className="text-lg font-semibold">
                                记忆
                            </h3>
                            <md-outlined-text-field
                                className="settings-md3__field sm:max-w-xs"
                                type="search"
                                label="搜索记忆"
                                value={memorySearch}
                                onInput={(event) => setMemorySearch(getMaterialValue(event))}
                            >
                                <span slot="leading-icon" className="settings-md3__slot-icon">
                                    <Search01Icon size={16} />
                                </span>
                            </md-outlined-text-field>
                        </div>

                        <form onSubmit={handleMemorySubmit} className="space-y-3">
                            <md-outlined-text-field
                                className="settings-md3__field"
                                type="textarea"
                                label="写入一条长期记忆"
                                value={memoryDraft}
                                maxLength={4000}
                                rows={4}
                                onInput={(event) => setMemoryDraft(getMaterialValue(event))}
                            />
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="settings-md3__muted text-sm">
                                    {editingMemoryId ? '正在编辑' : `${memories.length} 条记忆`}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {editingMemoryId && (
                                        <md-outlined-button
                                            type="button"
                                            onClick={resetMemoryForm}
                                        >
                                            <span slot="icon" className="settings-md3__slot-icon">
                                                <Cancel01Icon size={16} />
                                            </span>
                                            取消
                                        </md-outlined-button>
                                    )}
                                    <md-filled-button
                                        type="submit"
                                        disabled={!memoryDraft.trim() || memorySaving}
                                    >
                                        {editingMemoryId ? (
                                            <span slot="icon" className="settings-md3__slot-icon">
                                                <Tick02Icon size={16} />
                                            </span>
                                        ) : (
                                            <span slot="icon" className="settings-md3__slot-icon">
                                                <Add01Icon size={16} />
                                            </span>
                                        )}
                                        {memorySaving ? '保存中' : editingMemoryId ? '保存' : '添加'}
                                    </md-filled-button>
                                </div>
                            </div>
                        </form>

                        {memoryError && (
                            <div className="mt-4 rounded-2xl border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] px-4 py-3 text-sm text-[var(--md-sys-color-on-error-container)]">
                                {memoryError}
                            </div>
                        )}

                        <div className="mt-4 space-y-3">
                            {memoryLoading ? (
                                <div className="settings-md3__pane-high px-4 py-6 text-center text-sm">
                                    正在加载
                                </div>
                            ) : filteredMemories.length === 0 ? (
                                <div className="settings-md3__pane-high px-4 py-6 text-center text-sm">
                                    暂无记忆
                                </div>
                            ) : (
                                filteredMemories.map((memory) => (
                                    <div
                                        key={memory.id}
                                        className="settings-md3__pane-high p-4"
                                    >
                                        <div className="flex gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="whitespace-pre-wrap break-words text-sm leading-6">
                                                    {memory.content}
                                                </p>
                                                <div className="settings-md3__muted mt-3 text-xs">
                                                    {formatDate(memory.updatedAt)}
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 gap-1">
                                                <md-icon-button
                                                    type="button"
                                                    onClick={() => handleEditMemory(memory)}
                                                    title="编辑"
                                                >
                                                    <Edit01Icon size={16} />
                                                </md-icon-button>
                                                <md-icon-button
                                                    type="button"
                                                    onClick={() => void handleDeleteMemory(memory)}
                                                    title="删除"
                                                >
                                                    <Delete02Icon size={16} />
                                                </md-icon-button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
