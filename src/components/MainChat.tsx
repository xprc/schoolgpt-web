import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import {
    Add01Icon,
    ArrowDown01Icon,
    ArrowUp01Icon,
    Chat01Icon,
    Copy01Icon,
    Edit01Icon,
    Mic01Icon,
    MicOff01Icon,
    MoreVerticalIcon,
    Refresh01Icon,
    ThumbsDownIcon,
    ThumbsUpIcon,
    VolumeMute01Icon,
    VolumeUpIcon
} from 'hugeicons-react';
import CodeBlock from './CodeBlock';
import { streamChat } from '../utils/apiChat';
import type { Message } from '../utils/types';

type MainChatProps = {
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
};

type SpeechRecognitionAlternativeLike = {
    transcript: string;
};

type SpeechRecognitionResultLike = {
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
    resultIndex: number;
    results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorLike = {
    error?: string;
    message?: string;
};

type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
    start: () => void;
    stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type ChatMode = 'auto' | 'quick' | 'thinking';

const chatModes: ChatMode[] = ['auto', 'quick', 'thinking'];

let messageIdCounter = 0;

const createMessageId = (prefix: string) => {
    messageIdCounter += 1;
    return `${prefix}-${messageIdCounter}`;
};

export default function MainChat({ messages, setMessages }: MainChatProps) {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');
    const [mode, setMode] = useState<ChatMode>('auto');
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

    useEffect(() => {
        const speechWindow = window as SpeechRecognitionWindow;
        const SpeechRecognition =
            speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = false;
        }
    }, []);

    const toggleRecording = () => {
        if (!recognitionRef.current) {
            alert(t('speechNotSupported'));
            return;
        }

        if (isRecording) {
            recognitionRef.current.stop();
            setIsRecording(false);
        } else {
            const speechLocale = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en-US';
            recognitionRef.current.lang = speechLocale;
            recognitionRef.current.onresult = (event) => {
                let newFinal = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        newFinal += event.results[i][0].transcript;
                    }
                }
                if (newFinal) {
                    setInput((prev) => (prev ? prev + ' ' + newFinal : newFinal));
                }
            };
            recognitionRef.current.onend = () => setIsRecording(false);
            recognitionRef.current.onerror = () => {
                setIsRecording(false);
            };

            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch {
                setIsRecording(false);
            }
        }
    };

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const handleEdit = (id: string, content: string) => {
        setEditingId(id);
        setEditContent(content);
    };

    const saveEdit = (id: string) => {
        setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content: editContent } : m))
        );
        setEditingId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditContent('');
    };

    const toggleSpeak = (id: string, content: string) => {
        if (speakingId === id) {
            window.speechSynthesis.cancel();
            setSpeakingId(null);
        } else {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(content);
            utterance.onend = () => setSpeakingId(null);
            utterance.onerror = () => setSpeakingId(null);
            setSpeakingId(id);
            window.speechSynthesis.speak(utterance);
        }
    };

    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const submitMessage = async (query: string, currentMessages: Message[]) => {
        setIsLoading(true);

        const responseId = createMessageId('agent-response');
        const newAiMsg: Message = { id: responseId, role: 'ai', content: '' };
        setMessages([...currentMessages, newAiMsg]);

        try {
            let aiContent = '';

            await streamChat(query, (parsedText) => {
                aiContent += parsedText;
                setMessages((prev) =>
                    prev.map((m) => (m.id === responseId ? { ...m, content: aiContent } : m))
                );
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === responseId
                        ? {
                            ...m,
                            content: m.content + ` \n\n**[请求出错: ${message}]**`
                        }
                        : m
                )
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        const query = input.trim();
        if (!query || isLoading) return;

        const newUserMsg: Message = {
            id: createMessageId('user'),
            role: 'user',
            content: query
        };
        const updatedMessages = [...messages, newUserMsg];
        setMessages(updatedMessages);
        setInput('');
        await submitMessage(query, updatedMessages);
    };

    const handleRegenerate = async (index: number) => {
        if (isLoading) return;

        let userMsgIndex = -1;
        for (let i = index - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userMsgIndex = i;
                break;
            }
        }
        if (userMsgIndex === -1) return;

        const query = messages[userMsgIndex].content;
        const updatedMessages = messages.slice(0, userMsgIndex + 1);
        setMessages(updatedMessages);
        await submitMessage(query, updatedMessages);
    };

    return (
        <div className="flex-1 min-w-0 h-full bg-transparent overflow-y-auto custom-scrollbar transition-colors duration-200">
            <div className="min-h-full flex flex-col">
            <div className="flex-1 px-4 sm:px-8 pt-24 sm:pt-24 pb-6 sm:pb-8 relative bg-transparent">
                <div className="max-w-4xl mx-auto space-y-8 sm:space-y-10">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 mt-20">
                            <Chat01Icon size={48} className="mb-4 opacity-50" />
                            <p>{t('startConversation')}</p>
                        </div>
                    ) : (
                        messages.map((msg, index) => (
                            <div key={msg.id}>
                                {msg.role === 'user' ? (
                                    <div className="flex justify-end mb-6 min-w-0">
                                        <div className="max-w-[85%] sm:max-w-[75%] min-w-0 group">
                                            {editingId === msg.id ? (
                                                <div className="bg-white/60 dark:bg-white/[0.08] backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl p-4 shadow-lg shadow-black/5 dark:shadow-black/25">
                                                    <textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        className="w-full bg-transparent border-none outline-none resize-none text-[15px] text-gray-800 dark:text-gray-200 min-h-[80px]"
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2 mt-2">
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/10 rounded-full transition-colors"
                                                        >
                                                            {t('cancel')}
                                                        </button>
                                                        <button
                                                            onClick={() => saveEdit(msg.id)}
                                                            className="px-3 py-1.5 text-sm font-medium text-white bg-[#5b6ef5] hover:bg-[#4a5ce0] rounded-full transition-colors"
                                                        >
                                                            {t('save')}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-white/60 dark:bg-white/[0.08] backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl px-5 pt-3.5 pb-2.5 shadow-lg shadow-black/5 dark:shadow-black/25 relative overflow-hidden transition-all group-hover:bg-white/70 dark:group-hover:bg-white/[0.11] group-hover:shadow-xl">
                                                    <div className="relative">
                                                        <p className="text-[15px] text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
                                                            {msg.content}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => toggleSpeak(msg.id, msg.content)}
                                                            className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                                                                speakingId === msg.id
                                                                    ? 'text-[#5b6ef5] bg-white/60 dark:bg-white/10'
                                                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10'
                                                            }`}
                                                            title="Speak"
                                                        >
                                                            {speakingId === msg.id ? (
                                                                <VolumeMute01Icon size={14} />
                                                            ) : (
                                                                <VolumeUpIcon size={14} />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => copyText(msg.content)}
                                                            className="flex h-8 w-8 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                            title="Copy"
                                                        >
                                                            <Copy01Icon size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(msg.id, msg.content)}
                                                            className="flex h-8 w-8 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit01Icon size={14} />
                                                        </button>
                                                        <button className="flex h-8 w-8 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors">
                                                            <ArrowDown01Icon size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 sm:gap-4 min-w-0">
                                        <div className="flex-1 min-w-0 space-y-3">
                                            <div className="rounded-3xl bg-white/50 dark:bg-white/[0.06] border border-white/50 dark:border-white/10 backdrop-blur-xl px-5 pt-4 pb-2.5 shadow-lg shadow-black/5 dark:shadow-black/25 space-y-3 overflow-hidden">
                                                <div className="flex items-center gap-1 text-[#5b6ef5] dark:text-blue-400 text-xs font-semibold tracking-wide uppercase">
                                                    校园百事通 <ArrowDown01Icon size={14} />
                                                </div>
                                                <div className="min-w-0 text-[15px] text-gray-800 dark:text-gray-200 leading-[1.7] space-y-4 markdown-body dark:prose-invert [overflow-wrap:anywhere]">
                                                    <ReactMarkdown components={{ code: CodeBlock }}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                                <div className="flex items-center gap-1 pt-1">
                                                    <button className="flex h-8 w-8 items-center justify-center text-[#5b6ef5] dark:text-blue-400 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors">
                                                        <ThumbsUpIcon size={16} />
                                                    </button>
                                                    <button className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors">
                                                        <ThumbsDownIcon size={16} />
                                                    </button>
                                                    <div className="w-px h-4 bg-white/50 dark:bg-white/10 mx-1"></div>
                                                    <button
                                                        onClick={() => toggleSpeak(msg.id, msg.content)}
                                                        className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                                                            speakingId === msg.id
                                                                ? 'text-[#5b6ef5] bg-white/60 dark:bg-white/10'
                                                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10'
                                                        }`}
                                                        title="Speak"
                                                    >
                                                        {speakingId === msg.id ? (
                                                            <VolumeMute01Icon size={16} />
                                                        ) : (
                                                            <VolumeUpIcon size={16} />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => copyText(msg.content)}
                                                        className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                        title="Copy"
                                                    >
                                                        <Copy01Icon size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRegenerate(index)}
                                                        className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                        title={t('regenerate')}
                                                    >
                                                        <Refresh01Icon size={16} />
                                                    </button>
                                                    <button className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors">
                                                        <MoreVerticalIcon size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {isLoading && (
                        <>
                            <div className="flex gap-3 sm:gap-4 pl-2 sm:pl-12">
                                <div className="flex-1 space-y-3">
                                    <div className="rounded-3xl bg-white/50 dark:bg-white/[0.06] border border-white/50 dark:border-white/10 backdrop-blur-xl px-5 py-4 shadow-lg shadow-black/5 dark:shadow-black/25 space-y-3">
                                        <div className="flex items-center gap-1 text-[#5b6ef5] dark:text-blue-400 text-xs font-semibold tracking-wide uppercase">
                                            CHAT A.I + <ArrowDown01Icon size={14} />
                                        </div>
                                        <div className="text-[15px] text-gray-500 dark:text-gray-400 italic flex items-center gap-2">
                                            <Refresh01Icon size={14} className="animate-spin" />
                                            {mode === 'thinking' ? t('thinking') : t('generating')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="sticky bottom-0 shrink-0 px-3 sm:px-6 pb-3 sm:pb-5 pt-2 bg-transparent">
                <div className="mx-auto max-w-4xl rounded-[28px] border border-white/70 dark:border-white/10 bg-white/78 dark:bg-[#10131b]/82 backdrop-blur-2xl backdrop-saturate-150 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.14)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.42)] transition-colors">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                if (e.shiftKey) return;
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={t('placeholder')}
                        rows={1}
                        className="block min-h-[42px] w-full resize-none bg-transparent px-1 pb-1 pt-0 text-[15px] leading-6 text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                    <div className="flex items-center gap-2">
                        <label className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100 shrink-0 cursor-pointer">
                            <input
                                type="file"
                                className="hidden"
                            />
                            <Add01Icon size={20} />
                        </label>
                        <div className="flex-1"></div>
                        <div
                            className="flex shrink-0 items-center rounded-full border border-white/60 bg-white/45 p-1 shadow-inner shadow-white/40 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-black/20"
                            role="radiogroup"
                            aria-label={t('chatMode')}
                        >
                            {chatModes.map((chatMode) => (
                                <button
                                    key={chatMode}
                                    type="button"
                                    onClick={() => setMode(chatMode)}
                                    className={`h-8 min-w-11 rounded-full px-3 text-sm font-medium transition-all ${
                                        mode === chatMode
                                            ? 'bg-white text-gray-900 shadow-sm dark:bg-white/15 dark:text-white'
                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                    }`}
                                    role="radio"
                                    aria-checked={mode === chatMode}
                                >
                                    {t(`chatModes.${chatMode}`)}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={toggleRecording}
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors shrink-0 ${
                                isRecording
                                    ? 'bg-red-100/80 text-red-500 dark:bg-red-900/35 dark:text-red-300 animate-pulse'
                                    : 'text-gray-500 hover:bg-black/5 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100'
                            }`}
                        >
                            {isRecording ? <MicOff01Icon size={18} /> : <Mic01Icon size={18} />}
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-600 text-white shadow-sm transition-all hover:bg-gray-700 hover:scale-105 disabled:bg-gray-300 disabled:text-white disabled:cursor-not-allowed disabled:hover:scale-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white dark:disabled:bg-white/20 dark:disabled:text-white/50 shrink-0"
                        >
                            <ArrowUp01Icon size={20} />
                        </button>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
}
