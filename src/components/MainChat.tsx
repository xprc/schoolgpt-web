import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import {
    ArrowDown01Icon,
    Attachment01Icon,
    Chat01Icon,
    Copy01Icon,
    Edit01Icon,
    Mic01Icon,
    MicOff01Icon,
    MoreVerticalIcon,
    Refresh01Icon,
    SentIcon,
    ThumbsDownIcon,
    ThumbsUpIcon,
    VolumeMute01Icon,
    VolumeUpIcon
} from 'hugeicons-react';
import CodeBlock from './CodeBlock';
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

let messageIdCounter = 0;

const createMessageId = (prefix: string) => {
    messageIdCounter += 1;
    return `${prefix}-${messageIdCounter}`;
};

export default function MainChat({ messages, setMessages }: MainChatProps) {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');
    const [mode, setMode] = useState<'auto' | 'thinking'>('auto');
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
            recognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error:', event);
                setIsRecording(false);
            };

            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch (e) {
                console.error(e);
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

        const url = 'http://127.0.0.1:8000/api/chat';
        const payload = { query: query };
        const myToken = 'my-super-secret-token';

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + myToken
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('鉴权失败：Token 无效');
                } else {
                    throw new Error('网络请求失败');
                }
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No readable stream');

            const decoder = new TextDecoder('utf-8');
            let done = false;
            let aiContent = '';
            let buffer = '';

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;

                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    let eventEndIndex;
                    while ((eventEndIndex = buffer.indexOf('\n\n')) >= 0) {
                        const event = buffer.slice(0, eventEndIndex);
                        buffer = buffer.slice(eventEndIndex + 2);

                        if (event.trim() === 'data: [DONE]') continue;

                        let dataText = '';
                        let hasData = false;
                        const lines = event.split('\n');

                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (line.startsWith('data:')) {
                                hasData = true;
                                let rawData = line.substring(5);
                                if (rawData.startsWith(' ')) rawData = rawData.substring(1);
                                dataText += (dataText.length > 0 ? '\n' : '') + rawData;
                            } else if (hasData && line !== '') {
                                dataText += '\n' + line;
                            }
                        }

                        if (hasData) {
                            let parsedText = dataText;
                            if (dataText === '') {
                                parsedText = '\n';
                            } else {
                                try {
                                    const dataObj = JSON.parse(dataText);
                                    if (typeof dataObj === 'string') {
                                        parsedText = dataObj;
                                    } else if (
                                        typeof dataObj === 'number' ||
                                        typeof dataObj === 'boolean'
                                    ) {
                                        parsedText = String(dataObj);
                                    } else if (dataObj !== null && typeof dataObj === 'object') {
                                        if (dataObj.content !== undefined) {
                                            parsedText = dataObj.content;
                                        } else if (
                                            dataObj.choices?.[0]?.delta?.content !== undefined
                                        ) {
                                            parsedText = dataObj.choices[0].delta.content;
                                        } else if (dataObj.response !== undefined) {
                                            parsedText = dataObj.response;
                                        } else if (dataObj.message?.content !== undefined) {
                                            parsedText = dataObj.message.content;
                                        } else if (dataObj.answer !== undefined) {
                                            parsedText = dataObj.answer;
                                        } else {
                                            parsedText = '';
                                        }
                                    } else {
                                        parsedText = '';
                                    }
                                } catch {
                                    parsedText = dataText.replace(/\\n/g, '\n');
                                }
                            }

                            if (parsedText) {
                                aiContent += parsedText;
                                setMessages((prev) =>
                                    prev.map((m) =>
                                        m.id === responseId ? { ...m, content: aiContent } : m
                                    )
                                );
                            }
                        }
                    }
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('请求发生错误: ', error);
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
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-[#1a1a1a] overflow-hidden transition-colors duration-200">
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8 custom-scrollbar relative">
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
                                    <div className="flex justify-end mb-6">
                                        <div className="max-w-[85%] sm:max-w-[75%] group">
                                            {editingId === msg.id ? (
                                                <div className="bg-[#f0f4f9] dark:bg-[#2a2a2a] rounded-3xl p-4 shadow-sm">
                                                    <textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        className="w-full bg-transparent border-none outline-none resize-none text-[15px] text-gray-800 dark:text-gray-200 min-h-[80px]"
                                                        autoFocus
                                                    />
                                                    <div className="flex justify-end gap-2 mt-2">
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
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
                                                <div className="relative">
                                                    <div className="bg-[#f0f4f9] dark:bg-[#2a2a2a] rounded-3xl rounded-tr-sm px-5 py-3.5 shadow-sm relative group-hover:shadow-md transition-shadow">
                                                        <p className="text-[15px] text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                                                            {msg.content}
                                                        </p>
                                                        <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <ArrowDown01Icon size={16} />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                                        <button
                                                            onClick={() => toggleSpeak(msg.id, msg.content)}
                                                            className={`p-1.5 rounded-full transition-colors ${
                                                                speakingId === msg.id
                                                                    ? 'text-[#5b6ef5] bg-blue-50 dark:bg-blue-900/30'
                                                                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
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
                                                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                                                            title="Copy"
                                                        >
                                                            <Copy01Icon size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEdit(msg.id, msg.content)}
                                                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit01Icon size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 sm:gap-4 pl-2 sm:pl-12">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-1 text-[#5b6ef5] dark:text-blue-400 text-xs font-semibold tracking-wide uppercase">
                                                CHAT A.I + <ArrowDown01Icon size={14} />
                                            </div>
                                            <div className="text-[15px] text-gray-800 dark:text-gray-200 leading-[1.7] space-y-4 markdown-body dark:prose-invert">
                                                <ReactMarkdown components={{ code: CodeBlock }}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>

                                            <div className="flex items-center justify-between pt-4">
                                                <div className="flex items-center gap-1">
                                                    <button className="p-2 text-[#5b6ef5] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                                                        <ThumbsUpIcon size={16} />
                                                    </button>
                                                    <button className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                                        <ThumbsDownIcon size={16} />
                                                    </button>
                                                    <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                                    <button
                                                        onClick={() => toggleSpeak(msg.id, msg.content)}
                                                        className={`p-2 rounded-lg transition-colors ${
                                                            speakingId === msg.id
                                                                ? 'text-[#5b6ef5] bg-blue-50 dark:bg-blue-900/30'
                                                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
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
                                                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                                        title="Copy"
                                                    >
                                                        <Copy01Icon size={16} />
                                                    </button>
                                                    <button className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                                                        <MoreVerticalIcon size={16} />
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => handleRegenerate(index)}
                                                    className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm transition-colors"
                                                >
                                                    <Refresh01Icon size={14} />
                                                    {t('regenerate')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {index < messages.length - 1 && (
                                    <div className="h-px bg-gray-100 dark:bg-gray-800 w-full my-6 sm:my-8"></div>
                                )}
                            </div>
                        ))
                    )}

                    {isLoading && (
                        <>
                            {messages.length > 0 && (
                                <div className="h-px bg-gray-100 dark:bg-gray-800 w-full my-6 sm:my-8"></div>
                            )}
                            <div className="flex gap-3 sm:gap-4 pl-2 sm:pl-12">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-1 text-[#5b6ef5] dark:text-blue-400 text-xs font-semibold tracking-wide uppercase">
                                        CHAT A.I + <ArrowDown01Icon size={14} />
                                    </div>
                                    <div className="text-[15px] text-gray-500 dark:text-gray-400 italic flex items-center gap-2">
                                        <Refresh01Icon size={14} className="animate-spin" />
                                        {mode === 'thinking' ? t('thinking') : t('generating')}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="p-2 sm:p-3 pl-2 sm:pl-4 flex items-center gap-2 sm:gap-3 shrink-0 border-t border-gray-200/60 dark:border-gray-800/60">
                <label className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 flex items-center justify-center shrink-0 cursor-pointer transition-colors">
                    <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                console.log('File selected:', e.target.files[0].name);
                            }
                        }}
                    />
                    <Attachment01Icon size={18} className="text-gray-600 dark:text-gray-300" />
                </label>
                <button
                    onClick={toggleRecording}
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                        isRecording
                            ? 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400 animate-pulse'
                            : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                >
                    {isRecording ? <MicOff01Icon size={18} /> : <Mic01Icon size={18} />}
                </button>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'auto' | 'thinking')}
                    className="hidden sm:block bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800/60 text-sm text-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 outline-none cursor-pointer hover:bg-gray-100 dark:hover:bg-[#222] transition-colors appearance-none pr-8 relative font-medium"
                    style={{
                        backgroundImage:
                            'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right .7rem top 50%',
                        backgroundSize: '.65rem auto'
                    }}
                >
                    <option value="auto">{t('auto')}</option>
                    <option value="thinking">{t('thinkingMode')}</option>
                </select>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            if (e.shiftKey) return;
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={`${t('placeholder')}${t('enterToSend')}`}
                    className="flex-1 bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 text-[14px] sm:text-[15px] px-2"
                />
                <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="w-10 h-10 sm:w-12 sm:h-12 bg-[#5b6ef5] hover:bg-[#4a5ce0] disabled:bg-blue-300 dark:disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-transform hover:scale-105 shadow-sm"
                >
                    <SentIcon size={18} className="ml-0.5" />
                </button>
            </div>
        </div>
    );
}
