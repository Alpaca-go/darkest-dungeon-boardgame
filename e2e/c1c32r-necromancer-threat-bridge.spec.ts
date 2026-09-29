import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const load=(path:string)=>import(/* @vite-ignore */ path);
    const [{createNewCampaign,selectParty,applyDefaultLoadout},{saveCampaign},{useGameStore},{seededRuntimeSources,withRuntimeSources}]=await Promise.all([
      load('/src/game-engine/campaign.ts'),load('/src/game-engine/save.ts'),load('/src/store/useGameStore.ts'),load('/src/game-engine/runtime-sources.ts')]);
    const c=withRuntimeSources(seededRuntimeSources(32032),()=>applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),['crusader','highwayman','vestal','hellion'])));
    c.gamePhase='quest-select';
    Object.assign(c.campaignProgress,{activeBossFamilyId:'necromancer',activeThreatId:'necromancer-threat-level-1',
      pendingThreatInitialization:false,completedStandardQuestsThisAct:2,bossQuestRequired:true});
    saveCampaign(c);useGameStore.setState({campaign:c});
  });
  await page.goto('/quests',{waitUntil:'domcontentloaded'});
  await page.getByTestId('migrate-hero-dodge-v2').click();
  await page.getByTestId('quest-face-the-threat').click();
  await expect(page).toHaveURL(/dungeon/);
}

test('production acceptance requires an actual guarded THREAT Battle; a blocker is a failure',async({page},info)=>{
  await prepare(page);
  const route=await page.evaluate(async()=>{
    const path='/src/store/useGameStore.ts';const {useGameStore}=await import(/* @vite-ignore */ path);
    const d=useGameStore.getState().campaign.dungeon;
    const queue=[[d.currentRoomId]],seen=new Set([d.currentRoomId]);
    while(queue.length) {
      const route=queue.shift()!,room=d.rooms.find((r:any)=>r.id===route.at(-1));
      if(['lair','treasure','curio'].includes(room.sourceRoomToken))return route.slice(1);
      for(const id of room.adjacentRoomIds)if(!seen.has(id)&&d.rooms.find((r:any)=>r.id===id).type!=='objective') {
        seen.add(id);queue.push([...route,id]);
      }
    }
    throw new Error('No guarded Room before Boss');
  });
  for(const id of route)await page.getByTestId('dungeon-room-'+id).click();
  info.annotations.push({type:'acceptance-gate',description:'Full route cannot be accepted until ordinary production THREAT combat exists.'});
  // This deliberately fails while the dependency is unbound. Detecting the blocker never passes acceptance.
  await expect.poll(async()=>page.evaluate(async()=>{
    const path='/src/store/useGameStore.ts';const {useGameStore}=await import(/* @vite-ignore */ path);
    const c=useGameStore.getState().campaign;
    return c.battle?.bossEncounter?.side==='THREAT' && c.battle.monsters.length>0;
  }),{message:'PRODUCTION_THREAT_DOMAIN_BRIDGE: guarded Room must start a real source-bound THREAT Battle'}).toBe(true);
});

test('normal selector exposes the production leave guard across reload (scoped UI coverage)',async({page},info)=>{
  await prepare(page);
  await expect(page.getByTestId('leave-dungeon')).toBeDisabled();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByTestId('leave-dungeon')).toBeDisabled();
  info.annotations.push({type:'proof-scope',description:'Exit guard only; no full Threat/combat acceptance claim.'});
});
