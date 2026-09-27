"""Read the bundled official PDF, preserving page/region evidence (no PDF edits)."""
import hashlib
import json
import sys
from pathlib import Path
import pdfplumber

source = Path('docs/DD_EN_COREBOX_RULES.pdf')
terms = ['Wound', 'Wounds', 'Damage', 'Health', 'HP', "Death's Door", 'Deathblow', 'take Damage', 'suffer Wounds']
pages = []
with pdfplumber.open(source) as pdf:
    for number, page in enumerate(pdf.pages, 1):
        text = page.extract_text() or ''
        # Columns keep the Death's Door continuation separate from adjacent prose.
        regions = []
        for label, bbox in [('left-column', [0, 0, page.width / 2, page.height]), ('right-column', [page.width / 2, 0, page.width, page.height])]:
            region_text = page.crop(bbox).extract_text() or ''
            regions.append({'region': label, 'bboxPoints': bbox, 'text': region_text})
        pages.append({'page': number, 'text': text, 'regions': regions})
        if '--verify' not in sys.argv and number in [19, 20, 21, 26, 27, 29, 28]:
            page.to_image(resolution=110).save(f'tmp/c1c18-page{number}.png')
def clean(value):
    return ' '.join(value.lower().replace('\u2019', "'").replace('\ufffd', "'").split())
search = {term: [p['page'] for p in pages if clean(term) in clean(p['text'])] for term in terms}
payload = {'source': str(source).replace('\\', '/'), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'extractor': 'pdfplumber', 'pageCount': len(pages), 'searchedTerms': search, 'pages': pages}
target = Path('docs/data/complete-edition/c1c18-rulebook-extracted-evidence.json')
if '--verify' in sys.argv:
    if json.loads(target.read_text(encoding='utf-8')) != payload:
        raise ValueError('Official PDF extraction evidence drift')
else:
    target.write_bytes((json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(json.dumps(search))
