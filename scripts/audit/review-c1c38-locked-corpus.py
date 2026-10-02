"""Offline discovery over the complete locked manifest; never infers rules from misses."""
import hashlib
import json
import re
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path('docs/data/complete-edition')
manifest_path = ROOT / 'c1c32r2-local-official-source-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
terms = ['Thing from the Stars', 'Star Thing', 'Crystalline Aberration', 'Return to the Stars',
         'Vorpal Strike', 'Weakening Shard', 'Color of Madness', 'Colour of Madness', 'Farmstead',
         'Monster Posture', 'roaming', 'wander', 'wandering', 'encounter', 'Boss', 'Level']
output = ROOT / 'source-assets/c1c38'
output.mkdir(parents=True, exist_ok=True)
scratch = Path('tmp/c1c38-review')
scratch.mkdir(parents=True, exist_ok=True)
inventory = []
for index, original in enumerate(manifest['files']):
    path = Path(manifest['mandatoryRoot']) / original['relativePath']
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == original['sha256'], str(path)
    pages = []
    with pymupdf.open(path) as doc:
        for number, page in enumerate(doc, 1):
            raw = page.get_text()
            text = re.sub(r'\s+', ' ', raw)
            matched = [term for term in terms if term.lower() in text.lower()]
            pages.append({'page': number, 'text': raw, 'matchedTerms': matched,
                          'contextClassification': 'DISCOVERY_ONLY_PENDING_VISUAL_REVIEW'})
        # Render every manifest page in ordered contact sheets, including textless cards/diagrams.
        for start in range(0, len(doc), 12):
            sheet = Image.new('RGB', (1600, 4*410), 'white')
            draw = ImageDraw.Draw(sheet)
            for offset in range(min(12, len(doc)-start)):
                page = doc[start+offset]
                pix = page.get_pixmap(matrix=pymupdf.Matrix(.65,.65), alpha=False)
                im = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
                im.thumbnail((520,380))
                x,y = (offset%3)*533, (offset//3)*410
                sheet.paste(im, (x,y+25))
                draw.text((x+3,y+3), f'file {index:02d} PDF page {start+offset+1}', fill='black')
            sheet.save(scratch / f'corpus-{index:02d}-{start+1:03d}.jpg')
        if 'RULES' in path.name:
            for number in ([7,12,16,17,19,20,21,22,23,24,25,30,35,44] if len(doc)>40 else [1,2,3,4,5,6,7,8]):
                doc[number-1].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5),alpha=False).save(scratch/f'rules-{index:02d}-p{number}.png')
    inventory.append({'relativePath': original['relativePath'], 'sha256': actual,
                      'pageCount': len(pages), 'pages': pages})
# The separately locked core edition used in existing accepted source contracts.
path = Path('docs/DD_EN_COREBOX_RULES.pdf')
expected = json.loads((ROOT/'c1a-rulebook-evidence.json').read_text())['sha256']
assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
with pymupdf.open(path) as doc:
    inventory.append({'relativePath': str(path), 'sha256': expected, 'pageCount': len(doc),
                      'pages': [{'page': n+1, 'text': p.get_text(), 'matchedTerms': [t for t in terms if t.lower() in re.sub(r'\s+',' ',p.get_text()).lower()],
                                 'contextClassification': 'DISCOVERY_ONLY_PENDING_VISUAL_REVIEW'} for n,p in enumerate(doc)]})
receipt = {'schemaVersion':1,'phase':'11A.4-C1C38','policyId':'RULEBOOK_ONLY_SOURCE_POLICY_V1',
           'lockedManifest':str(manifest_path).replace('\\','/'),
           'lockedManifestSha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
           'externalAcquisition':False,'textSearchIsRulesAuthority':False,
           'absenceOfTextHitProvesAbsenceOfRule':False,'searchedTerms':terms,'files':inventory}
(output/'locked-corpus-discovery.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n')
print('Hash-verified PDFs:',len(inventory),'pages:',sum(f['pageCount'] for f in inventory))
for i,f in enumerate(inventory):
    print(i,Path(f['relativePath']).name,f['pageCount'], [(p['page'],p['matchedTerms']) for p in f['pages'] if any(t in p['matchedTerms'] for t in terms[:9])])
