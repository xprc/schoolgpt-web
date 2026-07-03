import { apiBaseUrl } from './apiConfig';
import { getAccessToken } from './auth';
import type { Message, RagSource } from './types';

export class ApiAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ApiAuthError';
    }
}

type ChatChunkHandler = (content: string) => void;
type RagSourcesHandler = (sources: RagSource[]) => void;
type ReasoningChunkHandler = (content: string) => void;
type ReasoningDoneHandler = (durationMs: number) => void;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const readDataPayload = (event: string): string | null => {
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

    return hasData ? dataText : null;
};

const normalizePayload = (dataText: string): string => {
    if (dataText === '') {
        return '\n';
    }

    try {
        const dataObj: unknown = JSON.parse(dataText);

        if (typeof dataObj === 'string') {
            return dataObj;
        }

        if (typeof dataObj === 'number' || typeof dataObj === 'boolean') {
            return String(dataObj);
        }

        if (!isRecord(dataObj)) {
            return '';
        }

        if (typeof dataObj.content === 'string') {
            return dataObj.content;
        }

        if (typeof dataObj.response === 'string') {
            return dataObj.response;
        }

        if (typeof dataObj.answer === 'string') {
            return dataObj.answer;
        }

        const message = dataObj.message;
        if (isRecord(message) && typeof message.content === 'string') {
            return message.content;
        }

        const choices = dataObj.choices;
        if (Array.isArray(choices)) {
            const firstChoice = choices[0];
            if (isRecord(firstChoice)) {
                const delta = firstChoice.delta;
                if (isRecord(delta) && typeof delta.content === 'string') {
                    return delta.content;
                }
            }
        }

        return '';
    } catch {
        return dataText.replace(/\\n/g, '\n');
    }
};

const normalizeRagSources = (value: unknown): RagSource[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((source): RagSource | null => {
            if (!isRecord(source) || typeof source.file_name !== 'string') {
                return null;
            }

            const confidence = Number(source.confidence ?? 0);
            const fileId = Number(source.file_id);
            const chunkIndex = Number(source.chunk_index);
            const pageNumber = Number(source.page_number);
            const snippet = typeof source.snippet === 'string' ? source.snippet : '';
            const normalizedSource: RagSource = {
                fileName: source.file_name,
                confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
            };
            if (Number.isFinite(fileId)) {
                normalizedSource.fileId = fileId;
            }
            if (Number.isFinite(chunkIndex)) {
                normalizedSource.chunkIndex = chunkIndex;
            }
            if (Number.isFinite(pageNumber)) {
                normalizedSource.pageNumber = pageNumber;
            }
            if (snippet) {
                normalizedSource.snippet = snippet;
            }

            return normalizedSource;
        })
        .filter((source): source is RagSource => source !== null);
};

export const streamChat = async (
    query: string,
    conversationId: string,
    messageId: string,
    responseId: string,
    messages: Message[],
    enableThinking: boolean,
    onChunk: ChatChunkHandler,
    onRagSources?: RagSourcesHandler,
    onReasoningChunk?: ReasoningChunkHandler,
    onReasoningDone?: ReasoningDoneHandler
): Promise<void> => {
    const accessToken = getAccessToken();
    if (!accessToken) {
        throw new ApiAuthError('请先登录');
    }

    const response = await fetch(`${apiBaseUrl}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            query,
            conversation_id: conversationId,
            message_id: messageId,
            response_id: responseId,
            enable_thinking: enableThinking,
            messages: messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                rag_sources: (message.ragSources ?? []).map((source) => ({
                    file_id: source.fileId,
                    file_name: source.fileName,
                    chunk_index: source.chunkIndex,
                    page_number: source.pageNumber,
                    snippet: source.snippet,
                    confidence: source.confidence,
                })),
            })),
        }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new ApiAuthError('登录已过期，请重新登录');
        }

        throw new Error('网络请求失败');
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder('utf-8');
    let done = false;
    let buffer = '';

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (!value) {
            continue;
        }

        buffer += decoder.decode(value, { stream: true });
        let eventEndIndex = buffer.indexOf('\n\n');

        while (eventEndIndex >= 0) {
            const event = buffer.slice(0, eventEndIndex);
            buffer = buffer.slice(eventEndIndex + 2);

            const dataText = readDataPayload(event);
            if (dataText === null || dataText.trim() === '[DONE]') {
                eventEndIndex = buffer.indexOf('\n\n');
                continue;
            }

            try {
                const dataObj: unknown = JSON.parse(dataText);
                if (
                    isRecord(dataObj)
                    && dataObj.type === 'rag_sources'
                ) {
                    onRagSources?.(normalizeRagSources(dataObj.sources));
                    eventEndIndex = buffer.indexOf('\n\n');
                    continue;
                }

                if (
                    isRecord(dataObj)
                    && dataObj.type === 'reasoning'
                    && typeof dataObj.content === 'string'
                ) {
                    onReasoningChunk?.(dataObj.content);
                    eventEndIndex = buffer.indexOf('\n\n');
                    continue;
                }

                if (
                    isRecord(dataObj)
                    && dataObj.type === 'reasoning_done'
                ) {
                    const durationMs = Number(dataObj.duration_ms ?? 0);
                    if (Number.isFinite(durationMs)) {
                        onReasoningDone?.(Math.max(0, durationMs));
                    }
                    eventEndIndex = buffer.indexOf('\n\n');
                    continue;
                }
            } catch {
                // Content chunks are often JSON strings; normalizePayload handles them below.
            }

            const parsedText = normalizePayload(dataText);
            if (parsedText) {
                onChunk(parsedText);
            }

            eventEndIndex = buffer.indexOf('\n\n');
        }
    }
};
