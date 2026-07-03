import { useEffect, useMemo, useState } from 'react';
import {
    Cancel01Icon,
    File01Icon,
    Refresh01Icon,
    Search01Icon,
} from 'hugeicons-react';
import { ApiAuthError } from '../utils/apiChat';
import {
    fetchRagFile,
    fetchRagFiles,
    type RagFileDetail,
    type RagFileSummary,
} from '../utils/apiRagFiles';
import MarkdownContent from './MarkdownContent';

export type RagFileOpenRequest = {
    fileId?: number;
    chunkIndex?: number | null;
    snippet?: string;
    nonce: number;
};

type RagFileBrowserProps = {
    isOpen: boolean;
    openRequest: RagFileOpenRequest | null;
    onClose: () => void;
    onAuthExpired: () => void;
};

const formatFileSize = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let nextValue = value;
    let unitIndex = 0;
    while (nextValue >= 1024 && unitIndex < units.length - 1) {
        nextValue /= 1024;
        unitIndex += 1;
    }

    return `${nextValue.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDate = (value: string | null): string => {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '-';
    }

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes()
    ).padStart(2, '0')}`;
};

export default function RagFileBrowser({
    isOpen,
    openRequest,
    onClose,
    onAuthExpired,
}: RagFileBrowserProps) {
    const [files, setFiles] = useState<RagFileSummary[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
    const [detail, setDetail] = useState<RagFileDetail | null>(null);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        let cancelled = false;
        setLoadingList(true);
        setErrorMessage('');

        fetchRagFiles()
            .then((nextFiles) => {
                if (cancelled) {
                    return;
                }

                setFiles(nextFiles);
                const requestedFile = openRequest?.fileId
                    ? nextFiles.find((file) => file.id === openRequest.fileId)
                    : null;
                setSelectedFileId(requestedFile?.id ?? nextFiles[0]?.id ?? null);
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return;
                }

                if (error instanceof ApiAuthError) {
                    onAuthExpired();
                    return;
                }

                setErrorMessage(error instanceof Error ? error.message : '文件列表加载失败');
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingList(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, onAuthExpired, openRequest]);

    useEffect(() => {
        if (!isOpen || selectedFileId === null) {
            setDetail(null);
            return;
        }

        let cancelled = false;
        const chunkIndex =
            openRequest?.fileId === selectedFileId ? openRequest.chunkIndex ?? null : null;
        setLoadingDetail(true);
        setErrorMessage('');

        fetchRagFile(selectedFileId, chunkIndex)
            .then((nextDetail) => {
                if (!cancelled) {
                    setDetail(nextDetail);
                }
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return;
                }

                if (error instanceof ApiAuthError) {
                    onAuthExpired();
                    return;
                }

                setErrorMessage(error instanceof Error ? error.message : '文件加载失败');
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingDetail(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, onAuthExpired, openRequest, selectedFileId]);

    const activeSnippet = useMemo(() => {
        if (!detail) {
            return '';
        }

        return (
            detail.snippet
            || (openRequest?.fileId === detail.id ? openRequest.snippet : '')
            || ''
        ).trim();
    }, [detail, openRequest]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex bg-black/35 p-3 backdrop-blur-sm sm:p-6"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="mx-auto flex min-h-0 w-full max-w-6xl overflow-hidden rounded-lg border border-white/50 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111827]"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <aside className="hidden w-72 shrink-0 border-r border-gray-200 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03] md:flex md:flex-col">
                    <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4 dark:border-white/10">
                        <div className="flex items-center gap-2 font-semibold text-gray-950 dark:text-white">
                            <File01Icon size={18} />
                            文件
                        </div>
                        <button
                            type="button"
                            onClick={() => void fetchRagFiles().then(setFiles)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                            title="刷新"
                        >
                            <Refresh01Icon size={16} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {loadingList ? (
                            <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                                <Refresh01Icon size={15} className="animate-spin" />
                                加载中
                            </div>
                        ) : files.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
                                暂无文件
                            </div>
                        ) : (
                            files.map((file) => (
                                <button
                                    key={file.id}
                                    type="button"
                                    onClick={() => setSelectedFileId(file.id)}
                                    className={`mb-1 flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                                        selectedFileId === file.id
                                            ? 'bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white'
                                            : 'text-gray-700 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                                    }`}
                                >
                                    <File01Icon size={16} className="mt-0.5 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">
                                            {file.name}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                                            {formatFileSize(file.size)} · {file.chunkCount} 片段
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                <main className="flex min-w-0 flex-1 flex-col">
                    <header className="flex min-h-14 items-center gap-3 border-b border-gray-200 px-4 dark:border-white/10">
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-gray-950 dark:text-white">
                                {detail?.name ?? '文件'}
                            </div>
                            {detail && (
                                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {formatFileSize(detail.size)} · {formatDate(detail.modifiedAt)} · {detail.sha256.slice(0, 12)}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                            title="关闭"
                        >
                            <Cancel01Icon size={18} />
                        </button>
                    </header>

                    {errorMessage && (
                        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                            {errorMessage}
                        </div>
                    )}

                    {activeSnippet && (
                        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-amber-700 dark:text-amber-200">
                                <Search01Icon size={14} />
                                相关片段
                            </div>
                            <div className="line-clamp-3 leading-6">{activeSnippet}</div>
                        </div>
                    )}

                    <div className="min-h-0 flex-1 overflow-auto bg-white px-4 py-5 text-gray-800 dark:bg-[#0f172a] dark:text-gray-200 sm:px-7">
                        {loadingDetail ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                                <Refresh01Icon size={15} className="animate-spin" />
                                加载中
                            </div>
                        ) : detail?.status === 'failed' ? (
                            <div className="rounded-lg border border-red-100 bg-red-50 p-4 font-sans text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                {detail.errorMessage || '文件转换失败'}
                            </div>
                        ) : !detail?.markdown.trim() ? (
                            <div className="font-sans text-sm text-gray-500 dark:text-gray-300">
                                暂无 Markdown 内容
                            </div>
                        ) : (
                            <article className="markdown-body min-w-0 max-w-none text-[15px] leading-[1.75] dark:prose-invert [overflow-wrap:anywhere]">
                                <MarkdownContent content={detail.markdown} preserveSoftBreaks />
                            </article>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
