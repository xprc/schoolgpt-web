export const LIGHT_BG = [
    '/backgrounds/light-1.jpg',
    '/backgrounds/light-2.jpg',
    '/backgrounds/light-3.jpg',
];

export const DARK_BG = [
    '/backgrounds/dark-1.jpg',
    '/backgrounds/dark-2.jpg',
];

const LEGACY_BACKGROUND_MAP: Record<string, string> = {
    'photo-1613286451314-27ec974d8569': LIGHT_BG[0],
    'photo-1613285144194-9db4effd7219': LIGHT_BG[1],
    'photo-1613286451109-3fd4c5a2a4ed': LIGHT_BG[2],
    'photo-1775840532502-59540d252c54': DARK_BG[0],
    'photo-1774444487684-a796af0c2841': DARK_BG[1],
};

const BACKGROUND_SET = new Set([...LIGHT_BG, ...DARK_BG]);

export const normalizeBackground = (
    value: string | null,
    fallback: string
): string => {
    if (!value) {
        return fallback;
    }

    const normalizedValue = LEGACY_BACKGROUND_MAP[value] ?? value;
    return BACKGROUND_SET.has(normalizedValue) ? normalizedValue : fallback;
};
