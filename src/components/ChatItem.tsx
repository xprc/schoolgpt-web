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
                        ? 'bg-white/20 text-white font-medium'
                        : disabled
                            ? 'text-white/40 pointer-events-none'
                            : 'text-white/80 hover:bg-white/10 hover:text-white cursor-pointer'
                }`}
            >
                <Chat01Icon
                    size={16}
                    className={`shrink-0 mr-3 ${
                        active ? 'text-white' : disabled ? 'text-white/40' : 'text-white/70'
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
                            className="min-w-0 flex-1 rounded-lg border border-white/25 bg-black/20 px-2 py-1 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/55"
                            placeholder={t('renameInputPlaceholder')}
                        />
                        <button
                            type="submit"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white"
                            title={t('save')}
                        >
                            <Tick02Icon size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => handleMenuAction(event, onRenameCancel)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/15 hover:text-white"
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
                                className="mr-1 shrink-0 text-white/75"
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
                                        ? 'bg-white/15 text-white'
                                        : 'text-white/0 group-hover:text-white/75 hover:bg-white/15 hover:text-white'
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
                    className="absolute right-2 top-9 z-50 w-48 rounded-2xl border border-white/15 bg-[#151923]/95 p-1.5 text-sm text-white shadow-2xl backdrop-blur-xl"
                >
                    <button
                        type="button"
                        onClick={(event) => handleMenuAction(event, onPinToggle)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        {pinned ? <PinOffIcon size={16} /> : <PinIcon size={16} />}
                        <span>{pinned ? t('unpinConversation') : t('pinConversation')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(event) => handleMenuAction(event, onRenameStart)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <Edit01Icon size={16} />
                        <span>{t('renameConversation')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(event) => handleMenuAction(event, onDelete)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-red-200 transition-colors hover:bg-red-500/15 hover:text-red-100"
                    >
                        <Delete02Icon size={16} />
                        <span>{t('deleteConversation')}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
