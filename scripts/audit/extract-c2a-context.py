import json,hashlib
from pathlib import Path
import pymupdf
from PIL import Image,ImageDraw
ROOT=Path('docs/data/complete-edition');OUT=ROOT/'source-assets/c2a'
inventory=json.loads((ROOT/'source-assets/c1c38r1/repository-source-inventory.json').read_text())
requests=[('DD_EN_WARRENS_BOX.pdf',2),('DD_EN_COVE_BOX.pdf',2),('DD_EN_WEALD_BOX.pdf',2),('DD_EN_THE_DARKEST_HEROES_BOX.pdf',2),('DD_EN_COREBOX_RULES.pdf',6)]
records=[]
for name,number in requests:
    original=next(f for f in inventory['archiveFiles'] if f['path'].endswith('/'+name))
    data=Path(original['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==original['sha256']
    with pymupdf.open(original['path']) as pdf:
        excerpt=pymupdf.open();excerpt.insert_pdf(pdf,from_page=number-1,to_page=number-1)
        path=OUT/f'{Path(name).stem}-p{number}.pdf';excerpt.save(path);excerpt.close()
        image=OUT/f'{Path(name).stem}-p{number}.png';pdf[number-1].get_pixmap(matrix=pymupdf.Matrix(1.2,1.2),alpha=False).save(image)
    records.append({'sourceId':Path(name).stem,'originalLocation':original['path'],'originalSha256':original['sha256'],'originalPage':number,'path':path.as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'reviewImage':image.as_posix(),'reviewImageSha256':hashlib.sha256(image.read_bytes()).hexdigest()})
(OUT/'context-sources.json').write_text(json.dumps(records,indent=2)+'\n')
nav=json.loads((OUT/'print-navigation.json').read_text())
order=['crusader','hellion','bounty-hunter','highwayman','vestal','jester','plague-doctor','arbalest','grave-robber','occultist','abomination','man-at-arms','flagellant','leper','antiquarian','shieldbreaker','hound-master']
# Every skill back is shown, with readable class/name/level; review atlas includes all 378.
for s in nav['sources']:
    if 'SKILLS_BACK' not in s['sourceId']:continue
    with pymupdf.open(s['path']) as pdf:
        for group,start in enumerate(range(0,len(pdf),21)):
            hero='musketeer' if 'MUSKETEER' in s['sourceId'] else order[group]
            canvas=Image.new('RGB',(1200,1650),'white');draw=ImageDraw.Draw(canvas)
            for k in range(21):
                pix=pdf[start+k].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5),alpha=False)
                img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);img.thumbnail((385,210))
                x=(k%3)*400;y=(k//3)*235;canvas.paste(img,(x,y+20));draw.text((x,y),str(start+k+1),fill='black')
            canvas.save(OUT/f'{hero}-skills-back-review.png')
