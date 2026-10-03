"""Render official cards for direct visual review; text is navigation only."""
import json
from pathlib import Path
import pymupdf
from PIL import Image, ImageDraw
ROOT=Path('docs/data/complete-edition')
OUT=ROOT/'source-assets/c2a'
nav=json.loads((OUT/'print-navigation.json').read_text())
order=['crusader','hellion','bounty-hunter','highwayman','vestal','jester','plague-doctor','arbalest','grave-robber','occultist','abomination','man-at-arms','flagellant','leper','antiquarian','shieldbreaker','hound-master']
def render(page,w,h):
    pix=page.get_pixmap(matrix=pymupdf.Matrix(2,2),alpha=False)
    img=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
    img.thumbnail((w,h))
    return img
for s in nav['sources']:
    if 'SKILLS_' not in s['sourceId']:continue
    with pymupdf.open(s['path']) as pdf:
        for group,start in enumerate(range(0,len(pdf),21)):
            hero='musketeer' if 'MUSKETEER' in s['sourceId'] else order[group]
            canvas=Image.new('RGB',(1200,1650),'white');draw=ImageDraw.Draw(canvas)
            for k in range(21):
                # Each row contains all three levels of a skill.
                img=render(pdf[start+k],380,215)
                x=(k%3)*400;y=(k//3)*235
                canvas.paste(img,(x,y+20));draw.text((x+5,y+3),f'{hero}: print page {start+k+1}',fill='black')
            suffix='skills-back-review' if 'BACK' in s['sourceId'] else 'skills-review'
            canvas.save(OUT/f'{hero}-{suffix}.png')
print('18 official skill review sheets rendered')
