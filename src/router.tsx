import { Navigate, createBrowserRouter } from 'react-router';

const loadAppRoute = async () => {
    const { default: App } = await import('./components/App');
    return { Component: App };
};

export const router = createBrowserRouter([
    {
        path: '/',
        lazy: loadAppRoute,
    },
    {
        path: '/settings',
        lazy: loadAppRoute,
    },
    {
        path: '/admin',
        lazy: loadAppRoute,
    },
    {
        path: '/chat/:conversationId',
        lazy: loadAppRoute,
    },
    {
        path: '/share/:conversationId',
        lazy: loadAppRoute,
    },
    {
        path: '*',
        element: <Navigate to="/" replace />,
    },
]);
