"""Offline final review intake. Text hits identify pages for visual review, never rules."""
import hashlib
import json
import re
from pathlib import Path
import pymupdf

root = Path('docs/data/complete-edition')
manifest = json.loads((root / 'c1c32r2-local-official-source-manifest.json').read_text(encoding='utf-8'))
inventory = []
for original in manifest['files']:
    path = Path(manifest['mandatoryRoot']) / original['relativePath']
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == original['sha256'], original['relativePath']
    hits = []
    with pymupdf.open(path) as document:
        for number, page in enumerate(document, 1):
            text = page.get_text()
            if re.search(r'prophet|11\s*[—–-]\s*prophet|occupancy|capacity|unmarked', text, re.I):
                hits.append({'page':number,'matchedTerms':sorted(set(re.findall(r'prophet|occupancy|capacity|unmarked',text,re.I)))})
        inventory.append({'relativePath':original['relativePath'],'sha256':actual,'pageCount':len(document),'textHits':hits})
output = root / 'c1c35r1-locked-corpus-review-intake.json'
output.write_text(json.dumps({'schemaVersion':1,'lockedManifest':'docs/data/complete-edition/c1c32r2-local-official-source-manifest.json',
    'externalAcquisition':False,'method':'HASH_VERIFIED_LOCKED_PDF_TEXT_SEARCH_FOR_VISUAL_REVIEW','files':inventory},indent=2)+'\n',encoding='utf-8',newline='\n')
print('Reviewed locked PDFs:',len(inventory))
for row in inventory:
    if row['textHits']:
        print(row['relativePath'],json.dumps(row['textHits']))
