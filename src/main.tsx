import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import ErrorBoundary from './components/feedback/ErrorBoundary';
import { createSeededRandom, setRandomSource } from './game-engine/random';
import './index.css';
import { seededRuntimeSources, setRuntimeSources } from './game-engine/runtime-sources';
import { stableHash } from './audit/core-campaign/types';
if (import.meta.env.VITE_E2E_MODE === '1') setRuntimeSources(seededRuntimeSources(parseInt(stableHash('golden-normal-success-01'), 16) >>> 0));

// E2E / 调试用确定性随机源：localStorage 存在 dd-fixed-rng 时启用。
// 正常游玩不受影响；同一 seed 产生完全一致的随机序列。
try {
  const seed = window.localStorage.getItem('dd-fixed-rng');
  if (seed) setRandomSource(createSeededRandom(Number(seed) || 1));
} catch {
  // localStorage 不可用时忽略
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary module="应用根节点">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
