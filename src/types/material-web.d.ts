import type { HTMLAttributes, Key } from 'react';

type MaterialElementProps = HTMLAttributes<HTMLElement> & {
    disabled?: boolean;
    href?: string;
    indeterminate?: boolean;
    key?: Key | null;
    label?: string;
    maxLength?: number;
    menuPositioning?: 'absolute' | 'fixed' | 'popover';
    placeholder?: string;
    required?: boolean;
    rows?: number;
    selected?: boolean;
    supportingText?: string;
    type?: string;
    value?: string;
};

type MaterialSelectOptionProps = MaterialElementProps & {
    headline?: string;
};

type MaterialTabsProps = MaterialElementProps & {
    activeTabIndex?: number;
    autoActivate?: boolean;
};

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'md-circular-progress': MaterialElementProps;
            'md-filled-button': MaterialElementProps;
            'md-filled-tonal-button': MaterialElementProps;
            'md-icon-button': MaterialElementProps;
            'md-outlined-button': MaterialElementProps;
            'md-outlined-select': MaterialElementProps;
            'md-outlined-text-field': MaterialElementProps;
            'md-primary-tab': MaterialElementProps;
            'md-select-option': MaterialSelectOptionProps;
            'md-switch': MaterialElementProps;
            'md-tabs': MaterialTabsProps;
            'md-text-button': MaterialElementProps;
        }
    }
}
