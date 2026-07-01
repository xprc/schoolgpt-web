import type { SearchSource } from './types';

export type ParsedSearchSources = {
    content: string;
    sources: SearchSource[];
};

const sourceHeadingNames = new Set([
    '来源',
    '搜索来源',
    '参考来源',
    'sources',
    'source',
]);

const sourceLinePattern =
    /^\s*(?:[-*]\s*)?(\d+)[.)]\s*\[((?:\\.|[^\]])+)]\((?:<([^>]+)>|([^)]+))\)\s*(.*)$/;

const normalizeHeading = (line: string): string => {
    return line
        .trim()
        .replace(/^#{1,6}\s*/, '')
        .replace(/^\*\*(.*)\*\*$/, '$1')
        .replace(/^__(.*)__$/, '$1')
        .replace(/[:：]$/, '')
        .trim()
        .toLowerCase();
};

const isSourceHeading = (line: string): boolean => {
    return sourceHeadingNames.has(normalizeHeading(line));
};

const cleanDescription = (value: string): string => {
    return value
        .trim()
        .replace(/^[-–—:：]\s*/, '')
        .replace(/\s+/g, ' ');
};

const cleanMarkdownText = (value: string): string => {
    return value
        .replace(/\\([\\[\]])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
};

const getHost = (url: string): string => {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.replace(/^www\./i, '');
    } catch {
        return '';
    }
};

const parseSourceLine = (line: string): SearchSource | null => {
    const match = line.match(sourceLinePattern);
    if (!match) {
        return null;
    }

    const index = Number(match[1]);
    const url = (match[3] || match[4] || '').trim();
    if (!Number.isFinite(index) || !url) {
        return null;
    }

    return {
        index,
        title: cleanMarkdownText(match[2]) || getHost(url) || `来源 ${index}`,
        url,
        description: cleanDescription(match[5] || ''),
        host: getHost(url),
    };
};

const parseSourceLines = (lines: string[]): SearchSource[] => {
    const sources: SearchSource[] = [];

    lines.forEach((line) => {
        const source = parseSourceLine(line);
        if (source) {
            sources.push(source);
            return;
        }

        const description = cleanDescription(line);
        const lastSource = sources[sources.length - 1];
        if (description && lastSource) {
            lastSource.description = lastSource.description
                ? `${lastSource.description} ${description}`
                : description;
        }
    });

    return sources;
};

export const parseSearchSourcesFromMarkdown = (
    content: string
): ParsedSearchSources => {
    const lines = content.split(/\r?\n/);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (!isSourceHeading(lines[index])) {
            continue;
        }

        const sourceLines = lines.slice(index + 1);
        const sources = parseSourceLines(sourceLines);
        if (sources.length === 0) {
            continue;
        }

        return {
            content: lines.slice(0, index).join('\n').trimEnd(),
            sources,
        };
    }

    return {
        content,
        sources: [],
    };
};
