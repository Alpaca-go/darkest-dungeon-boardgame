"""Retry exact URLs via a second HTTP client; no alternative sources."""
import json,hashlib,datetime,concurrent.futures,urllib.request,io
from pathlib import Path
from PIL import Image
folder=Path('docs/data/complete-edition/source-assets/c2a-r1')
path=folder/'transport-manifest.json'; manifest=json.loads(path.read_text(encoding='utf-8'))
def retry(r):
    date=datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        with urllib.request.urlopen(r['url'],timeout=60) as response: data=response.read()
        img=Image.open(io.BytesIO(data));img.load()
        p=folder/(hashlib.sha256(r['url'].encode()).hexdigest()+'.bin');p.write_bytes(data)
        r.update(retrievalStatus='RETRIEVED',path=p.as_posix(),sha256=hashlib.sha256(data).hexdigest(),byteSize=len(data),width=img.width,height=img.height,retrievalDate=date)
        attempt={'attempt':3,'client':'urllib','retrievalDate':date,'status':'RETRIEVED'}
    except Exception as e:attempt={'attempt':3,'client':'urllib','retrievalDate':date,'status':'FAILED','error':str(e)}
    r['attempts'].append(attempt);print(r['retrievalStatus'],r['url'],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(retry,[r for r in manifest['records'] if r['retrievalStatus']=='INACCESSIBLE']))
path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
