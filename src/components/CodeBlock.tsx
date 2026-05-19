import type { ComponentPropsWithoutRef } from 'react';

type CodeBlockProps = ComponentPropsWithoutRef<'code'> & {
    inline?: boolean;
    node?: unknown;
};

export default function CodeBlock({
    inline,
    className,
    children,
    node,
    ...props
}: CodeBlockProps) {
    void node;

    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';
    const code = String(children).replace(/\n$/, '');

    if (!inline && lang) {
        return (
            <div className="bg-[#1E1E1E] text-gray-300 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm">
                <pre>
                    <code className={className} {...props}>{code}</code>
                </pre>
            </div>
        );
    }

    return (
        <code
            className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-[#5b6ef5] dark:text-blue-400"
            {...props}
        >
            {children}
        </code>
    );
}
