export type TrinketSourceTimingScopeStatus = 'SOURCE_BOUND' | 'SOURCE_UNRESOLVED' | 'RUNTIME_SCOPE_PARTIAL';

export interface TrinketTriggerScopeBinding {
  trigger: string;
  scopeComplete: boolean;
  sourceTimingScopeStatus: TrinketSourceTimingScopeStatus;
  blockerCode: string | null;
}

const INCOMPLETE_TRIGGER_SCOPES: Readonly<Record<string, Omit<TrinketTriggerScopeBinding, 'trigger'>>> = Object.freeze({
  'hero-heals': {
    scopeComplete: false,
    sourceTimingScopeStatus: 'RUNTIME_SCOPE_PARTIAL',
    blockerCode: 'TRINKET_TRIGGER_SCOPE_UNRESOLVED',
  },
  'hero-is-healed': {
    scopeComplete: false,
    sourceTimingScopeStatus: 'RUNTIME_SCOPE_PARTIAL',
    blockerCode: 'TRINKET_TRIGGER_SCOPE_UNRESOLVED',
  },
  'voluntary-declaration': {
    scopeComplete: false,
    sourceTimingScopeStatus: 'SOURCE_UNRESOLVED',
    blockerCode: 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED',
  },
});

export function trinketTriggerScopeBinding(trigger: string): TrinketTriggerScopeBinding {
  const incomplete = INCOMPLETE_TRIGGER_SCOPES[trigger];
  return incomplete ? { trigger, ...incomplete } : {
    trigger,
    scopeComplete: true,
    sourceTimingScopeStatus: 'SOURCE_BOUND',
    blockerCode: null,
  };
}
