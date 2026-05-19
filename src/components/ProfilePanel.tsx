import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Add01Icon, Camera01Icon, Cancel01Icon, Logout01Icon } from 'hugeicons-react';

type ProfilePanelProps = {
    onClose: () => void;
};

export default function ProfilePanel({ onClose }: ProfilePanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

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
                <div className="flex-1 text-center font-medium text-[14px] opacity-80">ytmo88@gmail.com</div>
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
                            src="https://i.pravatar.cc/150?u=andrew"
                            alt="Profile"
                            className="w-full h-full rounded-full border-[3px] border-[#f0f4f9] dark:border-[#1f1f1f] object-cover"
                        />
                    </div>
                    <button className="absolute bottom-0 right-0 w-7 h-7 bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center">
                        <Camera01Icon size={14} className="text-gray-700 dark:text-gray-300" />
                    </button>
                </div>

                <h2 className="text-[26px] font-normal mb-5 mt-1">Hi, Pro!</h2>

                <button className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-full text-blue-600 dark:text-blue-400 font-medium text-[14px] hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors mb-4 flex items-center flex-nowrap whitespace-nowrap">
                    {t('manageAccount')}
                </button>

                <div className="w-full flex gap-[3px] mb-4">
                    <button className="flex-1 flex justify-center items-center gap-2 bg-white dark:bg-[#2a2a2a] hover:bg-gray-50 dark:hover:bg-[#333] transition-colors py-[18px] rounded-[24px] rounded-br-[4px] rounded-tr-[4px] text-[15px]">
                        <Add01Icon size={18} className="text-blue-600 dark:text-blue-400" />
                        <span className="font-medium">{t('addAccount')}</span>
                    </button>

                    <button className="flex-1 flex justify-center items-center gap-2 bg-white dark:bg-[#2a2a2a] hover:bg-gray-50 dark:hover:bg-[#333] transition-colors py-[18px] rounded-[24px] rounded-bl-[4px] rounded-tl-[4px] text-[15px]">
                        <Logout01Icon size={18} className="text-gray-700 dark:text-gray-300" />
                        <span className="font-medium text-gray-800 dark:text-gray-200">{t('signOut')}</span>
                    </button>
                </div>

                <div className="flex gap-4 text-[13px] text-gray-600 dark:text-gray-400 mt-2 font-medium">
                    <a href="#" className="hover:text-black dark:hover:text-white transition-colors">
                        {t('privacyPolicy')}
                    </a>
                    <span>•</span>
                    <a href="#" className="hover:text-black dark:hover:text-white transition-colors">
                        {t('termsOfService')}
                    </a>
                </div>
            </div>
        </div>
    );
}
