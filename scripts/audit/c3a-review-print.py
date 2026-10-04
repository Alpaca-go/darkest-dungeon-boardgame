"""Render only new ordinary candidate faces; leave frozen Boss work untouched."""
import json
import hashlib
import re
from pathlib import Path
import pymupdf as fitz
from PIL import Image, ImageDraw

inv = json.loads(Path('docs/data/complete-edition/source-assets/c1c38r1/repository-source-inventory.json').read_text(encoding='utf-8'))
scratch = Path('tmp/c3a')
scratch.mkdir(parents=True, exist_ok=True)
data = []
for s in inv['archiveFiles']:
    path = Path(s['path'])
    if not re.search(r'monster.*_FRONT', path.name, re.I) or 'Old_Version' in str(path) or 'BOARD' in path.name:
        continue
    assert hashlib.sha256(path.read_bytes()).hexdigest() == s['sha256'], str(path)
    doc = fitz.open(path)
    pages = []
    for number, page in enumerate(doc, 1):
        spans = []
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    spans.append({k:span[k] for k in ['text','bbox','font','size']})
        pages.append({'page':number,'text':page.get_text(),'spans':spans})
    data.append({'relativePath':path.relative_to(Path(inv['archiveRoot'])).as_posix(),
                 'fileName':path.name,'sha256':s['sha256'],'pages':pages})
    print('Hash verified and extracted:', path.name, flush=True)
(scratch / 'extracted.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
selection = {
    'COREBOX': [63,66,69,72,75,78,80,83,86],
    'CRIMSONCourt': [1,4,7,10,13,16,19,22],
    'WARRENS': [1,4,7,10,13,16,17,18],
    'COVE': [1,4,7,10,13,16,18,20],
    'WEALD': [1,4,6,9,12,15,17,18],
    'COM': [1,3,5,7,8,9,11,13,15,17,18,19],
}
for key, pages in selection.items():
    f = next(f for f in data if f'DD_EN_{key}_CARDS_70_120_monsters' in f['fileName'] and '_ADD' not in f['fileName'])
    doc = fitz.open(Path(inv['archiveRoot']) / f['relativePath'])
    for start in range(0,len(pages),6):
        sheet = Image.new('RGB',(1500,1700),'white')
        draw = ImageDraw.Draw(sheet)
        for slot,p in enumerate(pages[start:start+6]):
            pix=doc[p-1].get_pixmap(matrix=fitz.Matrix(2.5,2.5),alpha=False)
            im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
            im.thumbnail((495,820))
            x,y=(slot%3)*500,(slot//3)*850
            sheet.paste(im,(x,y+25))
            draw.text((x+5,y+5),f'{key} PDF page {p}',fill='black')
        sheet.save(f'tmp/c3a/{key}-{start}.png')
    print(key, len(pages), flush=True)
large = [('CRIMSONCourt', [1]), ('WARRENS', [1,8]), ('COVE', [1]), ('WEALD', [1,3]), ('COM', [1,2])]
sheet = Image.new('RGB',(2000,2000),'white')
draw = ImageDraw.Draw(sheet)
slot=0
for key,pages in large:
    f=next(f for f in data if f'DD_EN_{key}_CARDS_140x140' in f['fileName'])
    doc=fitz.open(Path(inv['archiveRoot']) / f['relativePath'])
    for p in pages:
        pix=doc[p-1].get_pixmap(matrix=fitz.Matrix(2,2),alpha=False)
        im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        im.thumbnail((495,640))
        x,y=(slot%4)*500,(slot//4)*1000
        sheet.paste(im,(x,y+25))
        draw.text((x+5,y+5),f'{key} LARGE PDF page {p}',fill='black')
        slot+=1
sheet.save('tmp/c3a/large.png')
