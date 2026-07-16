import 'katex/dist/katex.min.css';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import CodeBlock from './CodeBlock';
import type { SearchSource } from '../types';

type MarkdownContentProps = {
    content: string;
    citationSources?: SearchSource[];
};

const normalizeLatexDelimiters = (content: string) =>
    content
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$${math}$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);

const getTextContent = (children: ReactNode): string => {
    if (typeof children === 'string' || typeof children === 'number') {
        return String(children);
    }

    if (Array.isArray(children)) {
        return children.map(getTextContent).join('');
    }

    return '';
};

const normalizeUrl = (value: string | undefined): string => {
    return String(value || '').trim();
};

const sourceLabel = (source: SearchSource, fallback: string): string => {
    return source.host || source.title || fallback;
};

const findCitationSource = (
    href: string | undefined,
    label: string,
    sources: SearchSource[]
): SearchSource | null => {
    if (!/^\d+$/.test(label.trim())) {
        return null;
    }

    const index = Number(label.trim());
    const normalizedHref = normalizeUrl(href);
    return sources.find((source) => {
        return source.index === index && (
            !normalizedHref || normalizeUrl(source.url) === normalizedHref
        );
    }) ?? null;
};

type MarkdownLinkProps = ComponentPropsWithoutRef<'a'> & {
    citationSources: SearchSource[];
    sourceFallbackLabel: (source: SearchSource) => string;
};

const MarkdownLink = ({
    href,
    children,
    citationSources,
    sourceFallbackLabel,
    ...props
}: MarkdownLinkProps) => {
    const isExternal = typeof href === 'string' && /^https?:\/\//i.test(href);
    const label = getTextContent(children);
    const citationSource = findCitationSource(href, label, citationSources);

    if (citationSource) {
        return (
            <a
                {...props}
                href={href}
                target={isExternal ? '_blank' : props.target}
                rel={isExternal ? 'noopener noreferrer' : props.rel}
                className="markdown-citation-link"
                title={citationSource.title}
            >
                <span className="markdown-citation-index">
                    {citationSource.index}
                </span>
                <span className="markdown-citation-label">
                    {sourceLabel(citationSource, sourceFallbackLabel(citationSource))}
                </span>
            </a>
        );
    }

    return (
        <a
            {...props}
            href={href}
            target={isExternal ? '_blank' : props.target}
            rel={isExternal ? 'noopener noreferrer' : props.rel}
        >
            {children}
        </a>
    );
};

export default function MarkdownContent({
    content,
    citationSources = [],
}: MarkdownContentProps) {
    const { t } = useTranslation();

    return (
        <ReactMarkdown
            components={{
                a: (props) => (
                    <MarkdownLink
                        {...props}
                        citationSources={citationSources}
                        sourceFallbackLabel={(source) =>
                            t('sources.fallback', { index: source.index })}
                    />
                ),
                code: CodeBlock,
            }}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
        >
            {normalizeLatexDelimiters(content)}
        </ReactMarkdown>
    );
}
