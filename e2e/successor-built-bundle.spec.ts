import {expect,test,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import type {CampaignState} from '../src/types';

// Live successor receipts never overwrite an immutable historical acceptance artifact.
const reportPath='pw-out/c1c38-built-bundle-browser-smoke.json';
const isolation=()=>JSON.parse(execFileSync(process.execPath,[resolve('node_modules/vite-node/vite-node.mjs'),'scripts/audit/c1c37-successor.ts','--built-isolation'],{encoding:'utf8',maxBuffer:4*1024*1024}));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function saved(page:Page):Promise<CampaignState>{return page.evaluate(()=>JSON.parse(localStorage.getItem('dd-web-prototype-save-v1')!).campaign);}
async function reload(page:Page){const before=await saved(page);await page.reload();expect(await saved(page)).toEqual(before);return digest(before);}

test('C1C38 successor built production selector, source Standard, Prophet Room reservation and valid reload',async({page})=>{
  test.setTimeout(180_000);
  const bundle=isolation(),externalRequests:string[]=[],appErrors:string[]=[];
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(!url.startsWith('http://localhost:5199/')&&!url.startsWith('http://127.0.0.1:5199/')){externalRequests.push(url);return route.abort();}
    return route.continue();
  });
  page.on('pageerror',error=>appErrors.push(error.message));
  const runtimeRequests:string[]=[];page.on('request',r=>runtimeRequests.push(r.url()));
  await page.goto('/');await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button',{name:'新建战役',exact:true}).click();
  for(const hero of ['Crusader','Leper','Highwayman','Vestal'])await page.getByText(hero,{exact:true}).first().click();
  await page.getByRole('button',{name:'继续（技能配置）',exact:true}).click();
  await page.getByRole('button',{name:'使用默认配置（全部英雄）',exact:true}).click();
  await page.getByRole('button',{name:'继续（任务选择）',exact:true}).click();
  await page.getByTestId('migrate-hero-dodge-v2').click();await page.getByTestId('select-production-ruins-v6').click();
  const initial=await saved(page);expect(initial.runtimeContentProfile).toBe('community-complete-edition');
  const standard=page.locator('[data-testid^="quest-community-"]').first();await expect(standard).toBeVisible();await standard.click();
  const selected=await saved(page);expect(selected.currentQuestId).toMatch(/^community-/);expect(selected.dungeon?.questRunId).toBeTruthy();
  expect(selected.dungeon!.rooms.some(r=>r.sourceRoomToken)).toBe(true);
  const standardReload=await reload(page);
  // The same explicitly limited progression prerequisite used in C1C36. Node
  // constructors/transactions prepare a valid save; all tested transitions below
  // execute from the actual dist through visible player controls, with no /src imports.
  execFileSync(process.execPath,[resolve('node_modules/vite-node/vite-node.mjs'),'scripts/audit/c1c37-successor.ts','--prepare-browser'],{stdio:'pipe'});
  const prerequisite=JSON.parse(readFileSync('tmp-c1c37-prophet-prerequisite.json','utf8'));
  await page.evaluate(s=>localStorage.setItem('dd-web-prototype-save-v1',JSON.stringify(s)),prerequisite);
  await page.reload();expect(await saved(page)).toEqual(prerequisite.campaign);
  await expect(page.getByTestId('quest-face-the-threat')).toBeVisible();await page.getByTestId('quest-face-the-threat').click();
  const prophet=await saved(page);expect(prophet.bossRoomStorage).toMatchObject({roomCardId:44710,tileId:'ruins-tile-11',lifecycle:'RESERVED'});
  expect(prophet.bossEncounterCheckpoint?.bossFamily).toBe('prophet');
  expect(prophet.bossEncounterCheckpoint?.ruleSetVersion).toBe('C1C35R2-PROPHET-DIGITAL-DEFAULT-v1');
  const prophetReload=await reload(page);
  expect(externalRequests).toEqual([]);expect(appErrors).toEqual([]);
  expect(runtimeRequests.some(url=>/\/(src|@vite|@react-refresh)\//.test(url))).toBe(false);
  expect(runtimeRequests.some(url=>/\.pdf(?:\?|$)/i.test(url))).toBe(false);
  writeFileSync(reportPath,JSON.stringify({schemaVersion:1,phase:'11A.4-C1C38',status:'PASS',server:'vite preview',e2eControls:false,
    buildIdentity:bundle.buildIdentity,reachableChunks:bundle.reachableChunks,completeEditionCreated:true,normalQuestSelectorVisible:true,sourceStandardQuestSelected:true,
    prophetSelectorVisible:true,roomReserved:true,validSaveReloaded:true,prerequisiteScope:'VALID_NODE_CONSTRUCTED_ACCEPTED_PRE_QUEST_PROGRESSION_ONLY',
    standardQuestId:selected.currentQuestId,standardReloadHash:standardReload,prophetReloadHash:prophetReload,room:prophet.bossRoomStorage,
    externalRequests,appErrors,sourceModuleRequests:0,rawRulebookRequests:0},null,2)+'\n');
});
