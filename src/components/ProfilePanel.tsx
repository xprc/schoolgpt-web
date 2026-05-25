import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Cancel01Icon, Logout01Icon } from 'hugeicons-react';
import type { AuthUser } from '../utils/auth';

type ProfilePanelProps = {
    user: AuthUser;
    onClose: () => void;
    onLogout: () => void;
};

export default function ProfilePanel({ user, onClose, onLogout }: ProfilePanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const avatarUrl = `https://i.pravatar.cc/150?u=${encodeURIComponent(user.username)}`;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={panelRef}
            className="profile-panel-container absolute top-16 right-4 sm:right-6 w-[360px] bg-[#f0f4f9] dark:bg-[#1f1f1f] rounded-3xl shadow-xl border border-white/40 dark:border-gray-800 p-6 text-gray-900 dark:text-gray-100 z-50"
        >
            <div className="flex justify-between items-center mb-5">
                <div className="flex-1 text-center font-medium text-[14px] opacity-80">
                    {user.email}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors absolute right-4"
                >
                    <Cancel01Icon size={20} />
                </button>
            </div>

            <div className="flex flex-col items-center">
                <div className="relative mb-3">
                    <div className="w-[84px] h-[84px] rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 via-red-500 to-blue-500">
                        <img
                            src={avatarUrl}
                            alt="Profile"
                            className="w-full h-full rounded-full border-[3px] border-[#f0f4f9] dark:border-[#1f1f1f] object-cover"
                        />
                    </div>
                </div>

                <h2 className="text-[26px] font-normal mb-2 mt-1">
                    {t('profileGreeting', { name: user.displayName })}
                </h2>
                <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                    @{user.username}
                </p>

                <button
                    onClick={onLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 text-[15px] font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:bg-[#2a2a2a] dark:text-gray-200 dark:hover:bg-[#333]"
                >
                    <Logout01Icon size={18} className="text-gray-700 dark:text-gray-300" />
                    <span>{t('signOut')}</span>
                </button>
            </div>
        </div>
    );
}
