const gravatarBaseUrl = 'https://avatar.projectoms.com/avatar';
const fallbackHash = '0'.repeat(64);

const sha256Pattern = /^[0-9a-f]{64}$/;

const buildGravatarUrl = (hash: string, name: string, size: number): string => {
    const params = new URLSearchParams({
        s: String(size),
        d: 'retro',
        r: 'g',
    });

    const normalizedName = name.trim();
    if (normalizedName) {
        params.set('name', normalizedName);
    }

    return `${gravatarBaseUrl}/${hash}?${params.toString()}`;
};

export const getGravatarFallbackAvatarUrl = (name: string, size = 150): string => {
    return buildGravatarUrl(fallbackHash, name, size);
};

export const getGravatarAvatarUrl = (
    avatarSha256: string,
    name: string,
    size = 150
): string => {
    const normalizedHash = avatarSha256.trim().toLowerCase();
    const hash = sha256Pattern.test(normalizedHash) ? normalizedHash : fallbackHash;
    return buildGravatarUrl(hash, name, size);
};
