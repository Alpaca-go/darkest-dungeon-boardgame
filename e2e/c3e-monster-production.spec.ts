import {expect,test,type Page} from '@playwright/test';
import {readFileSync,appendFileSync} from 'node:fs';
import type {CampaignState} from '../src/types';
const fixtures=JSON.parse(readFileSync('pw-out/c3e-browser-fixtures.json','utf8'));
const errors=new Map<Page,string[]>();
test.beforeEach(async({page})=>{errors.set(page,[]);page.on('pageerror',e=>errors.get(page)!.push(e.message));});
test.afterEach(async({page},info)=>{appendFileSync('pw-out/c3e-browser-observations.jsonl',JSON.stringify({title:info.title,status:info.status,errors:errors.get(page)})+'\n');expect(errors.get(page)).toEqual([]);});
async function saved(page:Page):Promise<CampaignState>{return page.evaluate(()=>JSON.parse(localStorage.getItem('dd-web-prototype-save-v1')!).campaign);}
async function load(page:Page,name:string){await page.goto('/');await page.getByRole('link',{name:'首页',exact:true}).click();await page.locator('input[type="file"]').setInputFiles({name:'c3e.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixtures[name]))});await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');await page.getByTestId('btn-continue').click();}
async function reload(page:Page,point:string){const before=await saved(page);await page.reload();await expect(page.getByTestId('save-broken')).toHaveCount(0);expect(await saved(page)).toEqual(before);appendFileSync('pw-out/c3e-browser-observations.jsonl',JSON.stringify({point,saveRoundTrip:true,context:before.battle?.productionMonsterContext,pending:before.battle?.pendingMonsterAttack})+'\n');}
async function next(page:Page){const choice=page.getByRole('region',{name:'Ruins 待决选择'}),decline=page.locator('[data-testid^="trinket-decline-"]'),cont=page.getByTestId('battle-continue-resolution');if(await choice.count())await choice.getByRole('button').first().click();else if(await decline.count())await decline.first().click();else if(await cont.count())await cont.click();else await page.getByTestId('end-turn').click();}

test('A ordinary physical Ruins dungeon route stages a production single-target attack',async({page})=>{
 await load(page,'dungeon');
 for(let n=0;n<35;n++){
  const c=await saved(page);if(c.battle)break;
  const overlay=page.getByTestId('quest-rule-choice');if(await overlay.count()){await overlay.getByRole('button').first().click();continue;}
  const d=c.dungeon!,target=d.rooms.find(r=>r.sourceRoomToken==='lair'||r.type==='battle')!;
  const queue=[{id:d.currentRoomId!,path:[] as string[]}],seen=new Set<string>();let path:string[]=[];
  while(queue.length){const v=queue.shift()!;if(v.id===target.id){path=v.path;break;}if(seen.has(v.id))continue;seen.add(v.id);for(const id of d.rooms.find(r=>r.id===v.id)!.adjacentRoomIds)queue.push({id,path:[...v.path,id]});}
  expect(path.length).toBeGreaterThan(0);await page.getByTestId('dungeon-room-'+path[0]).click();const ack=page.getByTestId('event-confirm');if(await ack.count())await ack.click();
 }
 expect((await saved(page)).battle!.productionMonsterContext?.physicalCopyIds).toBeTruthy();
 for(let n=0;n<50&&!(await saved(page)).battle!.pendingMonsterAttack;n++)await next(page);
 const c=await saved(page),pending=c.battle!.pendingMonsterAttack!;expect(pending.productionMonsterAttack).toBeTruthy();expect(pending.productionMonsterAttack!.targetIds).toHaveLength(1);
 await reload(page,'ordinary-attack');await next(page);expect((await saved(page)).battle!.pendingMonsterAttack?.attackRoll).toBe(pending.attackRoll);
});
for(const [letter,name,window] of [['B','incomingHit','before-incoming-hit-resolution'],['C','incomingDamage','before-incoming-damage-applied']] as const)test(letter+' '+window+' reaction persists and resolves in normal UI',async({page})=>{
 await load(page,name);const before=await saved(page),opp=before.pendingTrinketUseOpportunities.find(o=>o.status==='open')!;expect(opp.useWindow).toBe(window);
 await reload(page,name);await page.getByTestId((letter==='B'?'trinket-use-':'trinket-decline-')+opp.id).click();
 for(let n=0;n<5&&(await saved(page)).battle!.pendingMonsterAttack;n++)await next(page);
 const after=await saved(page);expect(after.battle!.productionMonsterContext!.events.filter(e=>e.type==='MONSTER_ATTACK_STAGED')).toHaveLength(1);expect(after.pendingTrinketUseOpportunities.find(o=>o.id===opp.id)?.status).not.toBe('open');
});
test('D movement choice survives reload and resumes the pinned action',async({page})=>{
 await load(page,'movement');const before=await saved(page),choice=before.battle!.productionMonsterContext!.pendingChoice!;await reload(page,'movement-choice');
 await page.getByRole('region',{name:'Ruins 待决选择'}).getByRole('button',{name:choice.candidateIds[1],exact:true}).click();
 const after=await saved(page);expect(after.battle!.productionMonsterContext!.placements.actor).toBe(choice.candidateIds[1]);expect(after.battle!.pendingMonsterAttack!.attackRoll).toBe(2);
});
test('E ALL_HEROES continues after a later-target reload and self-wounds once',async({page})=>{
 await load(page,'allHeroes');await next(page);await next(page);const before=await saved(page);expect(before.battle!.productionMonsterContext!.pendingExecution!.operationIndex).toBeGreaterThan(0);await reload(page,'multi-target-continuation');
 for(let n=0;n<20&&(await saved(page)).battle!.productionMonsterContext!.pendingExecution;n++)await next(page);
 const b=(await saved(page)).battle!;expect(b.productionMonsterContext!.events.filter(e=>e.type==='MONSTER_ATTACK_STAGED')).toHaveLength(4);expect(b.productionMonsterContext!.events.filter(e=>e.type==='MONSTER_EFFECT_APPLIED'&&e.detail.primitiveId==='self-wound-sequencing')).toHaveLength(1);expect(b.monsters[0].isAlive).toBe(false);
});
test('F Manservant timed Protection survives reload and expires on its turn boundary',async({page})=>{
 await load(page,'protection');const before=await saved(page);expect(before.battle!.monsters[0].printedConditionTokens!.some(t=>t.type==='protection')).toBe(true);await reload(page,'timed-protection');
 for(let n=0;n<20;n++){await next(page);const b=(await saved(page)).battle!;if(!b.monsters[0].printedConditionTokens!.some(t=>t.type==='protection'))break;}
 expect((await saved(page)).battle!.monsters[0].printedConditionTokens!.some(t=>t.type==='protection')).toBe(false);
});
test('G explicit non-Ruins manifest moves and executes without Boss or prototype skills',async({page})=>{
 await load(page,'explicit');const before=await saved(page);expect(before.battle!.bossEncounter).toBeUndefined();expect(before.battle!.ruinsContext).toBeUndefined();
 for(let n=0;n<15&&(await saved(page)).battle!.productionMonsterContext!.pendingExecution;n++)await next(page);
 const b=(await saved(page)).battle!;expect(b.productionMonsterContext!.events.some(e=>e.type==='MONSTER_ACTION_COMPLETED')).toBe(true);expect(b.monsters[0].sourceId).toBe('swine-slasher');expect(b.productionMonsterContext!.events.some(e=>e.type==='MONSTER_MOVED')).toBe(true);expect(b.productionMonsterContext!.events.some(e=>e.type==='MONSTER_EFFECT_APPLIED')).toBe(true);
 for(let n=0;n<50&&(await saved(page)).battle?.status==='active';n++)await next(page);
 expect((await saved(page)).battle!.status).toBe('defeat');await page.getByRole('button',{name:'撤退回地牢',exact:true}).click();expect((await saved(page)).battle).toBeNull();
});
test('H deferred source semantic blocker stays visible and atomic after reload',async({page})=>{
 await load(page,'deferred');const before=await saved(page);await expect(page.getByTestId('monster-semantic-blocker')).toContainText('DEFERRED_SEMANTIC');await reload(page,'deferred-blocker');expect(await saved(page)).toEqual(before);await expect(page.getByTestId('battle-continue-resolution')).toHaveCount(0);
});
