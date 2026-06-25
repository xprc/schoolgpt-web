import { Navigate, createBrowserRouter } from 'react-router';

const loadAppRoute = async () => {
    const { default: App } = await import('./components/App');
    return { Component: App };
};

const NotFoundRedirect = () => <Navigate to="/" replace />;

export const router = createBrowserRouter([
    {
        path: '/',
        lazy: loadAppRoute,
    },
    {
        path: '/chat/:conversationId',
        lazy: loadAppRoute,
    },
    {
        path: '*',
        Component: NotFoundRedirect,
    },
]);
