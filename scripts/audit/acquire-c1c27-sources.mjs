import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Public transport only. No login, anti-bot bypass or guessed download IDs.
// This command updates receipts explicitly; the generator has no network code.
const directory = 'docs/data/complete-edition/source-assets/c1c27';
mkdirSync(directory, { recursive: true });
export const candidates = [
  ['designer-faq', 'https://boardgamegeek.com/filepage/250715/darkest-dungeon-board-game-faq-by-the-designers', 'DESIGNER_FAQ', 'BGG designer listing; uploader apoxwrhthrio1980; PDF identity unknown'],
  ['designer-file-list', 'https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files', 'DESIGNER_FILE_INDEX', 'Known official/designer acquisition path'],
  ['designer-faq-retry', 'https://boardgamegeek.com/filepage/250715/darkest-dungeon-board-game-faq-by-the-designers', 'DESIGNER_FAQ', 'Normal public retry with longer transfer timeout; no anti-bot bypass'],
  ['historical-faq-index', 'https://web.archive.org/cdx/search/cdx?url=boardgamegeek.com/filepage/250715/*&output=json&filter=statuscode:200', 'ARCHIVE_INDEX', 'Public archive index for known designer filepage; captures alone do not prove PDF bytes'],
  ['publisher-faq', 'https://info.mythicgames.net/fr/darkestdungeon/faq/english', 'PUBLISHER_FAQ', 'Inherited historical publisher link; may concern delivery rather than gameplay'],
  ['publisher-root', 'https://mythicgames.net/', 'PUBLISHER_DOWNLOAD_INDEX', 'Publisher corrections/download discovery'],
  ['kickstarter-updates', 'https://www.kickstarter.com/projects/1162110258/darkest-dungeon-the-board-game/posts', 'OFFICIAL_CAMPAIGN_INDEX', 'Official campaign updates; backer restrictions must be retained'],
  ['redhook-distribution', 'https://www.darkestdungeon.com/news/regarding-mythic-games-and-the-darkest-dungeon-board-game/', 'OFFICIAL_DISTRIBUTION_NOTICE', 'Inherited official URL, also linked by Wargamer'],
  ['redhook-search', 'https://www.darkestdungeon.com/?s=Regarding+Mythic', 'OFFICIAL_SITE_SEARCH', 'Public retry for missing historical notice'],
  ['faq-mirror-en', 'https://www.scribd.com/document/686825056/DD-FAQ-EN', 'TRANSPORT_MIRROR', 'Public two-page preview; uploader LilG is not authenticated designer'],
  ['faq-mirror-es', 'https://es.scribd.com/document/686825056/DD-FAQ-EN', 'TRANSPORT_MIRROR', 'Inherited locale transport retry; same document ID'],
  ['production-warrens', 'https://boardgamegeek.com/filepage/315734/darkest-dungeon-the-board-game-the-warrens-printin', 'LATER_PRODUCTION_LEAD', 'yoyoboy170; DD_EN_WARRENS_pt1/pt2; Jan 26 / Feb 1 2026; community-hosted claim only'],
  ['production-com', 'https://boardgamegeek.com/filepage/315735/darkest-dungeon-the-board-game-the-color-of-madnes', 'LATER_PRODUCTION_LEAD', 'yoyoboy170; DD_EN_COM_pt1/pt2; Jan 26 / Feb 1 2026; community-hosted claim only'],
  ['production-drive-a', 'https://drive.google.com/drive/folders/1Pe77e5X3mppFk4Q0qpSsJ-JgLnXyPN2J', 'LATER_PRODUCTION_LEAD', 'Public community-linked folder; must authenticate against original backer distribution receipt'],
  ['production-drive-b', 'https://drive.google.com/drive/folders/18N6kF1uFIKqiIJFEtkddViRuNgFpKRGh', 'LATER_PRODUCTION_LEAD', 'Public community-linked folder; no authority inferred from permission to distribute IP'],
  ['rulebook-mirror-gamershq', 'https://gamers-hq.de/media/pdf/1f/c0/6f/DD_EN_COREBOX_RULES.pdf', 'TRANSPORT_MIRROR', 'Retailer-hosted core rulebook; test exact equality to existing locked bytes before treating as duplicate'],
  ['rulebook-mirror-gamershq-retry', 'https://gamers-hq.de/media/pdf/1f/c0/6f/DD_EN_COREBOX_RULES.pdf', 'TRANSPORT_MIRROR', 'Longer ordinary public retry after partial PDF timeout; equality must use complete bytes'],
  ['rulebook-mirror-tesera', 'https://tesera.ru/images/items/2479862/Darkest_Dungeon_ENG.pdf', 'TRANSPORT_MIRROR', 'Rulebook search lead; date of indexing does not prove revision'],
  ['house-rule-lead', 'https://boardgamegeek.com/thread/3008011/house-rules-and-clarifications-suggested-rulebook', 'COMMUNITY_DISCOVERY', 'Reject mechanics and suggested hierarchy; original link discovery only'],
  ['wargamer-distribution', 'https://www.wargamer.com/darkest-dungeon-board-game/files', 'COMMUNITY_DISCOVERY', 'Secondary article Jan 28 2026 links historical Red Hook notice; no rules authority'],
  ['tts-discovery', 'https://steamcommunity.com/sharedfiles/filedetails/?id=3149292571', 'COMMUNITY_COLLECTION_INDEX', 'Search found Mythic-created demo within collection; collection itself is not official updated corpus'],
  ['tts-official-corebox', 'https://steamcommunity.com/sharedfiles/filedetails/?id=3053935246', 'OFFICIAL_TTS_LEAD', 'Search listing names Rohinn and Mythic Games; Oct 18 / Dec 5 2023; official claim and removed-item notice require original provenance and version check'],
  ['tts-community-complete', 'https://steamcommunity.com/sharedfiles/filedetails/?id=3657612854', 'COMMUNITY_TTS', 'Antha Complete Edition Jan/Aug 2026; acknowledgements do not authenticate official rules updates'],
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function retrieve([id, url, sourceType, identity]) {
  const timestamp = new Date().toISOString();
  const responsePath = `${directory}/${id}.response`;
  const headersPath = `${directory}/${id}.headers`;
  for (const path of [responsePath, headersPath]) if (existsSync(path)) rmSync(path); // exact acquisition-owned files
  const result = await new Promise(resolve => {
    const process = spawn('curl.exe', ['--silent', '--show-error', '--location', '--max-redirs', '8', '--max-time', id.endsWith('-retry') ? '120' : '25', '--dump-header', headersPath, '--output', responsePath, '--write-out', '%{json}', url]);
    let stdout = '', stderr = '';
    process.stdout.on('data', x => { stdout += x; }); process.stderr.on('data', x => { stderr += x; });
    process.on('error', error => resolve({ exitCode: null, stdout, stderr: String(error) }));
    process.on('close', exitCode => resolve({ exitCode, stdout, stderr }));
  });
  let info = {}; try { info = JSON.parse(result.stdout); } catch { /* transport receipt retains parse failure */ }
  const headers = existsSync(headersPath) ? readFileSync(headersPath) : null;
  const body = existsSync(responsePath) ? readFileSync(responsePath) : null;
  const httpStatus = info.http_code || null;
  const hops = (headers?.toString() ?? '').split(/\r?\n\r?\n/).filter(x => /^HTTP\//.test(x)).map(block => ({
    statusLine: block.split(/\r?\n/)[0], location: block.match(/^location:\s*(.+)$/im)?.[1]?.trim() ?? null,
    contentType: block.match(/^content-type:\s*(.+)$/im)?.[1]?.trim() ?? null,
  }));
  const failureClass = result.exitCode === 6 ? 'DNS_FAILURE' : result.exitCode === 28 ? 'TRANSPORT_TIMEOUT' :
    [35, 60].includes(result.exitCode) ? 'TLS_FAILURE' : result.exitCode !== 0 ? 'TRANSPORT_ERROR' :
    httpStatus === 403 ? 'ACCESS_DENIED_403' : httpStatus === 404 ? 'MISSING_404' :
    httpStatus === 401 ? 'AUTHENTICATION_REQUIRED' : httpStatus >= 400 ? 'HTTP_ERROR' : 'RESPONSE_RECEIVED_NOT_AUTHENTICATED';
  const receipt = { evidenceId: `retrieval-${id}`, candidateId: id, url, timestamp, httpStatus,
    exitCode: result.exitCode, transportError: result.stderr.trim() || null, failureClass,
    antiBotObserved: /captcha|cloudflare|access denied|robot/i.test(body?.toString('utf8').slice(0, 20000) ?? ''),
    redirectChain: hops, effectiveUrl: info.url_effective ?? null, contentType: info.content_type ?? null,
    responsePath: body ? responsePath : null, responseSha256: body ? hash(body) : null,
    responseBytes: body?.length ?? 0, headersPath: headers ? headersPath : null, headersSha256: headers ? hash(headers) : null,
    candidateIdentity: { sourceType, description: identity }, retryPath: id.startsWith('faq-mirror') ? 'locale variant of public preview; authenticated original still needed' :
      id.startsWith('designer') ? 'public BGG filepage and game file index; no download ID guessed' : 'public linked URL; compare index and original provenance before promotion',
    permanentlyUnavailable: false, authenticatedRuleFile: false };
  writeFileSync(`${directory}/${id}.receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  console.log(id, httpStatus ?? failureClass, receipt.responseBytes);
  return receipt;
}
const filter = process.argv.slice(2);
const selected = filter.length ? candidates.filter(c => filter.includes(c[0])) : candidates;
if (filter.some(id => !candidates.some(c => c[0] === id))) throw new Error('Unknown candidate filter');
const previous = filter.length && existsSync('docs/data/complete-edition/c1c27-source-retrieval-evidence.json') ? JSON.parse(readFileSync('docs/data/complete-edition/c1c27-source-retrieval-evidence.json', 'utf8')).receipts : [];
const receipts = previous.filter(r => !filter.includes(r.candidateId));
// Independent public requests, bounded concurrency.
for (let i = 0; i < selected.length; i += 4) receipts.push(...await Promise.all(selected.slice(i, i + 4).map(retrieve)));
receipts.sort((a, b) => candidates.findIndex(c => c[0] === a.candidateId) - candidates.findIndex(c => c[0] === b.candidateId));
writeFileSync('docs/data/complete-edition/c1c27-source-retrieval-evidence.json', JSON.stringify({ schemaVersion: 1, receipts,
  note: 'Response bytes and HTTP success prove transport only. HTML previews are not original PDF bytes; failures do not prove permanent unavailability.' }, null, 2) + '\n');
