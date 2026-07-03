import 'katex/dist/katex.min.css';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import CodeBlock from './CodeBlock';
import type { SearchSource } from '../utils/types';

type MarkdownContentProps = {
    content: string;
    citationSources?: SearchSource[];
    preserveSoftBreaks?: boolean;
};

type HastNode = {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
};

const normalizeLatexDelimiters = (content: string) =>
    content
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$${math}$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);

const htmlBreakPattern = /(<br\s*\/?>)/gi;
const softBreakPattern = /(<br\s*\/?>|\r\n|\r|\n)/gi;
const htmlBreakTokenPattern = /^<br\s*\/?>$/i;
const nonBreakingTags = new Set(['code', 'pre', 'script', 'style']);

const createBreakNode = (): HastNode => ({
    type: 'element',
    tagName: 'br',
    properties: {},
    children: [],
});

const isBreakToken = (token: string): boolean => {
    return htmlBreakTokenPattern.test(token)
        || token === '\n'
        || token === '\r'
        || token === '\r\n';
};

const splitTextWithBreaks = (value: string, breakPattern: RegExp): HastNode[] => {
    breakPattern.lastIndex = 0;
    const tokens = value.split(breakPattern);
    const nodes: HastNode[] = [];

    tokens.forEach((token) => {
        if (!token) {
            return;
        }

        if (isBreakToken(token)) {
            nodes.push(createBreakNode());
            return;
        }

        nodes.push({
            type: 'text',
            value: token,
        });
    });

    return nodes.length > 0 ? nodes : [{ type: 'text', value }];
};

const createTextBreakPlugin = (preserveSoftBreaks: boolean) => {
    const breakPattern = preserveSoftBreaks ? softBreakPattern : htmlBreakPattern;

    const visit = (node: HastNode, parentTagName = '') => {
        if (!node.children || nonBreakingTags.has(parentTagName)) {
            return;
        }

        node.children = node.children.flatMap((child) => {
            if (
                ['text', 'raw', 'html'].includes(child.type)
                && typeof child.value === 'string'
            ) {
                breakPattern.lastIndex = 0;
                if (!breakPattern.test(child.value)) {
                    breakPattern.lastIndex = 0;
                    return [child];
                }

                return splitTextWithBreaks(child.value, breakPattern);
            }

            visit(child, child.tagName || '');
            return [child];
        });
    };

    return (tree: HastNode) => visit(tree);
};

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

const sourceLabel = (source: SearchSource): string => {
    return source.host || source.title || `来源 ${source.index}`;
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
};

const MarkdownLink = ({
    href,
    children,
    citationSources,
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
                    {sourceLabel(citationSource)}
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
    preserveSoftBreaks = false,
}: MarkdownContentProps) {
    return (
        <ReactMarkdown
            components={{
                a: (props) => (
                    <MarkdownLink {...props} citationSources={citationSources} />
                ),
                code: CodeBlock,
            }}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[createTextBreakPlugin(preserveSoftBreaks), rehypeKatex]}
        >
            {normalizeLatexDelimiters(content)}
        </ReactMarkdown>
    );
}
