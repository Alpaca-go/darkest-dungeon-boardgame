"""Offline navigation and image witnesses. Extraction never grants visual acceptance."""
import json, hashlib
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw

ROOT = Path('docs/data/complete-edition')
OUT = ROOT / 'source-assets/c2b'
OUT.mkdir(parents=True, exist_ok=True)
read = lambda p: json.loads(p.read_text(encoding='utf-8'))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
pdfs = {}
checked = set()
def face(ref, key, witness):
    path = ref['path']
    if path not in checked:
        assert sha(Path(path)) == ref['sha256']
        checked.add(path)
    if path not in pdfs: pdfs[path] = pymupdf.open(path)
    page = pdfs[path][ref['page']-1]
    spans = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            for s in line['spans']:
                if not s['text'].strip(): continue
                entry = {'text':s['text'], 'bbox':[round(v,3) for v in s['bbox']], 'font':s['font']}
                if entry not in spans: spans.append(entry)
    return {'source':ref, 'image':witness,
        'navigationSpans':spans, 'navigationAuthority':False, 'visualReview':'REVIEW_REQUIRED'}

skills=[]
for f in read(ROOT/'c2a-r1-hero-skill-level-form-map.json')['forms']:
    key=f['skillId']+'-'+str(f['level'])
    skills.append({'skillId':f['skillId'],'heroId':f['heroId'],'level':f['level'],
        'physicalCardId':f['physicalCardId'],'printedName':f['printedName'],
        'printedBackName':f['printedBackName'],'printedLevel':f['printedLevelMarker'],
        'front':face(f['officialSource'],key+'-front', {'path':(ROOT/'source-assets/c2a'/ (f['heroId']+'-skills-review.png')).as_posix(), 'sha256':sha(ROOT/'source-assets/c2a'/(f['heroId']+'-skills-review.png')), 'row':((f['officialSource']['page']-1)%21)//3+1,'column':f['level']}),
        'back':face(f['officialBackCandidate'],key+'-back', {'path':(ROOT/'source-assets/c2a'/ (f['heroId']+'-skills-back-review.png')).as_posix(), 'sha256':sha(ROOT/'source-assets/c2a'/(f['heroId']+'-skills-back-review.png')), 'row':((f['officialSource']['page']-1)%21)//3+1,'column':f['level']})})
profiles=[]
for p in read(ROOT/'c2a-r1-profile-transport-binding.json')['entries']:
    for side,role,marker in [('front',p['frontRole'],p['printedFrontLevel']),('back',p['backRole'],p['printedBackLevel'])]:
        if marker is None: continue
        level={'I':1,'II':2,'III':3}[marker]
        profiles.append({'heroId':p['heroId'],'level':level,'printedLevel':marker,
            'form':role,'physicalId':p['physicalId'],'printedHeroName':p['printedHeroIdentity'],
            'side':side,'face':face(p['official'+side.title()],p['heroId']+'-profile-'+str(level)+'-'+side, {'path':p['official'+side.title()+'Crop']['cropPath'],'sha256':p['official'+side.title()+'Crop']['cropHash']})})
for hero in dict.fromkeys(p['heroId'] for p in profiles):
    forms=sorted([p for p in profiles if p['heroId']==hero],key=lambda p:(p['form'],p['level']))
    canvas=Image.new('RGB',(len(forms)*390,760),'white');draw=ImageDraw.Draw(canvas)
    for i,p in enumerate(forms):
        img=Image.open(p['face']['image']['path'])
        # Keep identity marker and the complete gameplay portion at readable size.
        w,h=img.size
        top=img.crop((0,0,w,int(h*.25)));top.thumbnail((380,185))
        bottom=img.crop((0,int(h*.49),w,h));bottom.thumbnail((380,550))
        canvas.paste(top,(390*i,20));canvas.paste(bottom,(390*i,205))
        draw.text((390*i+5,5),hero+' '+p['printedLevel']+' '+p['form'],fill='black')
    canvas.save(OUT/(hero+'-profiles-review.png'))
(OUT/'navigation.json').write_text(json.dumps({'extractionIsAcceptance':False,'skills':skills,'profileFaces':profiles},indent=2)+'\n',encoding='utf-8',newline='\n')
print('C2B navigation: 378 paired Skills, 57 Profile faces; direct visual acceptance required.')
