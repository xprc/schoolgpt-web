import type { Conversation, ConversationSummary } from '../types';

type StoredConversation = Conversation & {
    userId: number;
};

const dbName = 'schoolgpt.chat';
const dbVersion = 1;
const conversationStoreName = 'conversations';

let dbPromise: Promise<IDBDatabase> | null = null;

const openChatDb = (): Promise<IDBDatabase> => {
    if (dbPromise) {
        return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(conversationStoreName)) {
                const store = db.createObjectStore(conversationStoreName, { keyPath: 'id' });
                store.createIndex('userId', 'userId', { unique: false });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const timestampMs = (value: string | null): number => {
    if (!value) {
        return 0;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const sortConversationSummaries = (
    summaries: ConversationSummary[]
): ConversationSummary[] => {
    return [...summaries].sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
            return a.isPinned ? -1 : 1;
        }

        const aTime = a.isPinned ? timestampMs(a.pinnedAt) : timestampMs(a.updatedAt);
        const bTime = b.isPinned ? timestampMs(b.pinnedAt) : timestampMs(b.updatedAt);
        return bTime - aTime;
    });
};

const transactionDone = (transaction: IDBTransaction): Promise<void> => {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
};

const toSummary = (conversation: StoredConversation): ConversationSummary => {
    return {
        id: conversation.id,
        title: conversation.title,
        shareScope: conversation.shareScope,
        permission: conversation.permission,
        canWrite: conversation.canWrite,
        isPinned: conversation.isPinned ?? false,
        pinnedAt: conversation.pinnedAt ?? null,
        isVisible: conversation.isVisible ?? true,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
    };
};

export const saveLocalConversation = async (
    userId: number,
    conversation: Conversation
): Promise<void> => {
    const db = await openChatDb();
    const transaction = db.transaction(conversationStoreName, 'readwrite');
    transaction.objectStore(conversationStoreName).put({
        ...conversation,
        userId,
    } satisfies StoredConversation);
    await transactionDone(transaction);
};

export const getLocalConversation = async (
    userId: number,
    conversationId: string
): Promise<Conversation | null> => {
    const db = await openChatDb();
    const transaction = db.transaction(conversationStoreName, 'readonly');
    const stored = await requestToPromise<StoredConversation | undefined>(
        transaction.objectStore(conversationStoreName).get(conversationId)
    );
    await transactionDone(transaction);

    if (!stored || stored.userId !== userId) {
        return null;
    }

    const { userId: storedUserId, ...conversation } = stored;
    void storedUserId;
    return {
        ...conversation,
        isPinned: conversation.isPinned ?? false,
        pinnedAt: conversation.pinnedAt ?? null,
        isVisible: conversation.isVisible ?? true,
    };
};

export const listLocalConversationSummaries = async (
    userId: number
): Promise<ConversationSummary[]> => {
    const db = await openChatDb();
    const transaction = db.transaction(conversationStoreName, 'readonly');
    const storedConversations = await requestToPromise<StoredConversation[]>(
        transaction.objectStore(conversationStoreName).getAll()
    );
    await transactionDone(transaction);

    return sortConversationSummaries(
        storedConversations
            .filter(
                (conversation) =>
                    conversation.userId === userId && conversation.isVisible !== false
            )
            .map(toSummary)
    );
};

export const deleteLocalConversation = async (
    userId: number,
    conversationId: string
): Promise<void> => {
    const db = await openChatDb();
    const transaction = db.transaction(conversationStoreName, 'readwrite');
    const store = transaction.objectStore(conversationStoreName);
    const stored = await requestToPromise<StoredConversation | undefined>(
        store.get(conversationId)
    );

    if (stored && stored.userId === userId) {
        store.delete(conversationId);
    }

    await transactionDone(transaction);
};

export const deleteLocalConversationsNotInRemote = async (
    userId: number,
    remoteConversationIds: Set<string>
): Promise<string[]> => {
    const db = await openChatDb();
    const transaction = db.transaction(conversationStoreName, 'readwrite');
    const store = transaction.objectStore(conversationStoreName);
    const storedConversations = await requestToPromise<StoredConversation[]>(
        store.getAll()
    );
    const deletedConversationIds: string[] = [];

    storedConversations.forEach((conversation) => {
        if (conversation.userId !== userId || remoteConversationIds.has(conversation.id)) {
            return;
        }

        store.delete(conversation.id);
        deletedConversationIds.push(conversation.id);
    });

    await transactionDone(transaction);
    return deletedConversationIds;
};

export const hideLocalConversation = async (
    userId: number,
    conversationId: string
): Promise<void> => {
    const db = await openChatDb();
    const transaction = db.transaction(conversationStoreName, 'readwrite');
    const store = transaction.objectStore(conversationStoreName);
    const stored = await requestToPromise<StoredConversation | undefined>(
        store.get(conversationId)
    );

    if (stored && stored.userId === userId) {
        store.put({
            ...stored,
            isVisible: false,
            updatedAt: new Date().toISOString(),
        } satisfies StoredConversation);
    }

    await transactionDone(transaction);
};
