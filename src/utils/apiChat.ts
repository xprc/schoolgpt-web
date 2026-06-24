import { apiBaseUrl } from './apiConfig';
import { getAccessToken } from './auth';

export class ApiAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ApiAuthError';
    }
}

type ChatChunkHandler = (content: string) => void;

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

export const streamChat = async (
    query: string,
    conversationId: string,
    messageId: string,
    responseId: string,
    onChunk: ChatChunkHandler
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

            const parsedText = normalizePayload(dataText);
            if (parsedText) {
                onChunk(parsedText);
            }

            eventEndIndex = buffer.indexOf('\n\n');
        }
    }
};
