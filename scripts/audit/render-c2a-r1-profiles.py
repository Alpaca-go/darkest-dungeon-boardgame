"""Rank official candidate pairs for navigation, then require direct visual review."""
import json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
import pymupdf,numpy as np
root=Path('docs/data/complete-edition');folder=root/'source-assets/c2a-r1'
read=lambda p:json.loads(p.read_text(encoding='utf-8'));sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assets={r['url']:r for r in read(folder/'transport-manifest.json')['records'] if r['retrievalStatus']=='RETRIEVED'}
objects=read(root/'c2a-hero-physical-census.json')['objects'];pdfs={};sheets={};panels=[];records=[]
def trim(img):
    a=np.asarray(img);h,w=a.shape[:2]
    ys=np.where(np.mean(a[:,w//2],axis=1)<120)[0];xs=np.where(np.mean(a[h//2,:],axis=1)<120)[0]
    return img.crop((int(xs[0]),int(ys[0]),int(xs[-1]+1),int(ys[-1]+1)))
def feature(img):return np.asarray(img.resize((48,64)),dtype=float)/255
for o in objects:
    if o['category']!='LEVEL_PROFILE_CARD':continue
    t=o['transport'];transport=[]
    for side in ['front','back']:
        asset=assets.get(t[side+'Image'])
        if not asset:break
        p=asset['path']
        if p not in sheets:sheets[p]=Image.open(p).convert('RGB')
        sheet=sheets[p];w,h=sheet.size;unique=side=='front' or t['uniqueBack']
        ix=t['cardIndex'] if unique else 0;cols=t['numWidth'] if unique else 1;rows=t['numHeight'] if unique else 1
        bounds=[round(ix%cols*w/cols),round(ix//cols*h/rows),round((ix%cols+1)*w/cols),round((ix//cols+1)*h/rows)]
        img=sheet.crop(bounds);cp=folder/(o['physicalId']+'-'+side+'.png');img.save(cp)
        transport.append((img,{'cropPath':cp.as_posix(),'cropHash':sha(cp),'assetPath':p,'assetHash':asset['sha256'],'url':asset['url'],'bounds':bounds}))
    if len(transport)!=2:continue
    candidates=[]
    for candidate in o['officialPrintCandidates']:
        imgs=[]
        for side in ['front','back']:
            ref=candidate[side];p=ref['path']
            if p not in pdfs:pdfs[p]=pymupdf.open(p)
            pix=pdfs[p][ref['page']-1].get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
            imgs.append(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
        score=sum(float(np.mean((feature(transport[i][0])-feature(trim(imgs[i])))**2)) for i in range(2))
        candidates.append((score,candidate,imgs))
    candidates.sort(key=lambda c:c[0])
    # Direct visual review read III on both 1bc8a5 faces. Similarity preferred II;
    # explicit reviewed correction is navigation only, pending comparison below.
    chosen=next(c for c in candidates if c[1]['front']['page']==23) if o['transportGuid']=='1bc8a5' else candidates[0]
    score,ref,imgs=chosen
    hero=read(root/('heroes/c2a/'+o['heroId']+'.json'))
    slot=next(s for s in hero['officialProfileInventory'] if s['front']['page']==ref['front']['page'])
    evidence=[]
    for i,side in enumerate(['front','back']):
        cp=folder/(o['physicalId']+'-official-'+side+'.png');imgs[i].save(cp)
        evidence.append({'cropPath':cp.as_posix(),'cropHash':sha(cp)})
    panel=Image.new('RGB',(1200,460),'white');draw=ImageDraw.Draw(panel)
    draw.text((5,5),o['heroId']+' '+o['transportGuid']+' | candidate page '+str(ref['front']['page'])+' | front '+str(slot['frontLevelMarker'])+' / back '+str(slot['backLevelMarker']),fill='black')
    draw.text((5,22),'TRANSPORT FRONT | OFFICIAL FRONT | TRANSPORT BACK | OFFICIAL BACK',fill='black')
    for i,img in enumerate([transport[0][0],imgs[0],transport[1][0],imgs[1]]):
        img=img.copy();img.thumbnail((290,410));panel.paste(img,(i*300,45))
    panels.append(panel)
    records.append({'heroId':o['heroId'],'physicalId':o['physicalId'],'transportGuid':o['transportGuid'],
        'transportPath':o['transportPath'],'transportFrontHash':transport[0][1]['cropHash'],'transportBackHash':transport[1][1]['cropHash'],
        'transportFront':transport[0][1],'transportBack':transport[1][1],
        'officialFront':ref['front'],'officialBack':ref['back'],'officialFrontCrop':evidence[0],'officialBackCrop':evidence[1],
        'printedHeroIdentity':hero['identity']['printedName'],'printedFrontLevel':slot['frontLevelMarker'],'printedBackLevel':slot['backLevelMarker'],
        'frontRole':slot['frontRole'],'backRole':slot['backRole'],'navigationScore':score,
        'visualReview':'REVIEW_REQUIRED','status':'SOURCE_UNRESOLVED'})
for start in range(0,len(panels),4):
    items=panels[start:start+4];canvas=Image.new('RGB',(1200,len(items)*460),'white')
    for i,p in enumerate(items):canvas.paste(p,(0,i*460))
    canvas.save(folder/('profile-comparison-'+str(start//4+1)+'.png'))
(folder/'profile-review-candidates.json').write_text(json.dumps({'records':records},indent=2)+'\n',encoding='utf-8',newline='\n')
print('profile review candidates',len(records))
