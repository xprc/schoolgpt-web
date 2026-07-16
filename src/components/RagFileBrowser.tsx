import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
    ArrowDown01Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    ArrowUp01Icon,
    Cancel01Icon,
    File01Icon,
    Refresh01Icon,
    Search01Icon,
    ZoomInAreaIcon,
    ZoomOutAreaIcon,
} from 'hugeicons-react';
import { ApiAuthError } from '../api/chat';
import {
    fetchRagFile,
    fetchRagFilePreview,
    fetchRagFiles,
    type RagFileDetail,
    type RagFileSummary,
} from '../api/ragFiles';
import { renderFileTypeIcon } from '../utils/fileTypeIcons';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
const DEFAULT_PAGE_WIDTH = 794;
const DEFAULT_PAGE_HEIGHT = 1123;

type ScrollTarget = {
    page: number;
    nonce: number;
};

const clampNumber = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max);
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
    const { t } = useTranslation();
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
    const scrollFrameRef = useRef<number | null>(null);
    const scrollTargetNonceRef = useRef(0);
    const [files, setFiles] = useState<RagFileSummary[]>([]);
    const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
    const [detail, setDetail] = useState<RagFileDetail | null>(null);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [pageCount, setPageCount] = useState(0);
    const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
    const [zoom, setZoom] = useState(1);
    const [previewError, setPreviewError] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isMobileFileListOpen, setIsMobileFileListOpen] = useState(false);

    const pdfFile = useMemo(() => {
        if (!pdfData) {
            return null;
        }

        return { data: pdfData };
    }, [pdfData]);

    const queueScrollToPage = useCallback((nextPageNumber: number, nextPageCount = pageCount) => {
        if (nextPageCount <= 0) {
            return;
        }

        const safePageNumber = clampNumber(nextPageNumber, 1, nextPageCount);
        setPageNumber(safePageNumber);
        scrollTargetNonceRef.current += 1;
        setScrollTarget({
            page: safePageNumber,
            nonce: scrollTargetNonceRef.current,
        });
    }, [pageCount]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        let cancelled = false;
        const timerId = window.setTimeout(() => {
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

                    setErrorMessage(error instanceof Error ? error.message : t('ragFiles.loadingListFailed'));
                })
                .finally(() => {
                    if (!cancelled) {
                        setLoadingList(false);
                    }
                });
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
        };
    }, [isOpen, onAuthExpired, openRequest, t]);

    useEffect(() => {
        let cancelled = false;
        const timerId = window.setTimeout(() => {
            if (!isOpen || selectedFileId === null) {
                setDetail(null);
                return;
            }

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

                    setErrorMessage(error instanceof Error ? error.message : t('ragFiles.loadingFileFailed'));
                })
                .finally(() => {
                    if (!cancelled) {
                        setLoadingDetail(false);
                    }
                });
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
        };
    }, [isOpen, onAuthExpired, openRequest, selectedFileId, t]);

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
        const timerId = window.setTimeout(() => {
            setPdfData(null);
            setPageCount(0);
            setPageNumber(1);
            setScrollTarget(null);
            setPreviewError('');

            if (!isOpen || detailId === null || detailStatus === 'failed') {
                setLoadingPreview(false);
                return;
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
                        return;
                    }

                    setPdfData(new Uint8Array(arrayBuffer));
                })
                .catch((error: unknown) => {
                    if (cancelled) {
                        return;
                    }

                    if (error instanceof ApiAuthError) {
                        onAuthExpired();
                        return;
                    }

                    setPreviewError(error instanceof Error ? error.message : t('ragFiles.previewLoadFailed'));
                })
                .finally(() => {
                    if (!cancelled) {
                        setLoadingPreview(false);
                    }
                });
        }, 0);

        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
        };
    }, [detailId, detailStatus, isOpen, onAuthExpired, t]);

    const pageNumbers = useMemo(() => {
        return Array.from({ length: pageCount }, (_, index) => index + 1);
    }, [pageCount]);

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

    useEffect(() => {
        if (!targetPageNumber || pageCount <= 0) {
            return;
        }

        const timerId = window.setTimeout(() => {
            queueScrollToPage(targetPageNumber, pageCount);
        }, 0);

        return () => {
            window.clearTimeout(timerId);
        };
    }, [pageCount, queueScrollToPage, targetPageNumber, openRequest?.nonce]);

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
    }, [pageCount, scrollTarget, zoom]);

    useEffect(() => {
        return () => {
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
                scrollFrameRef.current = null;
            }
        };
    }, []);

    const handleDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setPreviewError('');
        setPageCount(numPages);
        queueScrollToPage(targetPageNumber ?? 1, numPages);
    };

    const handleDocumentLoadError = (error: Error) => {
        setPageCount(0);
        setPreviewError(error.message || t('ragFiles.previewLoadFailed'));
    };

    const renderPdfPageState = (message: string, showSpinner = false): ReactNode => (
        <div
            className="flex items-center justify-center bg-white text-sm text-gray-500 dark:text-gray-500"
            style={{
                height: Math.round(DEFAULT_PAGE_HEIGHT * zoom),
                width: Math.round(DEFAULT_PAGE_WIDTH * zoom),
            }}
        >
            {showSpinner ? (
                <span className="flex items-center gap-2">
                    <Refresh01Icon size={15} className="animate-spin" />
                    {message}
                </span>
            ) : (
                message
            )}
        </div>
    );

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
            {t('loading')}
        </div>
    ) : files.length === 0 ? (
        <div className="px-3 py-3 text-sm text-gray-500 dark:text-gray-300">
            {t('ragFiles.empty')}
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
                        {formatFileSize(file.size)} · {t('ragFiles.chunkCount', { count: file.chunkCount })}
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
                            {t('ragFiles.title')}
                        </div>
                        <button
                            type="button"
                            onClick={refreshFiles}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
                            title={t('refresh')}
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
                                {detail?.name ?? t('ragFiles.fileFallback')}
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
                            title={t('close')}
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
                                        {t('ragFiles.fileList')}
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    {t('ragFiles.fileCount', { count: files.length })}
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
                                title={t('refresh')}
                                aria-label={t('refresh')}
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
                                {t('ragFiles.relatedSnippet')}
                                {targetPageNumber && (
                                    <span className="font-sans font-medium normal-case">
                                        {t('ragFiles.pageLabel', { page: targetPageNumber })}
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
                                {t('loading')}
                            </div>
                        ) : detail?.status === 'failed' ? (
                            <div className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 font-sans text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                {detail.errorMessage || t('ragFiles.processingFailed')}
                            </div>
                        ) : loadingPreview ? (
                            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                                <Refresh01Icon size={15} className="animate-spin" />
                                {t('ragFiles.previewLoading')}
                            </div>
                        ) : previewError ? (
                            <div className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 font-sans text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                {previewError}
                            </div>
                        ) : !pdfFile ? (
                            <div className="flex h-full items-center justify-center font-sans text-sm text-gray-500 dark:text-gray-300">
                                {t('ragFiles.previewNotReady')}
                            </div>
                        ) : (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={goToPreviousPage}
                                            disabled={pageCount <= 0 || pageNumber <= 1}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label={t('ragFiles.previousPage')}
                                            title={t('ragFiles.previousPage')}
                                        >
                                            <ArrowLeft01Icon size={16} />
                                        </button>
                                        <div className="min-w-24 text-center text-sm text-gray-700 dark:text-gray-200">
                                            {pageCount > 0 ? `${pageNumber} / ${pageCount}` : t('loading')}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={goToNextPage}
                                            disabled={pageCount <= 0 || pageNumber >= pageCount}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label={t('ragFiles.nextPage')}
                                            title={t('ragFiles.nextPage')}
                                        >
                                            <ArrowRight01Icon size={16} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={zoomOut}
                                            disabled={zoom <= MIN_ZOOM}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label={t('ragFiles.zoomOut')}
                                            title={t('ragFiles.zoomOut')}
                                        >
                                            <ZoomOutAreaIcon size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={resetZoom}
                                            className="h-8 min-w-14 rounded-lg px-2 text-sm text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
                                            title={t('ragFiles.resetZoom')}
                                        >
                                            {Math.round(zoom * 100)}%
                                        </button>
                                        <button
                                            type="button"
                                            onClick={zoomIn}
                                            disabled={zoom >= MAX_ZOOM}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                                            aria-label={t('ragFiles.zoomIn')}
                                            title={t('ragFiles.zoomIn')}
                                        >
                                            <ZoomInAreaIcon size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div
                                    ref={scrollContainerRef}
                                    onScroll={handlePreviewScroll}
                                    className="relative min-h-0 flex-1 overflow-auto bg-gray-100 px-3 py-4 dark:bg-[#0b1120]"
                                >
                                    <Document
                                        file={pdfFile}
                                        onLoadSuccess={handleDocumentLoadSuccess}
                                        onLoadError={handleDocumentLoadError}
                                        className="mx-auto flex w-fit min-w-full flex-col items-center gap-4"
                                        loading={(
                                            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-300">
                                                <Refresh01Icon size={15} className="animate-spin" />
                                                {t('ragFiles.pdfParsing')}
                                            </div>
                                        )}
                                        error={(
                                            <div className="rounded-lg border border-red-100 bg-red-50 p-4 font-sans text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                                {t('ragFiles.previewLoadFailed')}
                                            </div>
                                        )}
                                        noData={(
                                            <div className="flex min-h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-300">
                                                {t('ragFiles.previewNotReady')}
                                            </div>
                                        )}
                                    >
                                        {pageNumbers.map((currentPageNumber) => (
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
                                                    {t('ragFiles.pageLabel', { page: currentPageNumber })}
                                                </div>
                                                <div
                                                    aria-label={t('ragFiles.previewPageLabel', {
                                                        name: detail?.name ?? t('ragFiles.fileFallback'),
                                                        page: currentPageNumber,
                                                    })}
                                                >
                                                    <Page
                                                        pageNumber={currentPageNumber}
                                                        scale={PDF_BASE_SCALE * zoom}
                                                        className="overflow-hidden rounded-sm bg-white shadow [&_canvas]:!block [&_canvas]:!max-w-none"
                                                        loading={renderPdfPageState(t('ragFiles.rendering'), true)}
                                                        error={renderPdfPageState(t('ragFiles.pageRenderFailed'))}
                                                        noData={renderPdfPageState(t('ragFiles.pageUnavailable'))}
                                                    />
                                                </div>
                                            </section>
                                        ))}
                                    </Document>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
