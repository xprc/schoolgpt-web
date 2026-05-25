export const apiBaseUrl = (
    import.meta.env.VITE_SCHOOLGPT_API_BASE_URL ?? 'http://127.0.0.1:8000/api'
).replace(/\/+$/, '');
