"""Offline official print navigation; extracted text is not census authority."""
import hashlib
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path('docs/data/complete-edition')
OUT = ROOT / 'source-assets/c2a'
OUT.mkdir(parents=True, exist_ok=True)
inventory = json.loads((ROOT / 'source-assets/c1c38r1/repository-source-inventory.json').read_text())
records = []
for entry in inventory['archiveFiles']:
    path = Path(entry['path'])
    if not ('THE_DARKEST_HEROES_CARDS' in path.name or 'MUSKETEER_CARDS' in path.name):
        continue
    if not any(t in path.name for t in ['Hero_STAT', 'Hero_PVP', 'SKILLS']):
        continue
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert digest == entry['sha256'], path
    target = OUT / path.name
    target.write_bytes(data)
    with pymupdf.open(target) as pdf:
        pages = [{'page': i+1, 'navigationText': p.get_text()} for i,p in enumerate(pdf)]
        records.append({'sourceId': path.stem, 'originalLocation': path.as_posix(), 'path': target.as_posix(), 'sha256': digest, 'pageCount': len(pdf), 'pages': pages})
        if 'Hero_' in path.name:
            for start in range(0,len(pdf),12):
                canvas = Image.new('RGB',(1400,1400),'white')
                draw = ImageDraw.Draw(canvas)
                for j in range(start,min(start+12,len(pdf))):
                    pix = pdf[j].get_pixmap(matrix=pymupdf.Matrix(1.1,1.1),alpha=False)
                    img = Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
                    img.thumbnail((330,420))
                    x,y = ((j-start)%4)*350, ((j-start)//4)*465
                    canvas.paste(img,(x,y+25)); draw.text((x+10,y+5),f'page {j+1}',fill='black')
                canvas.save(OUT / f'{path.stem}-review-{start+1}.png')
(OUT/'print-navigation.json').write_text(json.dumps({'textAuthority':False,'sources':records},indent=2)+'\n')
print([(r['sourceId'],r['pageCount']) for r in records])
