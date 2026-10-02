"""Discovery only. Inventory all local archive PDFs and repository source media."""
import hashlib
import json
import re
import os
from pathlib import Path
import pymupdf

ROOT = Path('docs/data/complete-edition')
OUT = ROOT / 'source-assets/c1c38r1'
OUT.mkdir(parents=True, exist_ok=True)
manifest = json.loads((ROOT / 'c1c32r2-local-official-source-manifest.json').read_text(encoding='utf-8-sig'))
archive = Path(manifest['mandatoryRoot'])
locked = {f['sha256'] for f in manifest['files']}
terms = ['Thing from the Stars', 'Star Thing', 'Crystalline Aberration', 'Return to the Stars', 'Color of Madness', 'Colour of Madness', 'Farmstead', 'Crystal', 'Aberration', 'Monster Posture']
files = []
for path in sorted(archive.rglob('*')):
    if not path.is_file():
        continue
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    entry = {'path': str(path).replace('\\', '/'), 'sha256': digest, 'bytes': path.stat().st_size, 'inC1C38LockedManifest': digest in locked, 'authority': 'DISCOVERY_ONLY'}
    if path.suffix.lower() == '.pdf':
        with pymupdf.open(path) as doc:
            entry['pageCount'] = len(doc)
            entry['hits'] = []
            texts = []
            for n, page in enumerate(doc, 1):
                raw = page.get_text()
                texts.append({'page': n, 'text': raw})
                hits = [t for t in terms if t.lower() in re.sub(r'\s+', ' ', raw).lower()]
                if hits:
                    entry['hits'].append({'page': n, 'terms': hits, 'text': raw})
            if 'COM' in path.name or 'RULES' in path.name or 'Insert' in path.name:
                (OUT / (digest + '-text.json')).write_text(json.dumps(texts, indent=2) + '\n', encoding='utf-8', newline='\n')
            if path.name == 'DD_EN_COM_RULES.pdf':
                for n, page in enumerate(doc, 1):
                    page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(OUT / f'com-p{n}.png')
    files.append(entry)
repo = []
metadata = []
extensions = {'.pdf', '.png', '.jpg', '.jpeg', '.bin', '.zip', '.7z', '.tar', '.gz'}
excluded = {'.git', 'node_modules', 'dist', 'tmp', '.npm-cache', '.workbuddy', 'test-results', 'pw-out', 'playwright-report'}
for folder, directories, filenames in os.walk('.'):
    directories[:] = sorted(d for d in directories if d not in excluded and Path(folder, d) != OUT)
    for filename in sorted(filenames):
        path = Path(folder, filename)
        if path.suffix.lower() in {'.json', '.txt', '.md', '.csv'} and 'c1c38r1' not in str(path).lower() and re.search(r'manifest|source|component|setup|scenario|rule|insert|printed|definition', str(path), re.I):
            excluded_by_policy = 'designer-faq' in path.as_posix().lower()
            raw = '' if excluded_by_policy else path.read_text(encoding='utf-8-sig', errors='replace')
            normalized = re.sub(r'\s+', ' ', raw).lower()
            metadata.append({'path': path.as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'authority': 'EXCLUDED_FORBIDDEN_SOURCE' if excluded_by_policy else 'DISCOVERY_ONLY', 'navigationExcludedByPolicy': excluded_by_policy, 'matchedTerms': [t for t in terms if t.lower() in normalized]})
        if not path.is_file() or path.suffix.lower() not in extensions or OUT in path.parents:
            continue
        repo.append({'path': str(path).replace('\\', '/'), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size, 'authority': 'DISCOVERY_ONLY'})
receipt = {'phase': 'C1C38R1', 'intakeDate': '2026-10-02', 'searchedTerms': terms, 'archiveRoot': str(archive), 'archiveFiles': files, 'repositoryMedia': repo, 'repositorySourceMetadata': metadata, 'excludedNonSourceDirectories': sorted(excluded), 'successorWorkProductsExcludedFromMetadataInventory': True, 'textSearchIsRulesAuthority': False, 'textMissProvesAbsence': False}
(OUT / 'repository-source-inventory.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
print('archive files', len(files), 'PDFs', sum('pageCount' in f for f in files), 'repository media', len(repo))
for f in files:
    if f.get('hits') and not f['inC1C38LockedManifest']:
        print(Path(f['path']).name, [(h['page'], h['terms']) for h in f['hits']])
