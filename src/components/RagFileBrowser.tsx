import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import {
    ArrowDown01Icon,
    ArrowUp01Icon,
    Cancel01Icon,
    File01Icon,
    Refresh01Icon,
    Search01Icon,
} from 'hugeicons-react';
import { ApiAuthError } from '../utils/apiChat';
import {
    fetchRagFile,
    fetchRagFilePreview,
    fetchRagFiles,
    type RagFileDetail,
    type RagFileSummary,
} from '../utils/apiRagFiles';
import { renderFileTypeIcon } from '../utils/fileTypeIcons';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type RagFileOpenRequest = {
    fileId?: number;
    chunkIndex?: number | null;
    pageNumber?: number | null;
    snippet?: string;
    nonce: number;
};

type RagFileBrowserProps = {
    isOpen: boolean;
    openRequest: RagFileOpenRequest | null;
    onClose: () => void;
    onAuthExpired: () => void;
};

const PDF_BASE_SCALE = 1.3;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.2;
const PAGES_AROUND_VIEWPORT = 2;
const DEFAULT_PAGE_WIDTH = 794;
const DEFAULT_PAGE_HEIGHT = 1123;

type PageRenderStatus = 'idle' | 'rendering' | 'rendered' | 'error';

type PageRenderInfo = {
    status: PageRenderStatus;
    width: number;
    height: number;
    error?: string;
};

type ScrollTarget = {
    page: number;
    nonce: number;
};

const clampNumber = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max);
};

const createPageRange = (centerPage: number, pageCount: number): { start: number; end: number } => {
    if (pageCount <= 0) {
        return { start: 1, end: 1 };
    }

    const safeCenterPage = clampNumber(centerPage, 1, pageCount);
    return {
        start: Math.max(1, safeCenterPage - PAGES_AROUND_VIEWPORT),
        end: Math.min(pageCount, safeCenterPage + PAGES_AROUND_VIEWPORT),
    };
};

const isRenderCancelled = (error: unknown): boolean => {
    return error instanceof Error && error.name === 'RenderingCancelledException';
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
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
    const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());
    const renderedPagesRef = useRef<Record<number, PageRenderInfo>>({});
    const renderGenerationRef = useRef(0);
    const scrollFrameRef = useRef<number | null>(null);
    const scrollTargetNonceRef = useRef(0);
    const [files, setFiles] = useState<RagFileSummary[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
    const [detail, setDetail] = useState<RagFileDetail | null>(null);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [pageCount, setPageCount] = useState(0);
    const [visiblePageRange, setVisiblePageRange] = useState(() => createPageRange(1, 1));
    const [renderedPages, setRenderedPages] = useState<Record<number, PageRenderInfo>>({});
    const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
    const [zoom, setZoom] = useState(1);
    const [previewError, setPreviewError] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isMobileFileListOpen, setIsMobileFileListOpen] = useState(false);

    const cancelRenderTasks = () => {
        renderTasksRef.current.forEach((task) => {
            task.cancel();
        });
        renderTasksRef.current.clear();
    };

    const invalidateRenderTasks = () => {
        cancelRenderTasks();
        renderGenerationRef.current += 1;
    };

    const resetPageRenderState = () => {
        invalidateRenderTasks();
        renderedPagesRef.current = {};
        setRenderedPages({});
    };

    const setPageRenderInfo = (nextPageNumber: number, nextInfo: PageRenderInfo) => {
        renderedPagesRef.current = {
            ...renderedPagesRef.current,
            [nextPageNumber]: nextInfo,
        };
        setRenderedPages(renderedPagesRef.current);
    };

    const queueScrollToPage = (nextPageNumber: number, nextPageCount = pageCount) => {
        if (nextPageCount <= 0) {
            return;
        }

        const safePageNumber = clampNumber(nextPageNumber, 1, nextPageCount);
        setPageNumber(safePageNumber);
        setVisiblePageRange(createPageRange(safePageNumber, nextPageCount));
        scrollTargetNonceRef.current += 1;
        setScrollTarget({
            page: safePageNumber,
            nonce: scrollTargetNonceRef.current,
        });
    };

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

    const targetPageNumber = useMemo(() => {
        if (!detail) {
            return null;
        }

        if (typeof detail.pageNumber === 'number' && Number.isFinite(detail.pageNumber)) {
            return Math.max(1, detail.pageNumber);
        }

        if (
            openRequest?.fileId === detail.id
            && typeof openRequest.pageNumber === 'number'
            && Number.isFinite(openRequest.pageNumber)
        ) {
            return Math.max(1, openRequest.pageNumber);
        }

        return null;
    }, [detail, openRequest]);

    const detailId = detail?.id ?? null;
    const detailStatus = detail?.status ?? null;

    useEffect(() => {
        let cancelled = false;
        let loadingTask: PDFDocumentLoadingTask | null = null;

        resetPageRenderState();

        setPdfDocument(null);
        setPageCount(0);
        setPageNumber(1);
        setVisiblePageRange(createPageRange(1, 1));
        setScrollTarget(null);
        setPreviewError('');

        if (!isOpen || detailId === null || detailStatus === 'failed') {
            setLoadingPreview(false);
            return undefined;
        }

        setLoadingPreview(true);

        fetchRagFilePreview(detailId)
            .then((blob) => {
                if (cancelled) {
                    return null;
                }

                return blob.arrayBuffer();
            })
            .then((arrayBuffer) => {
                if (cancelled || !arrayBuffer) {
                    return null;
                }

                loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                return loadingTask.promise;
            })
            .then((nextDocument) => {
                if (!nextDocument) {
                    return;
                }

                if (cancelled) {
                    void nextDocument.loadingTask.destroy();
                    return;
                }

                setPdfDocument(nextDocument);
                setPageCount(nextDocument.numPages);
                queueScrollToPage(targetPageNumber ?? 1, nextDocument.numPages);
            })
            .catch((error: unknown) => {
                if (cancelled) {
                    return;
                }

                if (error instanceof ApiAuthError) {
                    onAuthExpired();
                    return;
                }

                setPreviewError(error instanceof Error ? error.message : 'PDF 预览加载失败');
            })
            .finally(() => {
                if (!cancelled) {
                    setLoadingPreview(false);
                }
            });

        return () => {
            cancelled = true;
            invalidateRenderTasks();
            if (loadingTask) {
                void loadingTask.destroy();
            }
        };
    }, [detailId, detailStatus, isOpen, onAuthExpired]);

    const pageNumbers = useMemo(() => {
        return Array.from({ length: pageCount }, (_, index) => index + 1);
    }, [pageCount]);

    const activeRenderPageNumbers = useMemo(() => {
        if (pageCount <= 0) {
            return [];
        }

        const start = clampNumber(visiblePageRange.start, 1, pageCount);
        const end = clampNumber(visiblePageRange.end, start, pageCount);
        const nextPageNumbers: number[] = [];
        for (let nextPageNumber = start; nextPageNumber <= end; nextPageNumber += 1) {
            nextPageNumbers.push(nextPageNumber);
        }

        return nextPageNumbers;
    }, [pageCount, visiblePageRange]);

    const activeRenderPageSet = useMemo(() => {
        return new Set(activeRenderPageNumbers);
    }, [activeRenderPageNumbers]);

    const isRenderingVisiblePage = activeRenderPageNumbers.some((nextPageNumber) => {
        return renderedPages[nextPageNumber]?.status === 'rendering';
    });

    const updateVisiblePagesFromScroll = () => {
        const container = scrollContainerRef.current;
        if (!container || pageCount <= 0) {
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const viewportCenter = containerRect.top + containerRect.height / 2;
        let nextPageNumber = pageNumber;
        let largestVisibleHeight = -1;
        let closestDistance = Number.POSITIVE_INFINITY;

        pageRefs.current.forEach((pageElement, candidatePageNumber) => {
            const pageRect = pageElement.getBoundingClientRect();
            const visibleHeight = Math.max(
                0,
                Math.min(pageRect.bottom, containerRect.bottom) - Math.max(pageRect.top, containerRect.top)
            );
            const pageCenter = pageRect.top + pageRect.height / 2;
            const distance = Math.abs(pageCenter - viewportCenter);

            if (
                visibleHeight > largestVisibleHeight
                || (visibleHeight === largestVisibleHeight && distance < closestDistance)
            ) {
                largestVisibleHeight = visibleHeight;
                closestDistance = distance;
                nextPageNumber = candidatePageNumber;
            }
        });

        const safePageNumber = clampNumber(nextPageNumber, 1, pageCount);
        setPageNumber((currentPageNumber) => (
            currentPageNumber === safePageNumber ? currentPageNumber : safePageNumber
        ));
        setVisiblePageRange((currentRange) => {
            const nextRange = createPageRange(safePageNumber, pageCount);
            if (currentRange.start === nextRange.start && currentRange.end === nextRange.end) {
                return currentRange;
            }

            return nextRange;
        });
    };

    const handlePreviewScroll = () => {
        if (scrollFrameRef.current !== null) {
            return;
        }

        scrollFrameRef.current = window.requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            updateVisiblePagesFromScroll();
        });
    };

    const setPageElement = (nextPageNumber: number, element: HTMLElement | null) => {
        if (element) {
            pageRefs.current.set(nextPageNumber, element);
            return;
        }

        pageRefs.current.delete(nextPageNumber);
    };

    const setCanvasElement = (nextPageNumber: number, element: HTMLCanvasElement | null) => {
        if (element) {
            canvasRefs.current.set(nextPageNumber, element);
            return;
        }

        canvasRefs.current.delete(nextPageNumber);
    };

    useEffect(() => {
        if (!pdfDocument || !targetPageNumber || pageCount <= 0) {
            return;
        }

        queueScrollToPage(targetPageNumber, pageCount);
    }, [pageCount, pdfDocument, targetPageNumber, openRequest?.nonce]);

    useEffect(() => {
        if (!scrollTarget || pageCount <= 0) {
            return undefined;
        }

        const targetElement = pageRefs.current.get(scrollTarget.page);
        if (!targetElement) {
            return undefined;
        }

        const frameId = window.requestAnimationFrame(() => {
            targetElement.scrollIntoView({
                block: 'start',
                behavior: 'smooth',
            });
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [pageCount, pdfDocument, scrollTarget, zoom]);

    useEffect(() => {
        if (!pdfDocument || pageCount <= 0) {
            return;
        }

        resetPageRenderState();
    }, [pdfDocument, zoom]);

    useEffect(() => {
        if (!pdfDocument || pageCount <= 0) {
            return;
        }

        const activePages = new Set(activeRenderPageNumbers);
        renderTasksRef.current.forEach((task, taskPageNumber) => {
            if (!activePages.has(taskPageNumber)) {
                task.cancel();
                renderTasksRef.current.delete(taskPageNumber);
            }
        });

        let nextRenderedPages = renderedPagesRef.current;
        let hasChangedRenderedPages = false;
        Object.entries(nextRenderedPages).forEach(([pageKey, pageInfo]) => {
            const candidatePageNumber = Number(pageKey);
            if (activePages.has(candidatePageNumber) || pageInfo.status === 'idle') {
                return;
            }

            if (!hasChangedRenderedPages) {
                nextRenderedPages = { ...nextRenderedPages };
                hasChangedRenderedPages = true;
            }

            nextRenderedPages[candidatePageNumber] = {
                ...pageInfo,
                status: 'idle',
                error: undefined,
            };
        });

        if (hasChangedRenderedPages) {
            renderedPagesRef.current = nextRenderedPages;
            setRenderedPages(nextRenderedPages);
        }

        const renderGeneration = renderGenerationRef.current;
        activeRenderPageNumbers.forEach((candidatePageNumber) => {
            const currentPageInfo = renderedPagesRef.current[candidatePageNumber];
            if (currentPageInfo?.status === 'rendering' || currentPageInfo?.status === 'rendered') {
                return;
            }

            const canvas = canvasRefs.current.get(candidatePageNumber);
            if (!canvas) {
                return;
            }

            const fallbackWidth = currentPageInfo?.width ?? DEFAULT_PAGE_WIDTH * zoom;
            const fallbackHeight = currentPageInfo?.height ?? DEFAULT_PAGE_HEIGHT * zoom;
            setPageRenderInfo(candidatePageNumber, {
                status: 'rendering',
                width: fallbackWidth,
                height: fallbackHeight,
            });

            let currentRenderTask: RenderTask | null = null;
            pdfDocument
                .getPage(candidatePageNumber)
                .then((page) => {
                    if (
                        renderGenerationRef.current !== renderGeneration
                        || canvasRefs.current.get(candidatePageNumber) !== canvas
                    ) {
                        return null;
                    }

                    const viewport = page.getViewport({ scale: PDF_BASE_SCALE * zoom });
                    const pixelRatio = window.devicePixelRatio || 1;
                    canvas.width = Math.floor(viewport.width * pixelRatio);
                    canvas.height = Math.floor(viewport.height * pixelRatio);
                    canvas.style.width = `${Math.floor(viewport.width)}px`;
                    canvas.style.height = `${Math.floor(viewport.height)}px`;

                    setPageRenderInfo(candidatePageNumber, {
                        status: 'rendering',
                        width: Math.floor(viewport.width),
                        height: Math.floor(viewport.height),
                    });

                    const nextRenderTask = page.render({
                        canvas,
                        viewport,
                        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
                        background: 'rgb(255, 255, 255)',
                    });
                    currentRenderTask = nextRenderTask;
                    renderTasksRef.current.set(candidatePageNumber, nextRenderTask);
                    return nextRenderTask.promise.then(() => ({
                        height: Math.floor(viewport.height),
                        renderTask: nextRenderTask,
                        width: Math.floor(viewport.width),
                    }));
                })
                .then((result) => {
                    if (!result || renderGenerationRef.current !== renderGeneration) {
                        return;
                    }

                    if (renderTasksRef.current.get(candidatePageNumber) === result.renderTask) {
                        renderTasksRef.current.delete(candidatePageNumber);
                    }

                    setPageRenderInfo(candidatePageNumber, {
                        status: 'rendered',
                        width: result.width,
                        height: result.height,
                    });
                })
                .catch((error: unknown) => {
                    if (currentRenderTask && renderTasksRef.current.get(candidatePageNumber) === currentRenderTask) {
                        renderTasksRef.current.delete(candidatePageNumber);
                    }

                    if (isRenderCancelled(error) || renderGenerationRef.current !== renderGeneration) {
                        return;
                    }

                    setPageRenderInfo(candidatePageNumber, {
                        status: 'error',
                        width: fallbackWidth,
                        height: fallbackHeight,
                        error: '页面渲染失败',
                    });
                });
        });
    }, [activeRenderPageNumbers, pageCount, pdfDocument, zoom]);

    useEffect(() => {
        return () => {
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
                scrollFrameRef.current = null;
            }

            invalidateRenderTasks();
        };
    }, []);

    const goToPreviousPage = () => {
        queueScrollToPage(pageNumber - 1, pageCount);
    };

    const goToNextPage = () => {
        queueScrollToPage(pageNumber + 1, pageCount);
    };

    const zoomOut = () => {
        setZoom((current) => clampNumber(Number((current - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
        queueScrollToPage(pageNumber, pageCount);
    };

    const zoomIn = () => {
        setZoom((current) => clampNumber(Number((current + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
        queueScrollToPage(pageNumber, pageCount);
    };

    const resetZoom = () => {
        setZoom(1);
        queueScrollToPage(pageNumber, pageCount);
    };

    const selectFile = (fileId: number) => {
        setSelectedFileId(fileId);
        setIsMobileFileListOpen(false);
    };

    const refreshFiles = () => {
        void fetchRagFiles().then(setFiles);
    };

    const fileListContent = loadingList ? (
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
                onClick={() => selectFile(file.id)}
                className={`mb-1 flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    selectedFileId === file.id
                        ? 'bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white'
                        : 'text-gray-700 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                }`}
            >
                {renderFileTypeIcon(file.name, {
                    className: 'mt-0.5 shrink-0',
                })}
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
    );

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
                            onClick={refreshFiles}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                            title="刷新"
                        >
                            <Refresh01Icon size={16} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {fileListContent}
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

                    <div className="border-b border-gray-200 bg-gray-50/80 dark:border-white/10 dark:bg-white/[0.03] md:hidden">
                        <div className="flex items-center gap-2 px-3 py-2">
                            <button
                                type="button"
                                onClick={() => setIsMobileFileListOpen((current) => !current)}
                                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-gray-800 transition-colors hover:bg-white/70 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                                aria-expanded={isMobileFileListOpen}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <File01Icon size={17} className="shrink-0" />
                                    <span className="truncate text-sm font-medium">
                                        文件列表
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    {files.length} 个
                                    {isMobileFileListOpen ? (
                                        <ArrowUp01Icon size={16} />
                                    ) : (
                                        <ArrowDown01Icon size={16} />
                                    )}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={refreshFiles}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                                title="刷新"
                                aria-label="刷新文件列表"
                            >
                                <Refresh01Icon size={16} />
                            </button>
                        </div>
                        {isMobileFileListOpen && (
                            <div className="max-h-64 overflow-y-auto border-t border-gray-200 p-2 dark:border-white/10">
                                {fileListContent}
                            </div>
                        )}
                    </div>

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
                                {targetPageNumber && (
                                    <span className="font-sans font-medium normal-case">
                                        第 {targetPageNumber} 页
                                    </span>
                                )}
                            </div>
                            <div className="line-clamp-3 leading-6">{activeSnippet}</div>
                        </div>
                    )}

                    <div className="min-h-0 flex-1 bg-white text-gray-800 dark:bg-[#0f172a] dark:text-gray-200">
                        {loadingDetail ? (
                            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                                <Refresh01Icon size={15} className="animate-spin" />
                                加载中
                            </div>
                        ) : detail?.status === 'failed' ? (
                            <div className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 font-sans text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                {detail.errorMessage || '文件处理失败'}
                            </div>
                        ) : loadingPreview ? (
                            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                                <Refresh01Icon size={15} className="animate-spin" />
                                预览加载中
                            </div>
                        ) : previewError ? (
                            <div className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 font-sans text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                {previewError}
                            </div>
                        ) : !pdfDocument || pageCount <= 0 ? (
                            <div className="flex h-full items-center justify-center font-sans text-sm text-gray-500 dark:text-gray-300">
                                PDF 预览尚未生成
                            </div>
                        ) : (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={goToPreviousPage}
                                            disabled={pageNumber <= 1}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label="上一页"
                                            title="上一页"
                                        >
                                            &lt;
                                        </button>
                                        <div className="min-w-24 text-center text-sm text-gray-700 dark:text-gray-200">
                                            {pageNumber} / {pageCount}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={goToNextPage}
                                            disabled={pageNumber >= pageCount}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label="下一页"
                                            title="下一页"
                                        >
                                            &gt;
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={zoomOut}
                                            disabled={zoom <= MIN_ZOOM}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label="缩小"
                                            title="缩小"
                                        >
                                            -
                                        </button>
                                        <button
                                            type="button"
                                            onClick={resetZoom}
                                            className="h-8 min-w-14 rounded-lg px-2 text-sm text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
                                            title="重置缩放"
                                        >
                                            {Math.round(zoom * 100)}%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={zoomIn}
                                            disabled={zoom >= MAX_ZOOM}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label="放大"
                                            title="放大"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div
                                    ref={scrollContainerRef}
                                    onScroll={handlePreviewScroll}
                                    className="relative min-h-0 flex-1 overflow-auto bg-gray-100 px-3 py-4 dark:bg-[#0b1120]"
                                >
                                    {isRenderingVisiblePage && (
                                        <div className="pointer-events-none sticky top-3 z-10 mx-auto flex w-fit items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm text-gray-500 shadow-sm dark:bg-[#111827]/90 dark:text-gray-300">
                                            <Refresh01Icon size={15} className="animate-spin" />
                                            渲染中
                                        </div>
                                    )}
                                    <div className="mx-auto flex w-fit min-w-full flex-col items-center gap-4">
                                        {pageNumbers.map((currentPageNumber) => {
                                            const pageInfo = renderedPages[currentPageNumber];
                                            const shouldRenderPage = activeRenderPageSet.has(currentPageNumber);
                                            const pageStatus = pageInfo?.status ?? 'idle';
                                            const pageWidth = Math.round(pageInfo?.width ?? DEFAULT_PAGE_WIDTH * zoom);
                                            const pageHeight = Math.round(pageInfo?.height ?? DEFAULT_PAGE_HEIGHT * zoom);

                                            return (
                                                <section
                                                    key={currentPageNumber}
                                                    ref={(element) => setPageElement(currentPageNumber, element)}
                                                    className="flex w-fit flex-col items-center gap-2"
                                                    data-page-number={currentPageNumber}
                                                >
                                                    <div
                                                        className={`text-xs ${
                                                            pageNumber === currentPageNumber
                                                                ? 'font-semibold text-blue-600 dark:text-blue-300'
                                                                : 'text-gray-500 dark:text-gray-400'
                                                        }`}
                                                    >
                                                        第 {currentPageNumber} 页
                                                    </div>
                                                    <div
                                                        className="relative overflow-hidden rounded-sm bg-white shadow"
                                                        style={{
                                                            height: pageHeight,
                                                            width: pageWidth,
                                                        }}
                                                    >
                                                        {shouldRenderPage && (
                                                            <canvas
                                                                ref={(element) => setCanvasElement(currentPageNumber, element)}
                                                                className={`block max-w-none ${
                                                                    pageStatus === 'rendered' ? '' : 'opacity-0'
                                                                }`}
                                                                aria-label={`${detail?.name ?? '文件预览'} 第 ${currentPageNumber} 页`}
                                                            />
                                                        )}
                                                        {shouldRenderPage && pageStatus !== 'rendered' && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-white text-sm text-gray-500 dark:text-gray-500">
                                                                {pageStatus === 'error' ? (
                                                                    pageInfo?.error ?? '页面渲染失败'
                                                                ) : (
                                                                    <span className="flex items-center gap-2">
                                                                        <Refresh01Icon size={15} className="animate-spin" />
                                                                        渲染中
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
