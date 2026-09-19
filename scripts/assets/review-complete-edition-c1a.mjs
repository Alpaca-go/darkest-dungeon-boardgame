// Review-only contact sheets; never used as original evidence or source truth.
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { rows, scope } from './import-complete-edition-c1a.mjs';
mkdirSync('.artifacts/c1a/review',{recursive:true});
for (const deck of [453,466,444,445]) {
  const cards = rows().filter(r=>r.deckId===deck);
  const step = deck===453 || deck===466 ? 7 : 3;
  for(let start=0;start<cards.length;start+=step){
    const inputs=[]; let height=0,width=0;
    for(const [i,r] of cards.slice(start,start+step).entries()){
      const s=scope(r);const base=`src/assets/community-reference/complete-edition/${s.kind}/${s.region??s.contentSet}/${s.level?`level-${s.level}/`:''}${r.deckId}-${r.cardIndex}`;
      if (!existsSync(`${base}.front.png`)) continue;
      if(s.kind==='trinkets'){
        for(const [j,side] of ['front','back'].entries()){
          if(!existsSync(`${base}.${side}.png`))continue;
          const m=await sharp(`${base}.front.png`).metadata();
          const half=await sharp(`${base}.front.png`).extract({left:0,top:j?Math.floor(m.height/2):0,width:m.width,height:Math.floor(m.height/2)}).png().toBuffer();
          const b=await sharp(half).rotate(j?180:0).resize(570,190).png().toBuffer();
          inputs.push({input:b,left:j*570,top:i*215+25});
        }
        inputs.push({input:Buffer.from(`<svg width="1140" height="25"><rect width="1140" height="25" fill="white"/><text x="10" y="19" font-size="18">${deck}-${r.cardIndex} POSITIVE / NEGATIVE (front lower half rotated)</text></svg>`),left:0,top:i*215});width=1140;height=(i+1)*215;
      }else{
        const b=await sharp(`${base}.front.png`).resize(590,980).png().toBuffer();inputs.push({input:b,left:i*590,top:25});
        inputs.push({input:Buffer.from(`<svg width="590" height="25"><rect width="590" height="25" fill="white"/><text x="10" y="19" font-size="18">${deck}-${r.cardIndex}</text></svg>`),left:i*590,top:0});width=(i+1)*590;height=1005;
      }
    }
    if(inputs.length) await sharp({create:{width,height,channels:3,background:'white'}}).composite(inputs).png().toFile(`.artifacts/c1a/review/${deck}-${start}.png`);
  }
}
