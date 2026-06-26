import { Navigate } from 'react-router';

export default function NotFoundRedirect() {
    return <Navigate to="/" replace />;
}
