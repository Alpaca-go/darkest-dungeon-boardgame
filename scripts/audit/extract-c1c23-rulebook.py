"""Re-extract only the already hash-locked core rulebook; no web or mock evidence."""
import hashlib
import json
import sys
from pathlib import Path
import pdfplumber

source = Path('docs/DD_EN_COREBOX_RULES.pdf')
digest = hashlib.sha256(source.read_bytes()).hexdigest()
locked = json.loads(Path('docs/data/complete-edition/c1a-rulebook-evidence.json').read_text())
assert digest == locked['sha256'], 'Locked rulebook changed'
pages = []
with pdfplumber.open(source) as pdf:
    for number in [5, 10, 11, 12, 21, 32, 33, 34, 35]:
        page = pdf.pages[number - 1]
        pages.append({'page': number, 'text': page.extract_text() or ''})
        if '--verify' not in sys.argv and number in [5, 12, 21, 32, 33]:
            Path('tmp/pdfs/c1c23').mkdir(parents=True, exist_ok=True)
            page.to_image(resolution=110).save(f'tmp/pdfs/c1c23/page-{number}.png')
payload = {'source': source.as_posix(), 'sourceSha256': digest, 'authority': 'Existing C1A S4 core rulebook; core rules only, not proof of Complete Edition expansion filtering', 'extractor': 'pdfplumber', 'pages': pages}
target = Path('docs/data/complete-edition/c1c23-rulebook-evidence.json')
if '--verify' in sys.argv:
    assert json.loads(target.read_text(encoding='utf-8')) == payload, 'Rulebook extraction drift'
else:
    target.write_bytes((json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
print('C1C23 locked rulebook evidence verified')
