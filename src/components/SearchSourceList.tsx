import type { SearchSource } from '../utils/types';

type SearchSourceListProps = {
    sources: SearchSource[];
};

const sourceLabel = (source: SearchSource): string => {
    return source.host || source.title || `来源 ${source.index}`;
};

export default function SearchSourceList({ sources }: SearchSourceListProps) {
    if (sources.length === 0) {
        return null;
    }

    return (
        <div className="border-t border-gray-200/70 pt-3 dark:border-white/10">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span>搜索来源</span>
                <span className="font-medium text-gray-400 dark:text-gray-500">
                    · {sources.length}
                </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {sources.map((source) => (
                    <a
                        key={`${source.index}-${source.url}`}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group min-w-0 rounded-lg border border-gray-200 bg-white/70 p-3 text-left transition-colors hover:border-[#5b6ef5]/40 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:hover:border-blue-300/40 dark:hover:bg-white/[0.09]"
                    >
                        <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-semibold text-white dark:bg-white dark:text-gray-900">
                                {source.index}
                            </span>
                            <span className="truncate">{sourceLabel(source)}</span>
                        </div>
                        <div className="mt-2 truncate text-sm font-semibold text-gray-950 group-hover:text-[#4a5ce0] dark:text-white dark:group-hover:text-blue-200">
                            {source.title}
                        </div>
                        {source.description && (
                            <div className="mt-1 max-h-10 overflow-hidden text-xs leading-5 text-gray-500 dark:text-gray-400">
                                {source.description}
                            </div>
                        )}
                    </a>
                ))}
            </div>
        </div>
    );
}
