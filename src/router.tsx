import { createBrowserRouter } from 'react-router';
import NotFoundRedirect from './routes/NotFoundRedirect';

const loadAppRoute = async () => {
    const { default: App } = await import('./components/App');
    return { Component: App };
};

const loadAdminRoute = async () => {
    const { default: AdminRoutePage } = await import('./routes/AdminRoutePage');
    return { Component: AdminRoutePage };
};

const loadSettingsRoute = async () => {
    const { default: SettingsRoutePage } = await import('./routes/SettingsRoutePage');
    return { Component: SettingsRoutePage };
};

export const router = createBrowserRouter([
    {
        path: '/',
        lazy: loadAppRoute,
    },
    {
        path: '/admin',
        lazy: loadAdminRoute,
    },
    {
        path: '/settings',
        lazy: loadSettingsRoute,
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
