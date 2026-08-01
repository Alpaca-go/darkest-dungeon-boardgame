import { useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { ROUTES } from '../../app/router';
import { checkRouteAccess, nearestLegalPath } from '../../app/route-guards';
import ErrorBoundary from '../feedback/ErrorBoundary';
import DebugPanel from '../debug/DebugPanel';
import ActFourHeader from '../darkest-dungeon/ActFourHeader';
import MentalEventOverlay from '../mental/MentalEventOverlay';
import QuirkDecisionOverlay from '../quirk/QuirkDecisionOverlay';
import DiseaseAcquisitionOverlay from '../disease/DiseaseAcquisitionOverlay';
import TrinketUseOverlay from '../trinkets/TrinketUseOverlay';
import TrinketAllocationOverlay from '../trinkets/TrinketAllocationOverlay';

/**
 * 统一外层布局：顶部资源条 + 导航 + 内容区(Outlet) + 底部说明。
 * - 挂载时按存档中的 gamePhase 恢复正确路由（刷新后 result → /result 等）；
 * - 导航链接按路由守卫结果显示可用/禁用状态；
 * - 内容区包裹 Error Boundary，未知错误不会白屏。
 */
export default function GameShell() {
  const campaign = useGameStore((s) => s.campaign);
  const location = useLocation();
  const navigate = useNavigate();
  const restoredRef = useRef(false);

  // 仅在首次挂载（刷新/直开）时执行一次路由恢复，不干扰后续导航。
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!campaign) return;
    const target = nearestLegalPath(campaign);
    if (location.pathname !== target && location.pathname === '/') {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-dd-bg text-dd-text">
      <header className="border-b border-dd-border bg-dd-panel px-5 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-wide text-dd-text">
            Darkest Dungeon · 网页原型
          </span>
          <span className="text-xs text-dd-muted">原型闭环 · Phase 5</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {campaign ? (
            <>
              <span className="text-dd-muted">
                Act <span className="text-dd-text font-semibold">{campaign.act}</span>
              </span>
              <span className="text-dd-muted">
                Gold <span className="text-dd-warn font-semibold">{campaign.gold}</span>
              </span>
              <span className="text-dd-muted">
                Light <span className="text-dd-text font-semibold">{campaign.light}</span>
              </span>
            </>
          ) : (
            <span className="text-dd-muted">无进行中的战役</span>
          )}
        </div>
      </header>

      <nav className="border-b border-dd-border bg-dd-panel2 px-3 py-2 flex flex-wrap gap-1 text-sm">
        {ROUTES.map((r) => {
          const guard = checkRouteAccess(campaign, r.path);
          if (!guard.ok) {
            // 非法路由渲染为明显的禁用态，避免误导（守卫仍在路由层兜底）。
            return (
              <span
                key={r.path}
                className="px-3 py-1 rounded text-dd-muted/40 cursor-not-allowed select-none"
                title={guard.reason}
              >
                {r.label}
              </span>
            );
          }
          return (
            <NavLink
              key={r.path}
              to={r.path}
              className={({ isActive }) =>
                [
                  'px-3 py-1 rounded transition-colors',
                  isActive
                    ? 'bg-dd-accent text-white'
                    : 'text-dd-muted hover:text-dd-text hover:bg-dd-panel',
                ].join(' ')
              }
            >
              {r.label}
            </NavLink>
          );
        })}
      </nav>

      <main className="flex-1 overflow-auto">
        <ActFourHeader />
        <ErrorBoundary module={ROUTES.find((r) => r.path === location.pathname)?.label ?? '游戏页面'}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-dd-border bg-dd-panel px-5 py-2 text-xs text-dd-muted">
        单机原型 · 本地自动存档 · 所有视觉使用纯色块占位。导航中灰色条目表示当前阶段不可进入。
      </footer>

      {/* Phase 8A：Quirk 决策浮层（z 低于精神事件浮层，保证先看结果再做取舍） */}
      <QuirkDecisionOverlay />
      {/* Phase 8B：Disease 获取结果浮层（先看到感染结果，再处理可能的 Quirk 决策） */}
      <DiseaseAcquisitionOverlay />
      {/* Phase 8C：饰品使用机会 / 待分配（含死亡转移）浮层，阻塞至玩家决策 */}
      <TrinketUseOverlay />
      <TrinketAllocationOverlay />
      <MentalEventOverlay />
      <DebugPanel />
    </div>
  );
}
