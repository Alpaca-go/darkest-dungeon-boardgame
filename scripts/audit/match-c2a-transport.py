"""Similarity navigation only; every promoted match requires direct visual review."""
import json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
import pymupdf
ROOT=Path('docs/data/complete-edition')
OUT=ROOT/'source-assets/c2a'
raw=json.loads((ROOT/'complete-edition-raw-inventory.json').read_text())
nav=json.loads((OUT/'print-navigation.json').read_text())
manifest=json.loads((OUT/'transport/manifest.json').read_text())
urls={r['url']:r for r in manifest['records'] if r['path']}
order=['crusader','hellion','bounty-hunter','highwayman','vestal','jester','plague-doctor','arbalest','grave-robber','occultist','abomination','man-at-arms','flagellant','leper','antiquarian','shieldbreaker','hound-master']
def feature(img):
    return np.asarray(img.convert('RGB').resize((48,48)),dtype=float).flatten()/255
def trim(img):
    a=np.asarray(img.convert('RGB')); h,w=a.shape[:2]
    # Locate the actual black printed rectangle at the center axes; ignore exterior crop marks.
    ys=np.where(np.mean(a[:,w//2],axis=1)<120)[0];xs=np.where(np.mean(a[h//2,:],axis=1)<120)[0]
    return img.crop((int(xs[0]),int(ys[0]),int(xs[-1]+1),int(ys[-1]+1)))
pdfs={s['sourceId']:pymupdf.open(s['path']) for s in nav['sources']}
official={}
for s in nav['sources']:
    if 'FRONT' not in s['sourceId']:continue
    for p in s['pages']:
        n=p['page'];text=p['navigationText']
        if 'SKILLS' in s['sourceId']:
            hero='musketeer' if 'MUSKETEER' in s['sourceId'] else order[(n-1)//21]
            category='Hero Skills'
        else:
            names={'hound-master':'HOUNDMASTER',**{h:h.replace('-',' ').upper() for h in order},'man-at-arms':'MAN-AT-ARMS','musketeer':'MUSKETEER'}
            names['hound-master']='HOUNDMASTER'
            hero=next((h for h,v in names.items() if v in text),None)
            if not hero:continue
            category='Heroes' if 'PVP' in s['sourceId'] else 'Hero Level / Upgrade Cards'
        page=pdfs[s['sourceId']][n-1];pix=page.get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
        img=trim(Image.frombytes('RGB',[pix.width,pix.height],pix.samples))
        official.setdefault((hero,category),[]).append({'sourceId':s['sourceId'],'page':n,'image':img,'feature':feature(img)})
groups=json.loads((ROOT/'complete-edition-content-coverage.json').read_text())['heroGroups']
matches=[]
for group in groups:
    hero=group['name'].lower().replace(' ','-')
    objects=[o for o in raw['objects'] if o['isCard'] and o['ttsPath'].startswith(group['ttsPath']+'/')]
    canvas=Image.new('RGB',(1500,((len(objects)+4)//5)*210),'white');draw=ImageDraw.Draw(canvas)
    for j,o in enumerate(objects):
        x=(j%5)*300;y=(j//5)*210
        record={'transportPath':o['ttsPath'],'transportGuid':o['sourceObjectGuid'],'heroId':hero,'category':o['runtimeCategory'],'visualReview':'BLOCKED','match':None}
        if o['faceUrl'] in urls:
            sheet=Image.open(urls[o['faceUrl']]['path']).convert('RGB');w,h=sheet.size
            ix=o['cardIndex'];cols=o['numWidth'];rows=o['numHeight'];cx=ix%cols;cy=ix//cols
            img=sheet.crop((round(cx*w/cols),round(cy*h/rows),round((cx+1)*w/cols),round((cy+1)*h/rows)))
            options=official.get((hero,o['runtimeCategory']),[])
            ranked=sorted([(float(np.mean((feature(img)-p['feature'])**2)),p) for p in options],key=lambda t:t[0])
            if ranked:
                score,best=ranked[0];record['match']={'sourceId':best['sourceId'],'page':best['page'],'score':score,'nextScore':ranked[1][0] if len(ranked)>1 else None}
            img.thumbnail((290,175));canvas.paste(img,(x,y+30))
            crop=OUT/'transport'/f'{o["sourceObjectGuid"]}-{hashlib.sha256(o["ttsPath"].encode()).hexdigest()[:8]}-front.png';img.save(crop)
            record['frontCropPath']=crop.as_posix();record['frontCropHash']=hashlib.sha256(crop.read_bytes()).hexdigest()
            draw.text((x+5,y+5),f'{o["sourceObjectGuid"]} -> page {record["match"]["page"] if record["match"] else "?"}',fill='black')
        else:draw.text((x+5,y+35),f'{o["sourceObjectGuid"]}: IMAGE UNAVAILABLE',fill='black')
        matches.append(record)
    canvas.save(OUT/f'{hero}-transport-review.png')
for p in pdfs.values():p.close()
(OUT/'transport-match-navigation.json').write_text(json.dumps({'authority':False,'matches':matches},indent=2)+'\n')
print('records',len(matches),'located',sum(m['match'] is not None for m in matches))
