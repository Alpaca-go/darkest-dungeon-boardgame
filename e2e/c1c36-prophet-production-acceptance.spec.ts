import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { CampaignState } from '../src/types';

const replayStates = new WeakMap<Page, Array<{ point: string; stateHash: string }>>();
function observe(page: Page, point: string, campaign: CampaignState) {
  const states = replayStates.get(page) ?? [];
  if (!states.some(s => s.point === point)) states.push({ point, stateHash: hash(campaign) });
  replayStates.set(page, states);
}

/** Inspection only: every mutation in this test is a visible player control. */
async function saved(page: Page): Promise<CampaignState> {
  return page.evaluate(() => {
    const value = Object.values(localStorage).map(text => { try { return JSON.parse(text); } catch { return null; } })
      .find(entry => entry?.campaign?.id);
    if (!value) throw new Error('Player save unavailable');
    return value.campaign;
  });
}

/** Resolve the frontmost player overlay before touching controls behind it. */
async function playerOverlay(page: Page): Promise<boolean> {
  const top = await page.evaluate(() => {
    const ids = ['quest-rule-choice', 'mental-event-overlay', 'trinket-allocation-overlay',
      'trinket-use-overlay', 'disease-overlay', 'quirk-decision-overlay'];
    return Array.from(document.querySelectorAll<HTMLElement>('[data-testid]'))
      .filter(node => ids.includes(node.dataset.testid!) && node.getClientRects().length)
      .map((node, order) => ({ id: node.dataset.testid!, order, z: Number(getComputedStyle(node).zIndex) || 0 }))
      .sort((a, b) => b.z - a.z || b.order - a.order)[0]?.id;
  });
  if (top === 'quest-rule-choice') { await questChoice(page); return true; }
  const confirmations: Record<string, string> = {
    'mental-event-overlay': 'mental-overlay-confirm',
    'trinket-allocation-overlay': 'alloc-discard',
    'disease-overlay': 'disease-overlay-confirm',
    'quirk-decision-overlay': 'quirk-discard-incoming',
  };
  if (top && confirmations[top]) { await page.getByTestId(confirmations[top]).click(); return true; }
  if (top === 'trinket-use-overlay') {
    const decline = page.locator('[data-testid^="trinket-decline-"]');
    if (await decline.count()) { await decline.first().click(); return true; }
    const wild = page.locator('[data-testid^="provision-wild-"]');
    if (await wild.count()) { await wild.first().click(); return true; }
  }
  return false;
}

async function fight(page: Page, inspect?: (c: CampaignState) => Promise<void>) {
  for (let step = 0; step < 200; step++) {
    const frame = await saved(page), battle = frame.battle;
    if(inspect)await inspect(frame);
    if (await playerOverlay(page)) continue;
    if (battle) {
      const domain = battle.ruinsContext ? 'ordinary' : 'boss';
      observe(page, `${domain}-battle-${battle.status}`, frame);
      if (battle.pendingMonsterAttack) observe(page, `${domain}-incoming-reaction`, frame);
      if (battle.ruinsContext?.pendingChoice) observe(page, 'ordinary-movement-choice', frame);
      if (battle.ruinsContext?.pendingReanimationChoice) observe(page, 'ordinary-reanimation-choice', frame);
      if (battle.ruinsContext?.retiredMonsterInstances?.length) observe(page, 'after-ordinary-death', frame);
      if (battle.heroes.some(h => h.id === battle.activeActorId)) observe(page, `${domain}-hero-turn-before-skill`, frame);
    }
    if(await page.getByTestId('battle-continue-resolution').count()){await page.getByTestId('battle-continue-resolution').click();continue;}
    const c = await saved(page), b = c.battle;

    if (!b) return;
    if(step%10===0)console.log('C1C36 fight',step,b.status,b.round,b.activeActorId,b.bossEncounter?.prophetProduction?.actionOrdinal,b.pendingMonsterAttack?.stage);
    if (b.status === 'victory') {
      await page.getByRole('button', { name: '领取奖励并返回地牢', exact: true }).click();
      observe(page, `${b.ruinsContext ? 'ordinary' : 'boss'}-after-settlement`, await saved(page));
      return;
    }
    if(b.status==='defeat'&&b.ruinsContext){
      await page.getByRole('button',{name:'撤退回地牢',exact:true}).click();
      expect((await saved(page)).battle).toBeNull();
      observe(page,'ordinary-round-limit-return',await saved(page));return;
    }
    expect(b.status, JSON.stringify({ round: b.round, log: b.battleLog.slice(-5) })).not.toBe('defeat');
    if (await page.getByTestId('boss-pending-choice').count()) {
      const choice=b.bossEncounter!.pendingChoice!,rng=b.bossEncounter!.rngState;
      expect(await page.getByTestId('boss-choice-candidate').count()).toBe(choice.candidateIds.length);
      await expect(page.getByTestId('boss-choice-confirm')).toBeDisabled();
      const inRange=await page.evaluate(async e=>{
        const {areaDistance}=await import('/src/game-engine/bosses/foundation.ts');
        const skill=e.definition.skills.find(s=>s.number===e.prophetProduction!.skillSelection!.selectedSkill)!;
        return e.pendingChoice!.candidateIds.find(id=>areaDistance(e.definition,e.placements[e.bossState.actorId!],id)===skill.range);
      },b.bossEncounter!);
      const candidates=page.getByTestId('boss-choice-candidate');
      if(inRange)await candidates.filter({hasText:inRange}).click();else await candidates.first().click();
      await page.getByTestId('boss-choice-confirm').click();
      expect((await saved(page)).battle!.bossEncounter!.rngState).toBe(rng);
      continue;
    }
    const ordinaryChoice = page.getByRole('region', { name: 'Ruins 待决选择' });
    if (await ordinaryChoice.count()) { await ordinaryChoice.getByRole('button').first().click(); continue; }
    const actor = b.heroes.find(u => u.id === b.activeActorId);
    if(!actor&&b.bossEncounter?.checkpointContext?.playerRouteVersion){await expect(page.getByTestId('battle-continue-resolution')).toBeVisible();continue;}
    if(!actor&&b.pendingMonsterAttack&&c.pendingTrinketUseOpportunities.some(o=>o.status==='open')){await expect(page.getByTestId('trinket-use-overlay')).toBeVisible();continue;}
    expect(actor, JSON.stringify({ active: b.activeActorId, pending: b.pendingMonsterAttack, phase: c.gamePhase })).toBeTruthy();
    let acted = false;
    const wounded=b.heroes.filter(h=>h.isAlive&&h.hp<h.maxHp/2).sort((a,z)=>a.hp-z.hp);
    if(wounded.length){
      for(const id of actor!.equippedSkillIds??[]){
        const button=page.getByTestId('skill-'+id);
        if(!await button.count()||!await button.isEnabled()||!(await button.innerText()).includes('治疗'))continue;
        await button.click();
        const target=wounded.map(h=>page.getByTestId('actor-'+h.id));
        for(const candidate of target)if(await candidate.getAttribute('data-legal-target')==='true'){await candidate.click();acted=true;break;}
        if(acted)break;await button.click();
      }
      if(acted)continue;
    }
    if(b.bossEncounter?.prophetProduction&&b.round===1){
      const area=b.bossEncounter.placements[actor!.id];
      if(area.endsWith(':S')&&b.heroes.filter(h=>h.isAlive&&b.bossEncounter!.placements[h.id]===area).length===2){
        const areas=page.getByTestId('boss-move-area');
        for(let n=0;n<await areas.count();n++){
          const button=areas.nth(n),target=await button.getAttribute('data-area-id');
          if(!b.heroes.some(h=>h.isAlive&&b.bossEncounter!.placements[h.id]===target)&&await button.isEnabled()){await button.click();acted=true;break;}
        }
        if(acted)continue;
      }
      await page.getByTestId('end-turn').click();continue;
    }
    const skills:Array<{id:string;score:number}>=[];
    for(const id of actor!.equippedSkillIds??[]){
      const button=page.getByTestId('skill-'+id);
      if(!await button.count()||!await button.isEnabled())continue;
      const match=(await button.innerText()).match(/伤害 (\d+)-(\d+) \/ 命中≥(\d+)/);
      if(match)skills.push({id,score:(Number(match[1])+Number(match[2]))*(11-Number(match[3]))});
    }
    for (const {id} of skills.sort((a,z)=>z.score-a.score)) {
      const skill = page.getByTestId(`skill-${id}`);
      if (!await skill.count() || !await skill.isEnabled() || !(await skill.innerText()).includes('伤害')) continue;
      await skill.click();
      const targets = page.getByTestId('monster-side').locator('[data-legal-target="true"]');
      if (!await targets.count()) { await skill.click(); continue; }
      let target=targets.first();
      for(const monster of b.monsters.filter(m=>m.isAlive).sort((a,z)=>a.hp-z.hp)){
        const candidate=page.getByTestId('actor-'+monster.id);
        if(await candidate.getAttribute('data-legal-target')==='true'){target=candidate;break;}
      }
      await target.click();
      acted = true;
      break;
    }
    if (!acted && b.ruinsContext && b.currentActionPoints > 0) {
      const options=await page.evaluate(async b=>{
        const {ruinsTile}=await import('/src/game-engine/ruins/source-registry.ts');
        const {ruinsAreaDistance}=await import('/src/game-engine/ruins/monster-runtime.ts');
        const context=b.ruinsContext!,tile=ruinsTile(context.tileId);
        const distance=(area:string)=>Math.min(...b.monsters.filter(m=>m.isAlive).map(m=>ruinsAreaDistance(tile,area,context.placements[m.id])));
        const current=distance(context.placements[b.activeActorId!]);
        return tile.areas.filter(a=>distance(a.id)<current).sort((a,z)=>distance(a.id)-distance(z.id)).map(a=>a.id);
      },b);
      for(const area of options){
        const button=page.getByRole('button',{name:'移动到 '+area,exact:true});
        if(await button.count()&&await button.isEnabled()){await button.click();acted=true;break;}
      }
    }
    if(!acted&&b.bossEncounter&&b.currentActionPoints>0){
      const options=await page.evaluate(async b=>{
        const {areaDistance}=await import('/src/game-engine/bosses/foundation.ts');
        const e=b.bossEncounter!,boss=e.placements[e.bossState.actorId!],current=areaDistance(e.definition,e.placements[b.activeActorId!],boss);
        return e.definition.areas.filter(a=>areaDistance(e.definition,a.id,boss)<current)
          .sort((a,z)=>areaDistance(e.definition,a.id,boss)-areaDistance(e.definition,z.id,boss)).map(a=>a.id);
      },b);
      const buttons=page.getByTestId('boss-move-area');
      for(const area of options){for(let n=0;n<await buttons.count();n++){
        const button=buttons.nth(n);
        if(await button.getAttribute('data-area-id')===area&&await button.isEnabled()){await button.click();acted=true;break;}
        if(acted)break;
      }if(acted)break;}
    }
    if (!acted) {if(!await page.getByTestId('end-turn').count())throw new Error('No player controls: '+JSON.stringify({phase:c.gamePhase,log:b.battleLog.slice(-5),text:(await page.locator('body').innerText()).slice(0,1800)}));await page.getByTestId('end-turn').click();}
  }
  throw new Error('Player Battle exceeded action budget');
}

async function move(page: Page, roomId: string, inspect?: (c: CampaignState) => Promise<void>) {
  await acknowledgeEvents(page);
  await page.getByTestId(`dungeon-room-${roomId}`).click();
  for(let n=0;n<20&&(await saved(page)).pendingDungeonTrinketAction;n++){
    const wild=page.locator('[data-testid^="provision-wild-"]');
    const decline=page.locator('[data-testid^="trinket-decline-"]');
    if(await decline.count())await decline.first().click();
    else if(await wild.count())await wild.first().click();
    else break;
  }
  const c = await saved(page);
  if (c.battle?.ruinsContext) observe(page, 'after-draw-state-and-encounter-creation', c);
  if(c.battle?.ruinsContext&&c.bossEncounterCheckpoint?.bossLevel===3){
    const audit=await page.evaluate(async c=>{
      const {ruinsMonster}=await import('/src/game-engine/ruins/source-registry.ts');
      const encounter=c.ruinsDrawState!.encounters.find(e=>e.encounterId===c.battle!.ruinsContext!.encounterId)!;
      const receipts=c.bossEncounterCheckpoint!.events.filter(e=>e.eventType==='PROPHET_THREAT_APPLIED').map(e=>e.result as {transactionId:string;stress:number});
      return encounter.monsters.map(m=>({copyId:m.copyId,definitionId:m.definitionId,unholy:ruinsMonster(m.definitionId,'C1C32R2C-R-DIGITAL-DEFAULT-v6').tags.includes('Unholy'),
        receipt:receipts.find(r=>r.transactionId===`ruins:${encounter.encounterId}:spawn:ruins:${encounter.encounterId}:${m.copyId}`)??null}));
    },c);
    for(const row of audit){expect(row.receipt?.stress??0).toBe(row.unholy?1:0);spawnAudits.push(row);}
    await reload(page,3,'physical spawn receipts '+c.battle.ruinsContext.encounterId);
  }
  expect(c.dungeon?.currentRoomId).toBe(roomId);
  if (c.battle) await fight(page, inspect);
}

async function acknowledgeEvents(page:Page){
  for(let n=0;n<30;n++){
    if (await playerOverlay(page)) continue;
    if((await saved(page)).gamePhase==='replacement'){
      await expect(page.getByTestId('replacement-page')).toBeVisible();
      const slot=page.locator('[data-testid^="replacement-slot-"]').filter({has:page.locator('[data-testid^="candidate-"]')}).first();
      await slot.locator('[data-testid^="candidate-"]:not([disabled])').first().click();
      await slot.locator('[data-testid^="confirm-replacement-"]').click();continue;
    }
    break;
  }
}

function path(c: CampaignState, target: string): string[] {
  const d = c.dungeon!, queue: string[][] = [[d.currentRoomId]], seen = new Set<string>();
  while (queue.length) {
    const route = queue.shift()!, current = route.at(-1)!;
    if (current === target) return route.slice(1);
    if (seen.has(current)) continue;
    seen.add(current);
    for (const id of d.rooms.find(r => r.id === current)!.adjacentRoomIds) queue.push([...route, id]);
  }
  throw new Error('Room unreachable');
}


const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
const points: Array<{level:number;point:string;stateHash:string;saveHash:string;rngHash:string;eventHash:string;ownershipHash:string}> = [];
const externalRequests=new Set<string>();
const tavernAudits=new WeakMap<Page,Array<{level:number;before:number;after:number;modifier:number;active:boolean;recoveryBeforePassives:number;recoveryAfterPassives:number;modifierSources:unknown[]}>>();
async function tavernExpectation(page:Page,heroId:string,modifier:number){
  return page.evaluate(async({heroId,modifier})=>{
    const entry=Object.values(localStorage).map(text=>{try{return JSON.parse(text);}catch{return null;}}).find(e=>e?.campaign?.id);
    const campaign=entry.campaign as CampaignState;
    const threat=campaign.activeThreatRuntime;
    if(modifier===0&&threat?.active&&threat.bossFamilyId==='prophet')throw new Error('Prophet Tavern modifier remains active');
    if(modifier!==0&&(!threat?.active||threat.bossFamilyId!=='prophet'||modifier!==-threat.campaignLevel))throw new Error('Active Prophet Tavern identity mismatch');
    const {applyQuirkModifiers}=await import('/src/game-engine/quirk-passives.ts');
    const base=3+modifier;
    const result=base>0?applyQuirkModifiers(campaign,heroId,'stress-recovered',base):{amount:0,applied:[]};
    return {recoveryBeforePassives:base,recoveryAfterPassives:result.amount,modifierSources:result.applied};
  },{heroId,modifier});
}
const spawnAudits:Array<{copyId:string;definitionId:string;unholy:boolean;receipt:{transactionId:string;stress:number}|null}>=[];
test.beforeEach(async({page},info)=>{
  const level=Number(info.title.match(/Level (\d)/)?.[1]);
  fs.writeFileSync('docs/data/complete-edition/c1c36-prophet-browser-level'+level+'.json',JSON.stringify({status:'RUNNING',level,evidenceVersion:'C1C36-PLAYER-RELOAD-v1'})+'\n');
  await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(['localhost','127.0.0.1','[::1]'].includes(u.hostname))return route.continue();
  externalRequests.add(u.origin);return route.abort();
});});
test.afterEach(async({},info)=>{
  if(info.status===info.expectedStatus)return;
  const level=Number(info.title.match(/Level (\d)/)?.[1]);
  fs.writeFileSync('docs/data/complete-edition/c1c36-prophet-browser-level'+level+'.json',JSON.stringify({status:'BLOCKED',level,evidenceVersion:'C1C36-PLAYER-RELOAD-v1',
    dependency:info.errors.map(e=>e.message?.replace(/\u001b\[[0-9;]*m/g,'')).join('\n')},null,2)+'\n');
});
async function reload(page:Page,level:number,point:string){
  const before=await saved(page);const save=await page.evaluate(()=>localStorage.getItem('dd-web-prototype-save-v1'));
  const loaded=await page.evaluate(async()=>{const m=await import('/src/game-engine/save.ts');return m.loadSaveDetailed();});
  expect(loaded.status,point+': '+loaded.error).toBe('ok');expect(loaded.campaign,point).toEqual(before);
  await page.reload();expect(await saved(page)).toEqual(before);
  const e=before.battle?.bossEncounter??before.bossEncounterCheckpoint??before.bossEncounterHistory?.at(-1);
  points.push({level,point,stateHash:hash(before),saveHash:hash(save),rngHash:hash({rng:e?.rngState,clock:e?.clockCursor,id:e?.idCursor}),
    eventHash:hash(e?.events),ownershipHash:hash({room:before.bossRoomStorage,pews:e?.prophetProduction?.pews,draw:before.ruinsDrawState})});
}
async function questChoice(page:Page){const choice=page.getByTestId('quest-rule-choice');if(await choice.count())await choice.locator('button:not([disabled])').first().click();}
async function hamlet(page:Page,level:number){
  await reload(page,level,'Hamlet active Threat');
  let tavern=false;
  for(let day=0;day<8;day++){
    const c=await saved(page);if(c.gamePhase==='quest-select')break;
    if(!tavern){const hero=c.heroes.find(h=>!h.dead&&!h.hasActedToday&&h.stress>0);
      if(hero){await page.getByTestId('hero-select-'+hero.instanceId).click();const button=page.getByTestId('building-tavern');
        if(await button.isEnabled()){const before=hero.stress,expected=await tavernExpectation(page,hero.instanceId,-level);await button.click();const after=(await saved(page)).heroes.find(h=>h.instanceId===hero.instanceId)!.stress;
          expect(after).toBe(Math.max(0,before-expected.recoveryAfterPassives));tavern=true;
          tavernAudits.set(page,[...(tavernAudits.get(page)??[]),{level,before,after,modifier:-level,active:true,...expected}]);}}
    }
    for(const h of (await saved(page)).heroes.filter(h=>!h.dead&&!h.hasActedToday))await page.getByTestId('skip-'+h.instanceId).click();
    await page.getByTestId('end-day').click();
  }
  return tavern;
}
for(const level of [1,2,3] as const)test('C1C36 Prophet normal player route Level '+level,async({page})=>{
  test.setTimeout(1_200_000);page.setDefaultTimeout(20_000);page.setDefaultNavigationTimeout(120_000);const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR',m.text());});
  console.log('C1C36 setup',level);await page.goto('/');await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button',{name:'新建战役',exact:true}).click();
  for(const hero of ['Crusader','Leper','Highwayman','Vestal'])await page.getByText(hero,{exact:true}).first().click();
  await page.getByRole('button',{name:'继续（技能配置）',exact:true}).click();
  await page.getByRole('button',{name:'使用默认配置（全部英雄）',exact:true}).click();
  await page.getByRole('button',{name:'继续（任务选择）',exact:true}).click();
  await page.getByTestId('migrate-hero-dodge-v2').click();await page.getByTestId('select-production-ruins-v6').click();
  // Limited pre-Quest progression prerequisite only. Fresh production selection currently starts with Necromancer.
  await page.evaluate(level=>{const key='dd-web-prototype-save-v1',s=JSON.parse(localStorage.getItem(key)!);const c=s.campaign;
    c.act=level;c.campaignLevel=level;Object.assign(c.campaignProgress,{act:level,campaignLevel:level,activeBossFamilyId:'prophet',
      defeatedBossFamilyIds:level===3?['necromancer','hag']:level===2?['necromancer']:[]});localStorage.setItem(key,JSON.stringify(s));},level);
  await page.reload();let threatId='',tavern=false;const receipts:string[][]=[];
  for(let quest=0;quest<2;quest++){
    const before=(await saved(page)).heroes.map(h=>h.stress);await page.locator('[data-testid^="quest-community-"]').first().click();
    console.log('C1C36 Standard',level,quest);let c=await saved(page);expect(c.activeThreatRuntime!.bossFamilyId).toBe('prophet');
    if(!threatId)threatId=c.activeThreatRuntime!.drawTransactionId;expect(c.activeThreatRuntime!.drawTransactionId).toBe(threatId);
    if(level===1)expect(c.heroes.map(h=>h.stress)).toEqual(before.map(n=>n+2));
    await reload(page,level,'Standard Quest '+quest+' Threat effect');
    if(level===2){const before=c.heroes.map(h=>h.stress);await page.getByTestId('scout-dungeon').click();c=await saved(page);
      expect(c.heroes.map(h=>h.stress)).toEqual(before.map(n=>n+2));await reload(page,level,'Scout receipt '+quest);}
    if(level===3){const guarded=c.dungeon!.rooms.find(r=>r.sourceRoomToken==='lair')!;
      for(const room of path(c,guarded.id)){await questChoice(page);await move(page,room);await questChoice(page);}}
    c=await saved(page);receipts.push(c.bossEncounterCheckpoint!.checkpointContext!.consumedOnceKeys);
    await page.getByTestId('leave-dungeon').click();await page.getByTestId('leave-dungeon-confirm-ok').click();
    await acknowledgeEvents(page);
    await page.getByTestId('return-hamlet').click();tavern=(await hamlet(page,level))||tavern;
    expect((await saved(page)).prophetQuestThreatHistory).toHaveLength(quest+1);
  }
  console.log('C1C36 Boss selection',level);expect(tavern).toBe(true);const preFace=await saved(page);await page.getByTestId('quest-face-the-threat').click();
  let c=await saved(page);expect(c.bossRoomStorage).toMatchObject({roomCardId:44710,tileId:'ruins-tile-11',lifecycle:'RESERVED'});
  if(level===1)expect(c.heroes.map(h=>h.stress)).toEqual(preFace.heroes.map(h=>h.stress+2));
  expect(c.activeThreatRuntime!.drawTransactionId).toBe(threatId);await reload(page,level,'Face the Threat Room 11 RESERVED');
  const seen=new Set<string>();const inspect=async(c:CampaignState)=>{
    const b=c.battle,p=b?.bossEncounter?.prophetProduction;if(!p)return;
    await expect(page.getByTestId('prophet-action-ordinal')).toBeVisible();
    for(let n=1;n<=4;n++)await expect(page.getByTestId('prophet-pew-'+n)).toBeVisible();
    if(p.placementTransactions.length&&!seen.has('after ordinal 1 placement')){seen.add('after ordinal 1 placement');await reload(page,level,'after ordinal 1 placement');}
    const point=b!.status==='victory'?'Boss victory before settlement':!b!.activeActorId?'Room 11 IN_PLAY before first Prophet activation':b!.bossEncounter!.pendingChoice?'Crowded PendingChoice'
      :b!.pendingMonsterAttack?'attack '+b!.pendingMonsterAttack.stage+' Rubble '+p.rubbleCursor:'ordinal '+p.actionOrdinal+' Rubble '+p.rubbleCursor;
    if(!seen.has(point)){seen.add(point);await reload(page,level,point);}
  };
  const room=c.bossRoomStorage!.roomId;const guarded=c.dungeon!.rooms.find(r=>r.sourceRoomToken==='lair')!;
  for(const id of path(c,guarded.id)){await questChoice(page);await move(page,id,inspect);await questChoice(page);}
  for(const id of path(await saved(page),room)){await questChoice(page);await move(page,id,inspect);}
  c=await saved(page);expect(c.campaignProgress.defeatedBossFamilyIds).toContain('prophet');expect(c.bossRoomStorage!.lifecycle).toBe('RETURNED');
  expect(c.campaignProgress.act).toBe(level+1);expect(c.campaignProgress.campaignLevel).toBe(Math.min(level+1,3));
  const committedProgress=structuredClone(c.campaignProgress);
  expect(c.bossEncounterHistory!.at(-1)!.prophetProduction!.returnedPewIds).toHaveLength(4);
  await reload(page,level,'campaign progression');expect(errors).toEqual([]);expect([...externalRequests]).toEqual([]);
  for(let n=0;n<=4;n++)expect([...seen].some(p=>p.endsWith('Rubble '+n)),'Rubble checkpoint '+n).toBe(true);
  expect([...seen].some(p=>p.includes('incoming-attack-window'))).toBe(true);
  expect([...seen].some(p=>p.includes('hero-hit-window'))).toBe(true);
  expect(seen.has('Room 11 IN_PLAY before first Prophet activation')).toBe(true);
  const e=c.bossEncounterHistory!.at(-1)!,p=e.prophetProduction!;
  await acknowledgeEvents(page);
  if((await saved(page)).gamePhase==='dungeon-explore'){
    await page.getByTestId('leave-dungeon').click();await page.getByTestId('leave-dungeon-confirm-ok').click();
  }
  await acknowledgeEvents(page);
  expect((await saved(page)).lastQuestResult!.outcome).toBe('completed');
  await page.getByTestId('return-hamlet').click();await acknowledgeEvents(page);
  expect((await saved(page)).campaignProgress).toEqual(committedProgress);
  let recovered=false;
  for(let day=0;day<8&&!recovered;day++){
    const current=await saved(page);
    expect(current.gamePhase,'post-victory preparation must offer Tavern').toBe('hamlet');
    for(const h of current.heroes.filter(h=>!h.dead&&!h.hasActedToday&&h.stress>0)){
      await page.getByTestId('hero-select-'+h.instanceId).click();
      const button=page.getByTestId('building-tavern');
      if(!await button.isEnabled())continue;
      const expected=await tavernExpectation(page,h.instanceId,0);
      await button.click();const after=(await saved(page)).heroes.find(hero=>hero.instanceId===h.instanceId)!.stress;
      expect(after).toBe(Math.max(0,h.stress-expected.recoveryAfterPassives));
      tavernAudits.set(page,[...(tavernAudits.get(page)??[]),{level,before:h.stress,after,modifier:0,active:false,...expected}]);recovered=true;break;
    }
    if(!recovered){for(const h of current.heroes.filter(h=>!h.dead&&!h.hasActedToday))await page.getByTestId('skip-'+h.instanceId).click();await page.getByTestId('end-day').click();await acknowledgeEvents(page);}
  }
  expect(recovered).toBe(true);
  await reload(page,level,'post-victory Tavern without Prophet modifier');
  c=await saved(page);
  expect(c.processedCampaignTransactionIds.filter(id=>id===e.cleanupState.campaignTransactionId)).toHaveLength(1);
  fs.writeFileSync('docs/data/complete-edition/c1c36-prophet-browser-level'+level+'.json',JSON.stringify({status:'PASS',level,evidenceVersion:'C1C36-PLAYER-RELOAD-v1',
    prerequisiteFixture:'pre-Quest Act/level/family/defeated family prerequisites only',questBattleFixture:false,threatId,receipts,
    observed:[...seen],finalStateHash:hash(c),eventHash:hash(e.events),ruleSetVersion:e.ruleSetVersion,heroDodgeRuleSetVersion:e.ruleDependencies!.heroDodgeRuleSetVersion,
    questRunId:e.checkpointContext!.questRunId,encounterId:e.checkpointContext!.encounterId,room:c.bossRoomStorage,
    returnedPewIds:p.returnedPewIds,activePews:p.pews.filter(w=>w.lifecycle!=='STORED').length,pendingAttack:p.pendingPewAttack,pendingChoice:e.pendingChoice,
    defeatedBossFamilyIds:c.campaignProgress.defeatedBossFamilyIds,defeatedThreatIds:c.campaignProgress.defeatedThreatIds,
    act:c.campaignProgress.act,campaignLevel:c.campaignProgress.campaignLevel,
    transactions:c.processedCampaignTransactionIds.filter(id=>id.includes(e.checkpointContext!.questRunId)||id.startsWith('act-start:')||id.startsWith('act-four-unlock:')),
    questCompletion:{outcome:c.lastQuestResult!.outcome,xpPerHero:c.lastQuestResult!.xpPerHero,heroes:c.heroes.map(h=>({instanceId:h.instanceId,level:h.level,xp:h.xp})),pendingQuestXp:c.pendingQuestXp},
    archivedQuestReceipts:c.prophetQuestThreatHistory!.map(h=>({questRunId:h.questRunId,encounterId:h.checkpoint.checkpointContext!.encounterId,
      threatCardId:h.checkpoint.threatAbilityCardId,ruleSetVersion:h.checkpoint.ruleSetVersion,receipts:h.checkpoint.checkpointContext!.consumedOnceKeys})),
    attacks:p.attacks.map(a=>({transactionId:a.transactionId,physicalOrdinal:a.physicalOrdinal,skillNumber:a.skillNumber,attackRoll:a.attackRoll,targetActorIds:a.targetActorIds})),
    spawnAudits:level===3?spawnAudits:[],tavern:tavernAudits.get(page),stateObservations:replayStates.get(page)},null,2)+'\n');
});
test.afterAll(()=>fs.writeFileSync('docs/data/complete-edition/c1c36-prophet-browser-reload-matrix.json',JSON.stringify({points,externalNetworkBlocked:true,externalRequests:[...externalRequests]},null,2)+'\n'));
