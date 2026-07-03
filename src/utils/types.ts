export type RagSource = {
    fileId?: number;
    fileName: string;
    chunkIndex?: number | null;
    pageNumber?: number | null;
    snippet?: string;
    confidence: number;
};

export type SearchSource = {
    index: number;
    title: string;
    url: string;
    description: string;
    host: string;
};

export type Message = {
    id: string;
    role: 'user' | 'ai';
    content: string;
    ragSources?: RagSource[];
    reasoningContent?: string | null;
    reasoningDurationMs?: number | null;
    reasoningStartedAt?: number | null;
    createdAt?: string;
    updatedAt?: string;
};

export type UserMemory = {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
};

export type ConversationShareScope = 'private' | 'link_read' | 'link_write';

export type ConversationPermission = 'owner' | 'read' | 'write';

export type Conversation = {
    id: string;
    title: string;
    ownerUserId: number;
    shareScope: ConversationShareScope;
    permission: ConversationPermission;
    canWrite: boolean;
    isPinned: boolean;
    pinnedAt: string | null;
    isVisible: boolean;
    createdAt: string;
    updatedAt: string;
    messages: Message[];
};

export type ConversationSummary = {
    id: string;
    title: string;
    shareScope: ConversationShareScope;
    permission: ConversationPermission;
    canWrite: boolean;
    isPinned: boolean;
    pinnedAt: string | null;
    isVisible: boolean;
    createdAt: string;
    updatedAt: string;
};
