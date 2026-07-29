import { Outlet, NavLink } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { ROUTES } from '../../app/router';

/**
 * 统一外层布局：顶部资源条 + 开发导航 + 内容区(Outlet) + 底部说明。
 * 开发导航为 Phase 1 的临时入口，便于访问所有页面空壳。
 */
export default function GameShell() {
  const campaign = useGameStore((s) => s.campaign);

  return (
    <div className="min-h-screen flex flex-col bg-dd-bg text-dd-text">
      <header className="border-b border-dd-border bg-dd-panel px-5 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold tracking-wide text-dd-text">
            Darkest Dungeon · 网页原型
          </span>
          <span className="text-xs text-dd-muted">Phase 1 骨架</span>
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
        {ROUTES.map((r) => (
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
        ))}
      </nav>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <footer className="border-t border-dd-border bg-dd-panel px-5 py-2 text-xs text-dd-muted">
        仅首页（新建 / 继续 / 清除战役）为可用功能；其余页面为 Phase 2+ 空壳。所有视觉使用纯色块占位。
      </footer>
    </div>
  );
}
