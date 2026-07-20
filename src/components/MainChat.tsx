import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
import MarkdownContent from './MarkdownContent';
import { ApiAuthError, streamChat } from '../api/chat';
import {
    createMessageId,
    formatConfidence,
    formatThinkingDuration,
    resolveThinkingDurationMs,
} from '../utils/chatHelpers';
import { renderFileTypeIcon } from '../utils/fileTypeIcons';
import { parseSearchSourcesFromMarkdown } from '../utils/searchSources';
import type { Message, RagSource } from '../types';
import SearchSourceList from './SearchSourceList';

type MainChatProps = {
    canWrite: boolean;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
    ensureConversationId: () => string | null;
    onMessagesCommitted: (conversationId: string, messages: Message[]) => Promise<void>;
    onAuthExpired: () => void;
    onOpenRagSource: (source: RagSource) => void;
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
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 80;
const MESSAGE_NAVIGATION_THRESHOLD = 5;
const MESSAGE_NAVIGATION_TITLE_MAX_LENGTH = 64;

type RagSourceGroup = {
    key: string;
    fileName: string;
    count: number;
    confidence: number;
    primarySource: RagSource;
    sources: RagSource[];
};

type MessageNavigationItem = {
    id: string;
    index: number;
    messageIndex: number;
    title: string;
    ariaLabel: string;
};

type MessageNavigatorProps = {
    items: MessageNavigationItem[];
    activeMessageIndex: number;
    isOpen: boolean;
    label: string;
    onOpenChange: (isOpen: boolean) => void;
    onJump: (id: string) => void;
};

const AssistantMarkdownContent = ({ content }: { content: string }) => {
    const parsedContent = parseSearchSourcesFromMarkdown(content);

    return (
        <>
            <MarkdownContent
                content={parsedContent.content}
                citationSources={parsedContent.sources}
            />
            <SearchSourceList sources={parsedContent.sources} />
        </>
    );
};

const ragSourceGroupKey = (source: RagSource): string => {
    return typeof source.fileId === 'number'
        ? `file-${source.fileId}`
        : `name-${source.fileName}`;
};

const groupRagSources = (sources: RagSource[]): RagSourceGroup[] => {
    const groups = new Map<string, RagSourceGroup>();

    sources.forEach((source) => {
        const key = ragSourceGroupKey(source);
        const existingGroup = groups.get(key);

        if (!existingGroup) {
            groups.set(key, {
                key,
                fileName: source.fileName,
                count: 1,
                confidence: source.confidence,
                primarySource: source,
                sources: [source],
            });
            return;
        }

        existingGroup.count += 1;
        existingGroup.sources.push(source);
        if (source.confidence > existingGroup.confidence) {
            existingGroup.confidence = source.confidence;
            existingGroup.primarySource = source;
        }
    });

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            sources: [...group.sources].sort((a, b) => b.confidence - a.confidence),
        }))
        .sort((a, b) => b.confidence - a.confidence);
};

const formatAiMessageTime = (value: string | undefined, language: string): string => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    if (language.startsWith('zh')) {
        return new Intl.DateTimeFormat('zh-CN', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date);
    }

    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
};

const isNearScrollBottom = (element: HTMLElement): boolean => (
    element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX
);

const getMessageNavigationTitle = (message: Message, fallback: string): string => {
    const normalizedContent = message.content.trim().replace(/\s+/g, ' ');

    if (!normalizedContent) {
        return fallback;
    }

    if (normalizedContent.length <= MESSAGE_NAVIGATION_TITLE_MAX_LENGTH) {
        return normalizedContent;
    }

    return `${normalizedContent.slice(0, MESSAGE_NAVIGATION_TITLE_MAX_LENGTH).trimEnd()}...`;
};

const MessageNavigator = ({
    items,
    activeMessageIndex,
    isOpen,
    label,
    onOpenChange,
    onJump,
}: MessageNavigatorProps) => {
    if (items.length < MESSAGE_NAVIGATION_THRESHOLD) {
        return null;
    }

    const currentIndex = items.reduce((current, item) => (
        item.messageIndex <= activeMessageIndex ? item.index : current
    ), 0);

    return (
        <nav
            aria-label={label}
            className="fixed right-2 top-1/2 z-30 -translate-y-1/2 sm:right-5"
            onMouseEnter={() => onOpenChange(true)}
            onMouseLeave={() => onOpenChange(false)}
            onFocus={() => onOpenChange(true)}
            onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    onOpenChange(false);
                }
            }}
        >
            <div className="relative flex items-center justify-end">
                <div
                    className={`absolute right-0 top-1/2 z-20 w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-y-1/2 overflow-hidden rounded-[20px] border border-gray-200/85 bg-white/[0.96] p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl transition-all duration-150 dark:border-white/15 dark:bg-[#151923]/[0.96] dark:shadow-black/45 ${
                        isOpen
                            ? 'pointer-events-auto translate-x-0 opacity-100'
                            : 'pointer-events-none translate-x-0 opacity-0'
                    }`}
                >
                    <div className="max-h-[min(52vh,28rem)] overflow-x-hidden overflow-y-auto rounded-2xl [scrollbar-gutter:stable] custom-scrollbar">
                        {items.map((item) => {
                            const active = item.index === currentIndex;

                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onJump(item.id)}
                                    className={`block w-full min-w-0 rounded-xl px-3 py-2 text-left transition-colors ${
                                        active
                                            ? 'bg-gray-100/90 text-gray-950 dark:bg-white/10 dark:text-white'
                                            : 'text-gray-700 hover:bg-gray-100/75 hover:text-gray-950 dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white'
                                    }`}
                                    title={item.ariaLabel}
                                    aria-label={item.ariaLabel}
                                    aria-current={active ? 'location' : undefined}
                                >
                                    <span className="block truncate text-[15px] leading-6">
                                        {item.title}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="relative z-10 flex max-h-[52vh] w-9 flex-col items-center gap-1.5 overflow-x-hidden overflow-y-auto rounded-full px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {items.map((item) => {
                        const active = item.index === currentIndex;

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onJump(item.id)}
                                className="flex h-3 w-8 shrink-0 items-center justify-center"
                                title={item.ariaLabel}
                                aria-label={item.ariaLabel}
                                aria-current={active ? 'location' : undefined}
                            >
                                <span
                                    className={`block rounded-full transition-all ${
                                        active
                                            ? 'h-[3px] w-6 bg-gray-950 dark:bg-white'
                                            : 'h-0.5 w-5 bg-gray-400/70 hover:bg-gray-600 dark:bg-white/35 dark:hover:bg-white/70'
                                    }`}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
};

export default function MainChat({
    canWrite,
    messages,
    setMessages,
    ensureConversationId,
    onMessagesCommitted,
    onAuthExpired,
    onOpenRagSource,
}: MainChatProps) {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');
    const [mode, setMode] = useState<ChatMode>('auto');
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [speakingId, setSpeakingId] = useState<string | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [activeMessageIndex, setActiveMessageIndex] = useState(0);
    const [isMessageNavigatorOpen, setIsMessageNavigatorOpen] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const shouldFollowScrollRef = useRef(true);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

    const messageNavigationItems = useMemo(
        () => messages.reduce<MessageNavigationItem[]>((items, message, messageIndex) => {
            if (message.role !== 'user') {
                return items;
            }

            const index = items.length;
            const fallback = t('messageNavigator.userFallback');
            const title = getMessageNavigationTitle(message, fallback);

            items.push({
                id: message.id,
                index,
                messageIndex,
                title,
                ariaLabel: t('messageNavigator.jumpTo', { index: index + 1, title }),
            });

            return items;
        }, []),
        [messages, t]
    );

    const setMessageItemRef = useCallback((id: string, element: HTMLDivElement | null) => {
        if (element) {
            messageItemRefs.current.set(id, element);
            return;
        }

        messageItemRefs.current.delete(id);
    }, []);

    useEffect(() => {
        if (!isLoading) {
            return;
        }

        const firstTickId = window.setTimeout(() => {
            setNowMs(Date.now());
        }, 0);
        const timerId = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            window.clearTimeout(firstTickId);
            window.clearInterval(timerId);
        };
    }, [isLoading]);

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

    const saveEdit = async (id: string) => {
        if (!canWrite || isLoading) return;

        const query = editContent.trim();
        if (!query) return;

        const messageIndex = messages.findIndex((message) => message.id === id);
        if (messageIndex < 0 || messages[messageIndex].role !== 'user') return;

        const nextMessages = messages.slice(0, messageIndex + 1).map((message, index) =>
            index === messageIndex ? { ...message, content: query } : message
        );
        setEditingId(null);
        setEditContent('');
        setMessages(nextMessages);
        await submitMessage(query, nextMessages);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditContent('');
    };

    const toggleSpeak = (id: string, content: string) => {
        if (speakingId === id) {
            window.speechSynthesis?.cancel();
            setSpeakingId(null);
        } else {
            window.speechSynthesis?.cancel();
            const utterance = new SpeechSynthesisUtterance(content);
            utterance.onend = () => setSpeakingId(null);
            utterance.onerror = () => setSpeakingId(null);
            setSpeakingId(id);
            window.speechSynthesis.speak(utterance);
        }
    };

    useEffect(() => {
        return () => {
            window.speechSynthesis?.cancel();
        };
    }, []);

    const copyText = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    };

    const updateActiveMessageIndex = useCallback(() => {
        const scrollContainer = scrollContainerRef.current;

        if (!scrollContainer || messages.length === 0) {
            setActiveMessageIndex(0);
            return;
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const targetTop = containerRect.top + Math.min(scrollContainer.clientHeight * 0.35, 260);
        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;

        messages.forEach((message, index) => {
            const element = messageItemRefs.current.get(message.id);
            if (!element) {
                return;
            }

            const rect = element.getBoundingClientRect();
            const distance = rect.top <= targetTop && rect.bottom >= targetTop
                ? 0
                : Math.abs(rect.top - targetTop);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });

        setActiveMessageIndex((current) => current === closestIndex ? current : closestIndex);
    }, [messages]);

    const scrollToMessage = useCallback((id: string) => {
        const targetElement = messageItemRefs.current.get(id);
        if (!targetElement) {
            return;
        }

        shouldFollowScrollRef.current = false;
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setIsMessageNavigatorOpen(false);

        const targetIndex = messages.findIndex((message) => message.id === id);
        if (targetIndex >= 0) {
            setActiveMessageIndex(targetIndex);
        }
    }, [messages]);

    const updateShouldFollowScroll = () => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) {
            return;
        }

        shouldFollowScrollRef.current = isNearScrollBottom(scrollContainer);
        updateActiveMessageIndex();
    };

    useEffect(() => {
        if (shouldFollowScrollRef.current) {
            scrollToBottom();
        }
    }, [messages]);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(updateActiveMessageIndex);

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [updateActiveMessageIndex]);

    const submitMessage = async (query: string, currentMessages: Message[]) => {
        setIsLoading(true);

        const conversationId = ensureConversationId();
        if (!conversationId) {
            setIsLoading(false);
            return;
        }

        const responseId = createMessageId();
        const userMessageId = currentMessages[currentMessages.length - 1]?.id ?? createMessageId();
        const responseCreatedAt = new Date().toISOString();
        const newAiMsg: Message = {
            id: responseId,
            role: 'ai',
            content: '',
            ragSources: [],
            reasoningContent: '',
            reasoningDurationMs: null,
            reasoningStartedAt: Date.parse(responseCreatedAt),
            createdAt: responseCreatedAt,
            updatedAt: responseCreatedAt,
        };
        let committedMessages = [...currentMessages, newAiMsg];
        let shouldCommit = true;
        setMessages(committedMessages);

        try {
            let aiContent = '';

            await streamChat(
                query,
                conversationId,
                userMessageId,
                responseId,
                currentMessages,
                mode !== 'quick',
                (parsedText) => {
                    aiContent += parsedText;
                    committedMessages = committedMessages.map((m) =>
                        m.id === responseId ? { ...m, content: aiContent } : m
                    );
                    setMessages(committedMessages);
                },
                (ragSources) => {
                    committedMessages = committedMessages.map((m) =>
                        m.id === responseId ? { ...m, ragSources } : m
                    );
                    setMessages(committedMessages);
                },
                (reasoningText) => {
                    committedMessages = committedMessages.map((m) =>
                        m.id === responseId
                            ? {
                                ...m,
                                reasoningContent: `${m.reasoningContent ?? ''}${reasoningText}`,
                                reasoningStartedAt: m.reasoningStartedAt ?? Date.now(),
                            }
                            : m
                    );
                    setMessages(committedMessages);
                },
                (reasoningDurationMs) => {
                    committedMessages = committedMessages.map((m) =>
                        m.id === responseId
                            ? {
                                ...m,
                                reasoningDurationMs,
                            }
                            : m
                    );
                    setMessages(committedMessages);
                }
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            committedMessages = committedMessages.map((m) =>
                m.id === responseId
                    ? {
                        ...m,
                        content: `${m.content} \n\n**[${t('chatDetails.requestError', { message })}]**`,
                    }
                    : m
            );
            setMessages(committedMessages);

            if (error instanceof ApiAuthError) {
                shouldCommit = false;
                onAuthExpired();
            }
        } finally {
            setIsLoading(false);
            if (shouldCommit) {
                await onMessagesCommitted(conversationId, committedMessages);
            }
        }
    };

    const handleSend = async () => {
        const query = input.trim();
        if (!query || isLoading || !canWrite) return;

        const userCreatedAt = new Date().toISOString();
        const newUserMsg: Message = {
            id: createMessageId(),
            role: 'user',
            content: query,
            createdAt: userCreatedAt,
            updatedAt: userCreatedAt,
        };
        const updatedMessages = [...messages, newUserMsg];
        setMessages(updatedMessages);
        setInput('');
        await submitMessage(query, updatedMessages);
    };

    const handleRegenerate = async (index: number) => {
        if (isLoading || !canWrite) return;

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
        <div
            ref={scrollContainerRef}
            onScroll={updateShouldFollowScroll}
            className="flex-1 min-w-0 h-full bg-transparent overflow-y-auto custom-scrollbar transition-colors duration-200"
        >
            <MessageNavigator
                items={messageNavigationItems}
                activeMessageIndex={activeMessageIndex}
                isOpen={isMessageNavigatorOpen}
                label={t('messageNavigator.label')}
                onOpenChange={setIsMessageNavigatorOpen}
                onJump={scrollToMessage}
            />
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
                            <div
                                key={msg.id}
                                ref={(element) => setMessageItemRef(msg.id, element)}
                                className="scroll-mt-24"
                            >
                                {msg.role === 'user' ? (
                                    <div className="flex justify-end mb-6 min-w-0">
                                        <div
                                            className={`min-w-0 group ${
                                                editingId === msg.id
                                                    ? 'w-full sm:w-[82%]'
                                                    : 'max-w-[85%] sm:max-w-[75%]'
                                            }`}
                                        >
                                            {editingId === msg.id ? (
                                                <div className="bg-white/60 dark:bg-white/[0.08] backdrop-blur-xl border border-white/60 dark:border-white/10 rounded-3xl p-4 shadow-lg shadow-black/5 dark:shadow-black/25">
                                                    <textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        className="block w-full min-h-[132px] bg-transparent border-none outline-none resize-y text-[15px] leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap [overflow-wrap:anywhere]"
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
                                                            disabled={!canWrite}
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
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                                    <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-[#5b6ef5] dark:text-blue-400">
                                                        {t('appName')} <ArrowDown01Icon size={14} />
                                                    </span>
                                                    {formatAiMessageTime(msg.createdAt, i18n.language) && (
                                                        <span className="font-medium text-gray-500 dark:text-gray-400">
                                                            {formatAiMessageTime(msg.createdAt, i18n.language)}
                                                        </span>
                                                    )}
                                                </div>
                                                <>
                                                    {((msg.reasoningContent?.trim().length ?? 0) > 0 || msg.reasoningDurationMs != null) && (
                                                        <details className="group rounded-2xl border border-gray-200/70 bg-white/45 dark:border-white/10 dark:bg-white/[0.04]">
                                                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 outline-none transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
                                                                <ArrowDown01Icon
                                                                    size={14}
                                                                    className="shrink-0 transition-transform group-open:rotate-180"
                                                                />
                                                                <span>
                                                                    {msg.reasoningDurationMs == null && isLoading && index === messages.length - 1
                                                                        ? t('reasoningInProgress', {
                                                                            duration: formatThinkingDuration(
                                                                                resolveThinkingDurationMs(
                                                                                    msg.reasoningDurationMs,
                                                                                    msg.reasoningStartedAt,
                                                                                    nowMs
                                                                                )
                                                                            ) || '0s',
                                                                        })
                                                                        : formatThinkingDuration(
                                                                            resolveThinkingDurationMs(
                                                                                msg.reasoningDurationMs,
                                                                                msg.reasoningStartedAt,
                                                                                nowMs
                                                                            )
                                                                        )
                                                                            ? t('reasoningComplete', {
                                                                                duration: formatThinkingDuration(
                                                                                    resolveThinkingDurationMs(
                                                                                        msg.reasoningDurationMs,
                                                                                        msg.reasoningStartedAt,
                                                                                        nowMs
                                                                                    )
                                                                                ),
                                                                            })
                                                                            : t('reasoningCompleteNoDuration')}
                                                                </span>
                                                            </summary>
                                                            {(msg.reasoningContent?.trim().length ?? 0) > 0 && (
                                                                <div className="border-t border-gray-200/70 px-3 py-3 text-[13px] leading-6 text-gray-600 whitespace-pre-wrap [overflow-wrap:anywhere] dark:border-white/10 dark:text-gray-300">
                                                                    {msg.reasoningContent}
                                                                </div>
                                                            )}
                                                        </details>
                                                    )}
                                                    {isLoading && index === messages.length - 1 && !msg.content.trim() ? (
                                                        <div className="text-[15px] text-gray-500 dark:text-gray-400 italic flex items-center gap-2">
                                                            <Refresh01Icon size={14} className="animate-spin" />
                                                            {mode === 'quick'
                                                                ? t('generating')
                                                                : t('reasoningInProgress', {
                                                                    duration: formatThinkingDuration(
                                                                        resolveThinkingDurationMs(
                                                                            msg.reasoningDurationMs,
                                                                            msg.reasoningStartedAt,
                                                                            nowMs
                                                                        )
                                                                    ) || '0s',
                                                                })}
                                                        </div>
                                                    ) : (
                                                        msg.content.trim() !== '' && (
                                                            <div className="min-w-0 text-[15px] text-gray-800 dark:text-gray-200 leading-[1.7] space-y-4 markdown-body dark:prose-invert [overflow-wrap:anywhere]">
                                                                <AssistantMarkdownContent content={msg.content} />
                                                            </div>
                                                        )
                                                    )}
                                                    {(msg.ragSources?.length ?? 0) > 0 && (
                                                        <div className="border-t border-gray-200/70 pt-3 dark:border-white/10">
                                                            <div className="mb-2 flex items-center justify-between gap-3">
                                                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                                                    {t('chatDetails.rag.title')}
                                                                </div>
                                                                <div className="text-xs text-gray-400 dark:text-gray-500">
                                                                    {t('chatDetails.rag.summary', {
                                                                        files: groupRagSources(msg.ragSources ?? []).length,
                                                                        chunks: (msg.ragSources ?? []).length,
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div className="grid gap-2">
                                                                {groupRagSources(msg.ragSources ?? []).map((sourceGroup) => (
                                                                    <div
                                                                        key={sourceGroup.key}
                                                                        className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white/60 text-gray-700 shadow-sm shadow-white/40 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200 dark:shadow-none"
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onOpenRagSource(sourceGroup.primarySource)}
                                                                            disabled={typeof sourceGroup.primarySource.fileId !== 'number'}
                                                                            className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-70 dark:hover:bg-white/10"
                                                                            title={typeof sourceGroup.primarySource.fileId === 'number'
                                                                                ? sourceGroup.primarySource.snippet || sourceGroup.fileName
                                                                                : t('chatDetails.rag.legacyUnavailable')}
                                                                        >
                                                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#5b6ef5] dark:bg-blue-400/10 dark:text-blue-200">
                                                                                {renderFileTypeIcon(sourceGroup.fileName, {
                                                                                    size: 14,
                                                                                })}
                                                                            </span>
                                                                            <span className="min-w-0 flex-1">
                                                                                <span className="block truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                                                                                    {sourceGroup.fileName}
                                                                                </span>
                                                                                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                                                                    {t('chatDetails.rag.fileSnippetCount', { count: sourceGroup.count })}
                                                                                </span>
                                                                            </span>
                                                                            <span className="shrink-0 rounded-full bg-[#eef2ff] px-2 py-1 text-xs font-semibold text-[#4a5ce0] dark:bg-blue-400/10 dark:text-blue-200">
                                                                                {formatConfidence(sourceGroup.confidence)}
                                                                            </span>
                                                                        </button>
                                                                        <div className="border-t border-gray-200/70 bg-white/35 px-2 py-2 dark:border-white/10 dark:bg-black/10">
                                                                            <div className="grid gap-1.5 sm:grid-cols-2">
                                                                                {sourceGroup.sources.map((source, sourceIndex) => (
                                                                                    <button
                                                                                        key={`${sourceGroup.key}-${source.chunkIndex ?? sourceIndex}`}
                                                                                        type="button"
                                                                                        onClick={() => onOpenRagSource(source)}
                                                                                        disabled={typeof source.fileId !== 'number'}
                                                                                        className="min-w-0 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/75 disabled:cursor-not-allowed disabled:opacity-70 dark:hover:bg-white/10"
                                                                                        title={typeof source.fileId === 'number'
                                                                                            ? source.snippet || source.fileName
                                                                                            : t('chatDetails.rag.legacyUnavailable')}
                                                                                    >
                                                                                        <span className="mb-1 flex items-center justify-between gap-2">
                                                                                            <span className="truncate text-xs font-semibold text-gray-600 dark:text-gray-300">
                                                                                                {typeof source.pageNumber === 'number'
                                                                                                    ? t('chatDetails.rag.pagePrefix', { page: source.pageNumber })
                                                                                                    : ''}
                                                                                                {t('chatDetails.rag.chunkLabel', {
                                                                                                    index: typeof source.chunkIndex === 'number'
                                                                                                        ? source.chunkIndex + 1
                                                                                                        : sourceIndex + 1,
                                                                                                })}
                                                                                            </span>
                                                                                            <span className="shrink-0 text-xs font-semibold text-[#5b6ef5] dark:text-blue-300">
                                                                                                {formatConfidence(source.confidence)}
                                                                                            </span>
                                                                                        </span>
                                                                                        <span className="line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                                                                            {source.snippet || t('chatDetails.rag.snippetFallback')}
                                                                                        </span>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.content.trim() !== '' && (
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
                                                                    title={t('speak')}
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
                                                                    title={t('copy')}
                                                                >
                                                                    <Copy01Icon size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRegenerate(index)}
                                                                    disabled={!canWrite}
                                                                    className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors"
                                                                    title={t('regenerate')}
                                                                >
                                                                    <Refresh01Icon size={16} />
                                                                </button>
                                                                <button className="flex h-8 w-8 items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl transition-colors">
                                                                    <MoreVerticalIcon size={16} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
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
                        disabled={!canWrite}
                        rows={1}
                        className="block min-h-[42px] w-full resize-none bg-transparent px-1 pb-1 pt-0 text-[15px] leading-6 text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                    {!canWrite && (
                        <div className="pb-2 text-sm text-gray-500 dark:text-gray-400">
                            {t('readOnlyConversation')}
                        </div>
                    )}
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
                            disabled={isLoading || !input.trim() || !canWrite}
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
