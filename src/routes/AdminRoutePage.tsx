import { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router';
import RoutePageFrame from './RoutePageFrame';

const AdminCenter = lazy(() => import('../components/AdminCenter'));

const ContentLoadingFallback = () => (
    <div className="flex min-h-0 flex-1 items-center justify-center text-white/75">
        正在加载页面
    </div>
);

export default function AdminRoutePage() {
    const navigate = useNavigate();

    return (
        <RoutePageFrame>
            {({ session, onAuthExpired }) => {
                if (session.user.userType !== 'admin') {
                    return (
                        <div className="flex flex-1 items-center justify-center bg-white text-gray-900 dark:bg-[#1a1a1a] dark:text-gray-100">
                            <div className="mx-6 max-w-md rounded-lg border border-gray-200 p-6 text-center shadow-sm dark:border-white/10">
                                <h1 className="text-xl font-semibold">无权访问</h1>
                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                    当前账号没有管理员权限。
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    className="mt-5 rounded-lg bg-[#c2e7ff] px-4 py-2 text-sm font-medium text-[#001d35] transition-colors hover:bg-[#b3dcf5]"
                                >
                                    返回首页
                                </button>
                            </div>
                        </div>
                    );
                }

                return (
                    <Suspense fallback={<ContentLoadingFallback />}>
                        <AdminCenter
                            onClose={() => navigate('/')}
                            onAuthExpired={onAuthExpired}
                        />
                    </Suspense>
                );
            }}
        </RoutePageFrame>
    );
}
