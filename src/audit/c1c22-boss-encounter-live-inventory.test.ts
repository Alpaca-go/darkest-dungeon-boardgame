import { describe,it,expect } from 'vitest';
import { buildBossEncounterLiveInventory,assertBossEncounterLiveInventory } from './boss-encounter-live-inventory';
describe('C1C22 inventory/source boundary',()=>{
  it('joins live source without inventing physical-card readiness',()=>{
    const a=buildBossEncounterLiveInventory();expect(()=>assertBossEncounterLiveInventory(a)).not.toThrow();
    expect(a.cardObjectCount).toBe(278);expect(a.newContentSourceBlockedCount).toBe(247);expect(a.existingAct4ReferenceCount).toBe(30);
    const q=a.cards.find(c=>c.questDefinitionId);expect(q?.inventoryTagSupersededByLiveQuest).toBe(true);expect(q?.questSourceGates).toContain('REST_INSUFFICIENT_RECOVERY_CAPACITY');expect(q?.productionReady).toBe(false);
    expect(a.nextDecision.sourceIntakeCandidatePhysicalIds).toHaveLength(16);expect(a.nextDecision.selectedImplementationFamily).toBeNull();
  });
  const cases:Array<[string,(a:ReturnType<typeof buildBossEncounterLiveInventory>)=>void]>=[
    ['omitted card',a=>{a.cards.pop();}],['duplicate physical card',a=>{a.cards[0].physicalIdentity=a.cards[1].physicalIdentity;}],
    ['unbound Boss promoted',a=>{a.cards.find(c=>c.category==='Bosses')!.productionReady=true;}],
    ['visual identity used as source definition',a=>{a.cards[0].literalDefinitionBound=true;}],
    ['historical Boss Quest tag copied',a=>{a.cards.find(c=>c.questDefinitionId)!.inventoryTagSupersededByLiveQuest=false;}],
    ['Rest gate erased',a=>{a.cards.find(c=>c.questDefinitionId)!.questSourceGates=[];}],
    ['Act4 references counted as new Ready',a=>{a.newContentProductionReadyCount=30;}],
    ['threat absence asserted',a=>{a.categories.find(c=>c.category==='Threat Cards')!.missingCategoryDoesNotProveAbsence=false;}],
    ['runtime gain substituted for card count',a=>{a.nextDecision.expectedReadyGain=231;}],
    ['mock event source injected',a=>{a.cards.find(c=>c.category==='Encounter / Event Content')!.definitionBindingStatus='LIVE_QUEST_DEFINITION';}],
    ['unsupported gameplay selected',a=>{a.nextDecision.candidateImplementationIds.push('prototype-event');}],
  ];
  it.each(cases)('rejects %s',(_name,mutate)=>{const a=structuredClone(buildBossEncounterLiveInventory());mutate(a);expect(()=>assertBossEncounterLiveInventory(a)).toThrow();});
});
