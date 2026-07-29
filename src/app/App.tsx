import type { ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import GameShell from '../components/layout/GameShell';
import { ROUTES } from './router';
import { checkRouteAccess } from './route-guards';
import { useGameStore } from '../store/useGameStore';

/**
 * 路由守卫：非法进入时跳转到最近的合法页面，并写入开发日志。
 * 不依赖 UI 按钮禁用，直接在路由层拦截。
 */
function RouteGuard({ path, children }: { path: string; children: ReactNode }) {
  const campaign = useGameStore((s) => s.campaign);
  const location = useLocation();
  const guard = checkRouteAccess(campaign, path);
  if (!guard.ok) {
    if (import.meta.env.DEV) {
      console.warn(`[RouteGuard] 拦截 ${location.pathname}：${guard.reason} → 跳转 ${guard.redirect}`);
    }
    return <Navigate to={guard.redirect} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GameShell />}>
        {ROUTES.map((r) => (
          <Route
            key={r.path}
            path={r.path}
            element={<RouteGuard path={r.path}>{r.element}</RouteGuard>}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
