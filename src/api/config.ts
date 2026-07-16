export const apiBaseUrl = (
    import.meta.env.VITE_SCHOOLGPT_API_BASE_URL ?? '/api'
).replace(/\/+$/, '');
