import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Acquisition is explicit; deterministic generation never retries the network.
const directory = 'docs/data/complete-edition/source-assets/c1c26';
mkdirSync(directory, { recursive: true });
const sources = [
  ['designer-faq', 'https://boardgamegeek.com/filepage/250715/darkest-dungeon-board-game-faq-by-the-designers', '"Darkest Dungeon" "FAQ" "designers" "250715"'],
  ['designer-file-list', 'https://boardgamegeek.com/boardgame/317321/darkest-dungeon-the-board-game/files', '"Darkest Dungeon" "FAQ" "designers"'],
  ['publisher-faq-lead', 'https://info.mythicgames.net/fr/darkestdungeon/faq/english', '"Darkest Dungeon" "FAQ" Mythic'],
  ['later-official-files-lead', 'https://www.darkestdungeon.com/news/regarding-mythic-games-and-the-darkest-dungeon-board-game/', 'site:darkestdungeon.com "Regarding Mythic"'],
];
const receipts = sources.map(([id, url, searchQuery]) => {
  const retrievalTime = new Date().toISOString();
  const path = `${directory}/${id}.response`;
  const result = spawnSync('curl.exe', ['--silent', '--show-error', '--location', '--max-time', '20', '--output', path, '--write-out', '%{http_code}', url], { encoding: 'utf8' });
  const http = /^\d{3}$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : null;
  const body = existsSync(path) ? readFileSync(path) : null;
  return { id, url, searchQuery, retrievalTime, transport: 'curl.exe HTTPS normal public request', exitCode: result.status,
    httpStatus: http === 0 ? null : http, transportError: result.stderr.trim() || null,
    responsePath: body ? path : null, responseSha256: body ? createHash('sha256').update(body).digest('hex') : null,
    fileIdentity: id === 'designer-faq' ? { bggFilepage: 250715, title: 'Darkest Dungeon the Board Game FAQ by the Designers', uploader: 'apoxwrhthrio1980', downloadFileId: null, fileSha256: null } : null,
    authoritativeContentAcquired: false, rulesAuthority: false,
    status: 'CONTENT_NOT_AUTHENTICATED', permanentlyUnavailable: false };
});
writeFileSync('docs/data/complete-edition/c1c26-source-retrieval-evidence.json', JSON.stringify({ schemaVersion: 1, receipts,
  note: 'HTTP/TLS/access failures do not prove permanent unavailability. Response hashes identify transport bodies, not authenticated FAQ PDFs. Successful HTML alone is not an acquired rule file.' }, null, 2) + '\n');
for (const receipt of receipts) console.log(receipt.id, receipt.httpStatus ?? 'NO_HTTP_RESPONSE', receipt.exitCode);
