import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import CodeBlock from './CodeBlock';

type MarkdownContentProps = {
    content: string;
};

const normalizeLatexDelimiters = (content: string) =>
    content
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$${math}$$`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`);

export default function MarkdownContent({ content }: MarkdownContentProps) {
    return (
        <ReactMarkdown
            components={{ code: CodeBlock }}
            rehypePlugins={[rehypeKatex]}
            remarkPlugins={[remarkGfm, remarkMath]}
        >
            {normalizeLatexDelimiters(content)}
        </ReactMarkdown>
    );
}
