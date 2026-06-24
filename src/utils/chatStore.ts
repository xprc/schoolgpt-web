import type { Conversation, ConversationSummary } from './types';

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
    return conversation;
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

    return storedConversations
        .filter((conversation) => conversation.userId === userId)
        .map(toSummary)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
};
