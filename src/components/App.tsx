import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Add01Icon,
    ArrowDown01Icon,
    BotIcon,
    Chat01Icon,
    Edit01Icon,
    Folder01Icon,
    GridIcon,
    HelpCircleIcon,
    Mail01Icon,
    Menu01Icon,
    Search01Icon,
    Settings01Icon
} from 'hugeicons-react';
import ChatItem from './ChatItem';
import MainChat from './MainChat';
import ProfilePanel from './ProfilePanel';
import SettingsPage from './SettingsPage';
import { DARK_BG, LIGHT_BG } from '../utils/backgrounds';
import type { Message } from '../utils/types';

export default function App() {
    const { t } = useTranslation();
    const [showSettings, setShowSettings] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(
        () => (localStorage.getItem('theme') as 'system' | 'light' | 'dark') || 'system'
    );
    const [lightBg, setLightBg] = useState(
        () => localStorage.getItem('lightBg') || LIGHT_BG[0]
    );
    const [darkBg, setDarkBg] = useState(
        () => localStorage.getItem('darkBg') || DARK_BG[0]
    );
    const [resolvedDark, setResolvedDark] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'user',
            content: 'Create a chatbot gpt using python language what will be step for that'
        },
        {
            id: '2',
            role: 'ai',
            content:
                "Sure, I can help you get started with creating a chatbot using GPT in Python. Here are the basic steps you'll need to follow:\n\n1. **Install the required libraries:** You'll need to install the transformers library from Hugging Face to use GPT. You can install it using pip.\n2. **Load the pre-trained model:** GPT comes in several sizes and versions, so you'll need to choose the one that fits your needs. You can load a pre-trained GPT model. This loads the 1.3B parameter version of GPT-Neo, which is a powerful and relatively recent model.\n3. **Create a chatbot loop:** You'll need to create a loop that takes user input, generates a response using the GPT model, and outputs it to the user. Here's an example loop that uses the input() function to get user input and the gpt() function to generate a response. This loop will keep running until the user exits the program or the loop is interrupted.\n4. **Add some personality to the chatbot:** While GPT can generate text, it doesn't have any inherent personality or style. You can make your chatbot more interesting by adding custom prompts or responses that reflect your desired personality. You can then modify the chatbot loop to use these prompts and responses when appropriate. This will make the chatbot seem more human-like and engaging.\n\nThese are just the basic steps to get started with a GPT chatbot in Python. Depending on your requirements, you may need to add more features or complexity to the chatbot. Good luck!"
        }
    ]);

    const handleNewChat = useCallback(() => {
        setMessages([]);
    }, []);

    useEffect(() => {
        localStorage.setItem('lightBg', lightBg);
    }, [lightBg]);

    useEffect(() => {
        localStorage.setItem('darkBg', darkBg);
    }, [darkBg]);

    useEffect(() => {
        localStorage.setItem('theme', theme);

        const applyTheme = () => {
            const root = document.documentElement;

            if (theme === 'dark') {
                root.classList.add('dark');
                setResolvedDark(true);
                return;
            }

            if (theme === 'light') {
                root.classList.remove('dark');
                setResolvedDark(false);
                return;
            }

            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                root.classList.add('dark');
                setResolvedDark(true);
            } else {
                root.classList.remove('dark');
                setResolvedDark(false);
            }
        };

        applyTheme();

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => applyTheme();
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        }
    }, [theme]);

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                e.preventDefault();
                setShowSettings((prev) => !prev);
            }

            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                handleNewChat();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleNewChat]);

    const bgToUse = resolvedDark ? darkBg : lightBg;

    return (
        <div
            className="flex flex-col h-screen w-full font-sans overflow-hidden bg-cover bg-center text-white transition-all duration-500"
            style={{
                backgroundImage: `url("https://images.unsplash.com/${bgToUse}?q=80&w=2000&auto=format&fit=crop")`
            }}
        >
            <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>

            <div className="h-16 flex items-center px-2 sm:px-4 gap-2 sm:gap-4 shrink-0 relative z-20">
                <div className="flex items-center gap-2 sm:gap-4 w-auto sm:w-[240px] shrink-0">
                    <button
                        onClick={() => setIsSidebarOpen((prev) => !prev)}
                        className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                    >
                        <Menu01Icon size={20} />
                    </button>
                    <span className="text-lg sm:text-xl font-medium text-white flex items-center gap-2">
                        <div className="w-6 h-6 bg-red-500 rounded-sm items-center justify-center hidden sm:flex">
                            <Mail01Icon size={14} className="text-white" />
                        </div>
                        <span className="hidden sm:inline">ChatMail</span>
                    </span>
                </div>

                <div className="flex-1 max-w-3xl">
                    <div className="bg-white/20 hover:bg-white/30 transition-colors rounded-full flex items-center px-3 sm:px-4 py-2 sm:py-2.5">
                        <Search01Icon size={18} className="text-white/70 mr-2 sm:mr-3" />
                        <input
                            type="text"
                            placeholder={t('searchChats')}
                            className="bg-transparent border-none outline-none text-white placeholder-white/70 w-full text-sm sm:text-base"
                        />
                        <Settings01Icon
                            size={18}
                            className="text-white/70 ml-2 sm:ml-3 cursor-pointer hidden sm:block"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-1 sm:gap-2 flex-1">
                    <div className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mr-2">
                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                        <span className="text-sm">{t('online')}</span>
                        <ArrowDown01Icon size={14} className="ml-1" />
                    </div>
                    <button className="p-2 hover:bg-white/10 rounded-full text-white transition-colors hidden sm:block">
                        <HelpCircleIcon size={20} />
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        title="Shortcut: Cmd/Ctrl + ,"
                        className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                    >
                        <Settings01Icon size={20} />
                    </button>
                    <button className="p-2 hover:bg-white/10 rounded-full text-white transition-colors hidden sm:block">
                        <GridIcon size={20} />
                    </button>
                    <button
                        onClick={() => setShowProfilePanel((prev) => !prev)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="rounded-full flex items-center justify-center relative ml-1 sm:ml-2 outline-none"
                    >
                        <img
                            src="https://i.pravatar.cc/150?u=andrew"
                            alt="Profile"
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white/20 transition-transform hover:scale-105 object-cover"
                        />
                    </button>
                    {showProfilePanel && <ProfilePanel onClose={() => setShowProfilePanel(false)} />}
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative z-10 pb-2 px-2 sm:pr-2 sm:pl-0">
                <div
                    className={`absolute sm:relative z-20 h-full bg-[#1a1a1a]/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none flex flex-col shrink-0 transition-all duration-300 ${
                        isSidebarOpen
                            ? 'w-[240px] pr-4 opacity-100 translate-x-0'
                            : 'w-0 pr-0 opacity-0 -translate-x-full sm:translate-x-0 overflow-hidden'
                    }`}
                >
                    <div className="py-3 pl-2">
                        <button
                            onClick={handleNewChat}
                            title="Shortcut: Alt + N"
                            className="bg-[#c2e7ff] text-[#001d35] hover:bg-[#b3dcf5] hover:shadow-md transition-all rounded-2xl py-4 px-6 flex items-center gap-3 font-medium shadow-sm"
                        >
                            <Edit01Icon size={18} />
                            {t('newChat')}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto mt-2 space-y-0.5 custom-scrollbar">
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full bg-white/20 text-white cursor-pointer font-medium">
                            <div className="flex items-center gap-3">
                                <Chat01Icon size={16} />
                                <span className="text-sm">{t('chat')}</span>
                            </div>
                            <span className="text-xs font-bold">6,909</span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full hover:bg-white/10 text-white/80 hover:text-white cursor-pointer">
                            <div className="flex items-center gap-3">
                                <Folder01Icon size={16} />
                                <span className="text-sm">{t('files')}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-4 py-1.5 rounded-r-full hover:bg-white/10 text-white/80 hover:text-white cursor-pointer">
                            <div className="flex items-center gap-3">
                                <BotIcon size={16} />
                                <span className="text-sm">{t('agent')}</span>
                            </div>
                        </div>

                        <div className="mt-6 mb-2 px-4 flex items-center justify-between group cursor-pointer">
                            <span className="text-sm font-medium text-white/90">
                                {t('chatHistory')}
                            </span>
                            <Add01Icon
                                size={16}
                                className="text-white/70 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                        </div>
                        <ChatItem text="Create Html Game Environment..." active />
                        <ChatItem text="Apply To Leave For Emergency" />
                        <ChatItem text="What Is UI UX Design?" />
                        <ChatItem text="Create POS System" />
                        <ChatItem text="What Is UX Audit?" />
                        <ChatItem text="How Chat GPT Work?" />
                    </div>
                </div>

                <div className="flex-1 bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg overflow-hidden flex flex-col text-gray-800 dark:text-gray-200">
                    {showSettings ? (
                        <SettingsPage
                            theme={theme}
                            setTheme={setTheme}
                            lightBg={lightBg}
                            setLightBg={setLightBg}
                            darkBg={darkBg}
                            setDarkBg={setDarkBg}
                            onClose={() => setShowSettings(false)}
                        />
                    ) : (
                        <MainChat messages={messages} setMessages={setMessages} />
                    )}
                </div>
            </div>
        </div>
    );
}
