"""Offline reconnaissance of already locked official PDFs; text hits are not rules."""
import hashlib
import json
import re
from pathlib import Path
import pymupdf

root = Path('docs/data/complete-edition')
manifest_path = root / 'c1c32r2-local-official-source-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
cards = json.loads((root / 'c1c24-boss-printed-definitions.json').read_text(encoding='utf-8'))['cards']
families = sorted({card['family'] for card in cards} - {'Necromancer', 'Prophet'})
terms = families + ['Star Thing', 'Crystalline Aberration', 'Colour of Madness', 'Color of Madness', 'Farmstead']
inventory = []
for original in manifest['files']:
    path = Path(manifest['mandatoryRoot']) / original['relativePath']
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == original['sha256'], original['relativePath']
    hits = []
    with pymupdf.open(path) as document:
        for number, page in enumerate(document, 1):
            text = re.sub(r'\s+', ' ', page.get_text()).lower()
            matched = [term for term in terms if term.lower() in text]
            if matched:
                hits.append({'page': number, 'matchedTerms': matched})
        inventory.append({'relativePath': original['relativePath'], 'sha256': actual,
                          'pageCount': len(document), 'textHits': hits})
output = root / 'c1c37-locked-corpus-review-intake.json'
output.write_text(json.dumps({'schemaVersion': 1, 'phase': '11A.4-C1C37',
    'lockedManifest': str(manifest_path).replace('\\', '/'),
    'lockedManifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
    'externalAcquisition': False, 'method': 'HASH_VERIFIED_ALREADY_LOCKED_PDF_TEXT_SEARCH',
    'textSearchIsRulesAuthority': False, 'absenceOfTextHitProvesAbsenceOfRule': False,
    'searchedTerms': terms, 'files': inventory}, indent=2) + '\n', encoding='utf-8', newline='\n')
print('Reviewed already locked PDFs:', len(inventory))
for row in inventory:
    selected_hits = [hit for hit in row['textHits'] if any(term in hit['matchedTerms'] for term in terms[-5:] + ['Thing from the stars'])]
    if selected_hits:
        print(row['relativePath'], selected_hits)
