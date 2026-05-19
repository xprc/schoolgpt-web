import { Chat01Icon } from 'hugeicons-react';

type ChatItemProps = {
    text: string;
    active?: boolean;
    disabled?: boolean;
};

export default function ChatItem({ text, active, disabled }: ChatItemProps) {
    return (
        <div
            className={`group flex items-center px-4 py-1.5 rounded-r-full cursor-pointer transition-colors relative ${
                active
                    ? 'bg-white/20 text-white font-medium'
                    : disabled
                        ? 'text-white/40 pointer-events-none'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
        >
            <Chat01Icon
                size={16}
                className={`shrink-0 mr-3 ${
                    active ? 'text-white' : disabled ? 'text-white/40' : 'text-white/70'
                }`}
            />
            <span className="text-sm truncate flex-1 pr-2">{text}</span>
        </div>
    );
}
