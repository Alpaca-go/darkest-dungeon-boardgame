"""Bind condition research to the unchanged local official PDF, without editing it."""
import hashlib
import json
import sys
from pathlib import Path
import pdfplumber

source = Path('docs/DD_EN_COREBOX_RULES.pdf')
terms = ['Condition', 'duration', 'stack', 'Resistance', 'Immunity', 'simultaneously', 'additional', 'causing', 'hit', 'Trinket', 'zero', '0 turns']
pages = []
with pdfplumber.open(source) as pdf:
    for number, page in enumerate(pdf.pages, 1):
        regions = []
        for label, bbox in [('left-column', [0, 0, page.width / 2, page.height]), ('right-column', [page.width / 2, 0, page.width, page.height])]:
            regions.append({'region': label, 'bboxPoints': bbox, 'text': page.crop(bbox).extract_text() or ''})
        pages.append({'page': number, 'text': page.extract_text() or '', 'regions': regions})
        if '--verify' not in sys.argv and number in [20, 21, 26]:
            Path('tmp/c1c19-research').mkdir(parents=True, exist_ok=True)
            page.to_image(resolution=110).save(f'tmp/c1c19-research/page-{number}.png')
def compact(text):
    return ' '.join(text.lower().split())
search = {term: [p['page'] for p in pages if compact(term) in compact(p['text'])] for term in terms}
payload = {'source': source.as_posix(), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'extractor': 'pdfplumber', 'pageCount': len(pages), 'searchedTerms': search, 'pages': pages}
target = Path('docs/data/complete-edition/c1c19-rulebook-extracted-evidence.json')
if '--verify' in sys.argv:
    if json.loads(target.read_text(encoding='utf-8')) != payload:
        raise ValueError('C1C19 official page/region extraction drift')
else:
    target.write_bytes((json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print(json.dumps(search))
