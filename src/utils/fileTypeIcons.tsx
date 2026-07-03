import {
    Csv01Icon,
    Doc01Icon,
    DocumentCodeIcon,
    File01Icon,
    FileAudioIcon,
    FileVideoIcon,
    FileZipIcon,
    GoogleSheetIcon,
    Image01Icon,
    Pdf01Icon,
    Ppt01Icon,
    Txt01Icon,
} from 'hugeicons-react';
import { getSourceFileKind, type SourceFileKind } from './chatHelpers';

const fileKindIconClassNames: Record<SourceFileKind, string> = {
    archive: 'text-orange-500 dark:text-orange-300',
    audio: 'text-pink-500 dark:text-pink-300',
    code: 'text-violet-500 dark:text-violet-300',
    csv: 'text-amber-500 dark:text-amber-300',
    document: 'text-blue-600 dark:text-blue-300',
    file: 'text-gray-500 dark:text-gray-300',
    image: 'text-emerald-500 dark:text-emerald-300',
    pdf: 'text-red-500 dark:text-red-300',
    presentation: 'text-orange-600 dark:text-orange-300',
    spreadsheet: 'text-green-600 dark:text-green-300',
    text: 'text-sky-600 dark:text-sky-300',
    video: 'text-fuchsia-500 dark:text-fuchsia-300',
};

type FileTypeIconOptions = {
    className?: string;
    colorClassName?: string;
    size?: number;
};

const joinClassNames = (...classNames: Array<string | undefined>): string => {
    return classNames.filter(Boolean).join(' ');
};

export const renderFileTypeIcon = (
    fileName: string,
    options: FileTypeIconOptions = {}
) => {
    const fileKind = getSourceFileKind(fileName);
    const props = {
        size: options.size ?? 16,
        className: joinClassNames(
            options.className ?? 'shrink-0',
            options.colorClassName ?? fileKindIconClassNames[fileKind]
        ),
        'aria-hidden': true,
    };

    if (fileKind === 'pdf') return <Pdf01Icon {...props} />;
    if (fileKind === 'text') return <Txt01Icon {...props} />;
    if (fileKind === 'csv') return <Csv01Icon {...props} />;
    if (fileKind === 'document') return <Doc01Icon {...props} />;
    if (fileKind === 'spreadsheet') return <GoogleSheetIcon {...props} />;
    if (fileKind === 'presentation') return <Ppt01Icon {...props} />;
    if (fileKind === 'image') return <Image01Icon {...props} />;
    if (fileKind === 'archive') return <FileZipIcon {...props} />;
    if (fileKind === 'audio') return <FileAudioIcon {...props} />;
    if (fileKind === 'video') return <FileVideoIcon {...props} />;
    if (fileKind === 'code') return <DocumentCodeIcon {...props} />;

    return <File01Icon {...props} />;
};
