"""Render only hash-matched pre-existing official pages for final residual review."""
import hashlib
import json
from pathlib import Path
import pymupdf

root=Path('docs/data/complete-edition')
manifest=json.loads((root/'c1c32r2-local-official-source-manifest.json').read_text(encoding='utf-8'))
requests=[('DD_COREBOX_TILES_FRONT.pdf',[6,14]),('DD_COREBOX_TILES_BACK.pdf',[6]),
    ('DD_EN_COREBOX_RULES.pdf',[3,5,6,11,16,37])]
rows=[]
for name,pages in requests:
    original=next(f for f in manifest['files'] if f['fileName']==name)
    path=Path(manifest['mandatoryRoot'])/original['relativePath']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==original['sha256']
    with pymupdf.open(path) as document:
        for page in pages:
            dest=root/'source-assets/c1c35r1'/f'{Path(name).stem}-p{page}.png'
            dest.parent.mkdir(parents=True,exist_ok=True)
            document[page-1].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5),alpha=False).save(dest)
            rows.append({'path':dest.as_posix(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),
                'sourceReference':{'relativePath':original['relativePath'],'sha256':original['sha256'],'page':page},
                'renderer':'PyMuPDF '+pymupdf.VersionBind,'scale':1.5})
(root/'c1c35r1-page-review-receipt.json').write_text(json.dumps({'schemaVersion':1,'extracts':rows},indent=2)+'\n',encoding='utf-8',newline='\n')
print('C1C35R1 reviewed page extracts:',len(rows))
