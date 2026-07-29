import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearCampaign, exportSaveString } from '../../game-engine/save';

interface Props {
  /** 出错模块名称（显示给用户）。 */
  module?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React 错误边界：捕获渲染期未知错误，避免整页白屏。
 * 提供返回首页 / 尝试恢复存档 / 导出调试信息 / 清除存档。
 * 完整堆栈只输出到控制台，不展示给普通用户。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 开发环境输出完整堆栈，便于定位。
    console.error('[ErrorBoundary]', this.props.module ?? 'app', error, info.componentStack);
  }

  private exportDebugInfo = (): void => {
    const payload = {
      module: this.props.module ?? 'app',
      message: this.state.error?.message ?? 'unknown',
      stack: this.state.error?.stack ?? null,
      at: new Date().toISOString(),
      save: (() => {
        try {
          const s = exportSaveString();
          return s ? JSON.parse(s) : null;
        } catch {
          return '存档不可读';
        }
      })(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dd-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="rounded-lg border border-red-500 bg-dd-panel p-6" data-testid="error-boundary">
          <p className="text-red-400 font-bold text-lg mb-1">页面出现未知错误</p>
          <p className="text-dd-muted text-sm mb-1">
            出错模块：<span className="text-dd-text">{this.props.module ?? '游戏页面'}</span>
          </p>
          <p className="text-dd-muted text-sm mb-4 break-all">
            错误信息：{this.state.error.message || '未知错误'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                window.location.href = '/';
              }}
              className="px-3 py-1.5 rounded bg-dd-accent text-white text-sm hover:bg-dd-accent2"
            >
              返回首页
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded bg-dd-panel2 border border-dd-border text-dd-text text-sm hover:bg-dd-panel"
            >
              尝试恢复存档
            </button>
            <button
              onClick={this.exportDebugInfo}
              className="px-3 py-1.5 rounded bg-dd-panel2 border border-dd-border text-dd-muted text-sm hover:bg-dd-panel"
            >
              导出调试信息
            </button>
            <button
              onClick={() => {
                clearCampaign();
                window.location.href = '/';
              }}
              className="px-3 py-1.5 rounded border border-red-500/60 text-red-400 text-sm hover:bg-red-500/10"
            >
              清除存档
            </button>
          </div>
        </div>
      </div>
    );
  }
}
