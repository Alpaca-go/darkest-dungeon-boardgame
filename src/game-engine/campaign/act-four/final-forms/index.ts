// Phase 10E：Final Form 机制运行时 barrel。
//
// 遵循 Phase 9A 建立的范式：barrel 只做再导出，各模块之间直接引用具体文件，
// 幂等键单独成 final-form-transactions.ts 解除环依赖。

export * from './final-form-transactions';
export * from './final-form-runtime';
export * from './ancestor-first-form';
export * from './ancestor-second-form';
export * from './gestating-heart';
export * from './heart-of-darkness';
export * from './final-form-actions';
// outcome 反向依赖 final-form-sequence / resolve-campaign-victory，放在最后导出。
export * from './final-encounter-outcome';
