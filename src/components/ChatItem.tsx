import type { FormEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Cancel01Icon,
    Chat01Icon,
    Delete02Icon,
    Edit01Icon,
    MoreVerticalIcon,
    PinIcon,
    PinOffIcon,
    Tick02Icon,
} from 'hugeicons-react';

type ChatItemProps = {
    text: string;
    active?: boolean;
    disabled?: boolean;
    pinned?: boolean;
    canManage?: boolean;
    menuOpen?: boolean;
    renaming?: boolean;
    renameValue?: string;
    onClick?: () => void;
    onMenuToggle?: () => void;
    onPinToggle?: () => void;
    onRenameStart?: () => void;
    onRenameValueChange?: (value: string) => void;
    onRenameSubmit?: () => void;
    onRenameCancel?: () => void;
    onDelete?: () => void;
};

export default function ChatItem({
    text,
    active,
    disabled,
    pinned,
    canManage,
    menuOpen,
    renaming,
    renameValue,
    onClick,
    onMenuToggle,
    onPinToggle,
    onRenameStart,
    onRenameValueChange,
    onRenameSubmit,
    onRenameCancel,
    onDelete,
}: ChatItemProps) {
    const { t } = useTranslation();

    const handleContainerClick = () => {
        if (disabled || renaming) {
            return;
        }

        onClick?.();
    };

    const handleMenuToggle = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onMenuToggle?.();
    };

    const handleMenuAction = (
        event: MouseEvent<HTMLButtonElement>,
        action?: () => void
    ) => {
        event.stopPropagation();
        action?.();
    };

    const handleRenameSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onRenameSubmit?.();
    };

    const stopPropagation = (event: MouseEvent) => {
        event.stopPropagation();
    };

    return (
        <div className="relative">
            <div
                onClick={handleContainerClick}
                className={`group relative flex items-center rounded-r-full px-4 py-1.5 transition-colors ${
                    active
                        ? 'bg-black/5 text-gray-950 font-medium dark:bg-white/20 dark:text-white sm:bg-white/20 sm:text-white'
                        : disabled
                            ? 'text-gray-400 pointer-events-none dark:text-white/40 sm:text-white/40'
                            : 'text-gray-700 hover:bg-black/5 hover:text-gray-950 cursor-pointer dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white sm:text-white/80 sm:hover:bg-white/10 sm:hover:text-white'
                }`}
            >
                <Chat01Icon
                    size={16}
                    className={`shrink-0 mr-3 ${
                        active
                            ? 'text-gray-950 dark:text-white sm:text-white'
                            : disabled
                                ? 'text-gray-400 dark:text-white/40 sm:text-white/40'
                                : 'text-gray-500 dark:text-white/70 sm:text-white/70'
                    }`}
                />

                {renaming ? (
                    <form
                        onSubmit={handleRenameSubmit}
                        onClick={stopPropagation}
                        className="flex min-w-0 flex-1 items-center gap-1"
                    >
                        <input
                            value={renameValue ?? text}
                            onChange={(event) => onRenameValueChange?.(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    onRenameCancel?.();
                                }
                            }}
                            onFocus={(event) => event.currentTarget.select()}
                            autoFocus
                            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#5b6ef5] dark:border-white/25 dark:bg-black/20 dark:text-white dark:placeholder:text-white/45 dark:focus:border-white/55 sm:border-white/25 sm:bg-black/20 sm:text-white sm:placeholder:text-white/45 sm:focus:border-white/55"
                            placeholder={t('renameInputPlaceholder')}
                        />
                        <button
                            type="submit"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-black/5 hover:text-gray-950 dark:text-white/80 dark:hover:bg-white/15 dark:hover:text-white sm:text-white/80 sm:hover:bg-white/15 sm:hover:text-white"
                            title={t('save')}
                        >
                            <Tick02Icon size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => handleMenuAction(event, onRenameCancel)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-white/60 dark:hover:bg-white/15 dark:hover:text-white sm:text-white/60 sm:hover:bg-white/15 sm:hover:text-white"
                            title={t('cancel')}
                        >
                            <Cancel01Icon size={14} />
                        </button>
                    </form>
                ) : (
                    <>
                        <span className="min-w-0 flex-1 truncate pr-2 text-sm">{text}</span>
                        {pinned && (
                            <PinIcon
                                size={13}
                                className="mr-1 shrink-0 text-gray-500 dark:text-white/75 sm:text-white/75"
                                aria-label={t('pinnedConversation')}
                            />
                        )}
                        {canManage && (
                            <button
                                type="button"
                                onClick={handleMenuToggle}
                                onPointerDown={(event) => event.stopPropagation()}
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                    menuOpen
                                        ? 'bg-black/5 text-gray-900 dark:bg-white/15 dark:text-white sm:bg-white/15 sm:text-white'
                                        : 'text-gray-500 group-hover:text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-white/0 dark:group-hover:text-white/75 dark:hover:bg-white/15 dark:hover:text-white sm:text-white/0 sm:group-hover:text-white/75 sm:hover:bg-white/15 sm:hover:text-white'
                                }`}
                                title={t('conversationOptions')}
                            >
                                <MoreVerticalIcon size={16} />
                            </button>
                        )}
                    </>
                )}
            </div>

            {menuOpen && !renaming && (
                <div
                    onClick={stopPropagation}
                    onPointerDown={(event) => event.stopPropagation()}
                    className="absolute right-2 top-9 z-50 w-48 rounded-2xl border border-gray-200/80 bg-white/95 p-1.5 text-sm text-gray-800 shadow-2xl shadow-black/10 backdrop-blur-xl dark:border-white/15 dark:bg-[#151923]/95 dark:text-white dark:shadow-black/40"
                >
                    <button
                        type="button"
                        onClick={(event) => handleMenuAction(event, onPinToggle)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        {pinned ? <PinOffIcon size={16} /> : <PinIcon size={16} />}
                        <span>{pinned ? t('unpinConversation') : t('pinConversation')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(event) => handleMenuAction(event, onRenameStart)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-950 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <Edit01Icon size={16} />
                        <span>{t('renameConversation')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(event) => handleMenuAction(event, onDelete)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 dark:text-red-200 dark:hover:bg-red-500/15 dark:hover:text-red-100"
                    >
                        <Delete02Icon size={16} />
                        <span>{t('deleteConversation')}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
