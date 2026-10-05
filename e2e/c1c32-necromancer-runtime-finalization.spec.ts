import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, level = 1) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (level) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [{createNewCampaign,selectParty,applyDefaultLoadout},{saveCampaign},{useGameStore},{seededRuntimeSources,withRuntimeSources}]=await Promise.all([
      load('/src/game-engine/campaign.ts'),load('/src/game-engine/save.ts'),load('/src/store/useGameStore.ts'),load('/src/game-engine/runtime-sources.ts')]);
    const c=withRuntimeSources(seededRuntimeSources(32032),()=>applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','highwayman','vestal','hellion'])));
    c.gamePhase='quest-select'; c.campaignProgress.campaignLevel=level;
    c.campaignProgress.activeBossFamilyId='necromancer';c.campaignProgress.activeThreatId='necromancer-threat-level-'+level;
    c.campaignProgress.pendingThreatInitialization=false;c.campaignProgress.completedStandardQuestsThisAct=2;c.campaignProgress.bossQuestRequired=true;
    saveCampaign(c);useGameStore.setState({campaign:c});
  },level);
  await page.goto('/quests',{waitUntil:'domcontentloaded'});
  await page.getByTestId('migrate-hero-dodge-v2').click();
  await expect(page.getByTestId('quest-face-the-threat')).toHaveAttribute('aria-disabled','false');
  await page.getByTestId('quest-face-the-threat').click();
  await expect(page).toHaveURL(/dungeon/);
}

test('normal v2 selector attempts the production route and records Threat bridge PRODUCT_FAILURE',async({page},info)=>{
  await prepare(page);
  const before=await page.evaluate(async()=>{
    const path='/src/store/useGameStore.ts';const {useGameStore}=await import(/* @vite-ignore */ path);
    const c=useGameStore.getState().campaign;
    return {version:c.bossEncounterCheckpoint.ruleSetVersion,vestal:Object.values(c.bossEncounterCheckpoint.checkpointContext.heroDodgeBindings).find((b:any)=>b.heroId==='vestal'),rooms:c.dungeon.rooms};
  });
  expect(before.version).toBe('C1C31-DIGITAL-DEFAULT-v2');
  expect(before.vestal).toMatchObject({authority:'PROJECT_RULING',value:1});
  let boundary:any;
  for(let step=0;step<10;step++) {
    const state=await page.evaluate(async()=>{
      const path='/src/store/useGameStore.ts';const {useGameStore}=await import(/* @vite-ignore */ path);const c=useGameStore.getState().campaign;
      if(c.battle)return {battle:true,sourceBound:!!c.battle.bossEncounter,side:c.battle.bossEncounter?.side};
      const d=c.dungeon,objective=d.rooms.find((r:any)=>r.type==='objective').id,queue=[[d.currentRoomId]],seen=new Set([d.currentRoomId]);
      while(queue.length){const route=queue.shift()!;const id=route.at(-1);if(id===objective)return {next:route[1],battle:false};
        for(const next of d.rooms.find((r:any)=>r.id===id).adjacentRoomIds)if(!seen.has(next)){seen.add(next);queue.push([...route,next]);}}
      return {battle:false};
    });
    if(state.battle){boundary=state;break;}
    if(!state.next)break;
    await page.getByTestId('dungeon-room-'+state.next).click();
    const blocked=await page.evaluate(async(next)=>{
      const load=(p:string)=>import(/* @vite-ignore */ p);
      const [{useGameStore},{enterDungeonRoom}]=await Promise.all([load('/src/store/useGameStore.ts'),load('/src/game-engine/commands/dungeon.ts')]);
      const c=useGameStore.getState().campaign;const result=enterDungeonRoom(c,next);
      return {error:result.error,unchanged:result.campaign===c,battle:!!c.battle};
    },state.next);
    if(blocked.error==='necromancer-threat-domain-bridge-unbound'){boundary={...blocked,stopped:true};break;}
  }
  expect(boundary?.stopped || boundary?.battle).toBe(true);
  // A browser assertion PASS is coverage of the failure boundary, never full production acceptance.
  expect(!!(boundary.sourceBound && boundary.side==='THREAT')).toBe(false);
  info.annotations.push({type:'production-result',description:'PRODUCT_FAILURE: ordinary Threat Battle binding absent; full path not accepted.'});
  console.log(JSON.stringify({phase:'C1C32',productionResult:'PRODUCT_FAILURE',boundary:'PRODUCTION_THREAT_DOMAIN_BRIDGE',syntheticAcceptanceDependencies:0,fullProductionPathPassed:false}));
});

test('real selector checkpoint choice survives reload and commits through UI/Store (scoped proof)',async({page},info)=>{
  await prepare(page,2);
  await page.evaluate(async()=>{
    const load=(p:string)=>import(/* @vite-ignore */ p);
    const [{useGameStore},{applyBossThreatCheckpointInput},{saveCampaign}]=await Promise.all([load('/src/store/useGameStore.ts'),load('/src/game-engine/commands/boss-foundation.ts'),load('/src/game-engine/save.ts')]);
    const c=useGameStore.getState().campaign;
    const rolls=Object.fromEntries(Object.keys(c.bossEncounterCheckpoint.checkpointContext.heroDodge).map(id=>[id,1]));
    const next=applyBossThreatCheckpointInput(c,{type:'PREPARATION_DAY',rolls});saveCampaign(next);useGameStore.setState({campaign:next});
  });
  await expect(page.getByTestId('boss-pending-choice')).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  const candidate=page.getByTestId('boss-choice-candidate').first();const selected=await candidate.getAttribute('data-candidate-id');
  await candidate.click();await page.getByTestId('boss-choice-confirm').click();
  await expect(page.getByTestId('boss-pending-choice')).toHaveCount(0);
  await page.reload({waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const p='/src/store/useGameStore.ts';const {useGameStore}=await import(/* @vite-ignore */ p);const c=useGameStore.getState().campaign;
    return {forced:c.bossEncounterCheckpoint.threatState.forcedHeroId,events:c.bossEncounterCheckpoint.events,version:c.bossEncounterCheckpoint.ruleSetVersion};
  });
  expect(result.forced).toBe(selected);expect(result.version).toBe('C1C31-DIGITAL-DEFAULT-v2');
  expect(result.events.some((e:any)=>e.eventType==='CHOICE_COMMITTED')).toBe(true);
  info.annotations.push({type:'proof-scope',description:'Real component checkpoint/UI/Store/save proof; preparation rolls supplied; Hamlet transaction and full path NOT_PROVEN.'});
});
