"""Direct comparison material; rankings never promote bindings automatically."""
import json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
import pymupdf
root=Path('docs/data/complete-edition'); folder=root/'source-assets/c2a-r1'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read(folder/'transport-manifest.json')['records']
assets={r['url']:r for r in manifest if r['retrievalStatus']=='RETRIEVED'}
forms=read(root/'c2a-hero-skill-level-form-map.json')['forms']
gaps=read(root/'c2a-hero-source-gap-register.json')['gaps']
targets={g.get('statePath') for g in gaps if g.get('skillId')}
records=[];pdfs={};sheets={};panels={}
for f in forms:
    if f['statePath'] not in targets:continue
    t=f['transport']; asset=assets.get(t['backImage'])
    if not asset:continue
    if asset['path'] not in sheets:sheets[asset['path']]=Image.open(asset['path']).convert('RGB')
    sheet=sheets[asset['path']];w,h=sheet.size
    ix=t['cardIndex'] if t['uniqueBack'] else 0
    cols=t['numWidth'] if t['uniqueBack'] else 1;rows=t['numHeight'] if t['uniqueBack'] else 1
    bounds=[round(ix%cols*w/cols),round(ix//cols*h/rows),round((ix%cols+1)*w/cols),round((ix//cols+1)*h/rows)]
    crop=sheet.crop(bounds)
    key=f['heroId']+'-'+t['guid']+'-'+hashlib.sha256(f['statePath'].encode()).hexdigest()[:8]
    cp=folder/(key+'-transport-back.png');crop.save(cp)
    ref=f['officialBackCandidate'];p=ref['path']
    if p not in pdfs:pdfs[p]=pymupdf.open(p)
    pix=pdfs[p][ref['page']-1].get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
    official=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
    op=folder/(key+'-official-back.png');official.save(op)
    panel=Image.new('RGB',(650,380),'white');draw=ImageDraw.Draw(panel)
    draw.text((5,5),f['skillId']+' '+f['printedLevelMarker'],fill='black')
    draw.text((5,22),'BACK: '+f['printedBackName']+' | official page '+str(ref['page']),fill='black')
    for img,x in [(crop,5),(official,325)]:
        img=img.copy();img.thumbnail((310,325));panel.paste(img,(x,50))
    panels.setdefault(f['heroId'],[]).append(panel)
    records.append({'heroId':f['heroId'],'skillId':f['skillId'],'level':f['level'],'statePath':f['statePath'],
        'transportBackHash':sha(cp),'transportBackCropPath':cp.as_posix(),'transportAssetHash':asset['sha256'],
        'transportAssetPath':asset['path'],'transportUrl':asset['url'],'cropBounds':bounds,
        'officialBackPage':ref,'officialBackCropHash':sha(op),'officialBackCropPath':op.as_posix(),
        'printedBackName':f['printedBackName'],'printedLevelMarker':f['printedLevelMarker'],
        'visualReview':'REVIEW_REQUIRED','status':'SOURCE_UNRESOLVED'})
for hero,items in panels.items():
    for start in range(0,len(items),7):
        batch=items[start:start+7];canvas=Image.new('RGB',(1300,((len(batch)+1)//2)*380),'white')
        for i,panel in enumerate(batch):canvas.paste(panel,((i%2)*650,(i//2)*380))
        canvas.save(folder/(hero+'-comparison-'+str(start//7+1)+'.png'))
(folder/'skill-back-review-candidates.json').write_text(json.dumps({'records':records},indent=2)+'\n',encoding='utf-8',newline='\n')
print('review candidates',len(records))
