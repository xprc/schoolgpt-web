export type SourceFileKind =
    | 'image'
    | 'archive'
    | 'audio'
    | 'video'
    | 'code'
    | 'pdf'
    | 'text'
    | 'csv'
    | 'document'
    | 'spreadsheet'
    | 'presentation'
    | 'file';

const imageFileExtensions = new Set(['apng', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const archiveFileExtensions = new Set(['7z', 'gz', 'rar', 'tar', 'zip']);
const audioFileExtensions = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']);
const videoFileExtensions = new Set(['avi', 'mkv', 'mov', 'mp4', 'webm']);
const codeFileExtensions = new Set([
    'c',
    'cpp',
    'css',
    'go',
    'html',
    'java',
    'js',
    'json',
    'jsx',
    'py',
    'rs',
    'sql',
    'ts',
    'tsx',
    'xml',
    'yml',
    'yaml',
]);

export const createMessageId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const formatConfidence = (confidence: number): string => {
    return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
};

export const formatThinkingDuration = (durationMs?: number | null): string => {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
        return '';
    }

    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `${minutes}m${seconds.toString().padStart(2, '0')}s`;
    }

    return `${seconds}s`;
};

export const resolveThinkingDurationMs = (
    reasoningDurationMs?: number | null,
    reasoningStartedAt?: number | null,
    nowMs: number = Date.now()
): number | null => {
    if (typeof reasoningDurationMs === 'number' && Number.isFinite(reasoningDurationMs)) {
        return Math.max(0, reasoningDurationMs);
    }

    if (typeof reasoningStartedAt !== 'number' || !Number.isFinite(reasoningStartedAt)) {
        return null;
    }

    return Math.max(0, nowMs - reasoningStartedAt);
};

export const getFileExtension = (fileName: string): string => {
    const cleanName = fileName.split(/[?#]/)[0] ?? '';
    const baseName = cleanName.split(/[\\/]/).pop() ?? cleanName;
    const dotIndex = baseName.lastIndexOf('.');

    return dotIndex >= 0 ? baseName.slice(dotIndex + 1).toLowerCase() : '';
};

export const getSourceFileKind = (fileName: string): SourceFileKind => {
    const extension = getFileExtension(fileName);

    if (extension === 'pdf') return 'pdf';
    if (extension === 'txt' || extension === 'md') return 'text';
    if (extension === 'csv') return 'csv';
    if (extension === 'doc' || extension === 'docx') return 'document';
    if (extension === 'xls' || extension === 'xlsx') return 'spreadsheet';
    if (extension === 'ppt' || extension === 'pptx') return 'presentation';
    if (imageFileExtensions.has(extension)) return 'image';
    if (archiveFileExtensions.has(extension)) return 'archive';
    if (audioFileExtensions.has(extension)) return 'audio';
    if (videoFileExtensions.has(extension)) return 'video';
    if (codeFileExtensions.has(extension)) return 'code';

    return 'file';
};
