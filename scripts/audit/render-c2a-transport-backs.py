"""Transport backs are locators, never rules authority. Missing sheets stay unresolved."""
import json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
root=Path('docs/data/complete-edition');out=root/'source-assets/c2a'
raw=json.loads((root/'complete-edition-raw-inventory.json').read_text())['objects']
manifest=json.loads((out/'transport/manifest.json').read_text())['records']
urls={r['url']:r for r in manifest if r['path']}
groups=json.loads((root/'complete-edition-content-coverage.json').read_text())['heroGroups']
records=[]
for g in groups:
    hero=g['name'].lower().replace(' ','-')
    objects=[o for o in raw if o['isCard'] and o['ttsPath'].startswith(g['ttsPath']+'/') and o['runtimeCategory']!='Hero Level / Upgrade Cards']
    canvas=Image.new('RGB',(1500,((len(objects)+4)//5)*210),'white');draw=ImageDraw.Draw(canvas)
    for j,o in enumerate(objects):
        x=j%5*300;y=j//5*210;r={'transportPath':o['ttsPath'],'heroId':hero,'status':'SOURCE_UNRESOLVED'}
        if o['backUrl'] in urls:
            sheet=Image.open(urls[o['backUrl']]['path']).convert('RGB');w,h=sheet.size
            ix=o['cardIndex'] if o['uniqueBack'] else 0;cols=o['numWidth'] if o['uniqueBack'] else 1;rows=o['numHeight'] if o['uniqueBack'] else 1
            cx=ix%cols;cy=ix//cols
            img=sheet.crop((round(cx*w/cols),round(cy*h/rows),round((cx+1)*w/cols),round((cy+1)*h/rows)))
            img.thumbnail((290,175));canvas.paste(img,(x,y+30))
            p=out/'transport'/f'{o["sourceObjectGuid"]}-{hashlib.sha256(o["ttsPath"].encode()).hexdigest()[:8]}-back.png';img.save(p)
            r.update(backCropPath=p.as_posix(),backCropHash=hashlib.sha256(p.read_bytes()).hexdigest(),status='IMAGE_AVAILABLE_REVIEW_REQUIRED')
        else:draw.text((x+5,y+35),'IMAGE UNAVAILABLE',fill='black')
        draw.text((x+5,y+5),o['sourceObjectGuid']+' '+o['runtimeCategory'],fill='black');records.append(r)
    canvas.save(out/f'{hero}-transport-back-review.png')
(out/'transport-back-navigation.json').write_text(json.dumps({'transportIsAuthority':False,'records':records},indent=2)+'\n')
print('Back crops',sum('backCropHash' in r for r in records),'/',len(records))
