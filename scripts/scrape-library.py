"""Refresh the attributed offline Roblox reference pack. Python 3 standard library only."""
import json, urllib.request, concurrent.futures, pathlib, re, datetime, hashlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=json.loads((ROOT/'library/catalog.json').read_text())
def fetch(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ForgeStudio-ReferenceLibrary/1.0'}),timeout=45) as r:return r.read()
commit=json.loads(fetch('https://api.github.com/repos/Roblox/creator-docs/commits/main'))['sha']
retrieved=datetime.datetime.now(datetime.timezone.utc).isoformat()
def collect(row):
 path='content/en-us/'+row['path']+'.md'
 raw=fetch(f'https://raw.githubusercontent.com/Roblox/creator-docs/{commit}/{path}').decode()
 body=re.sub(r'^---\n.*?\n---\n','',raw,count=1,flags=re.S)
 # Preserve the markdown and code; JSX components are not executable in our reader.
 source='https://create.roblox.com/docs/'+re.sub(r'/index$','',row['path'])
 entry={**row,'id':'official-'+row['path'].replace('/','-'),'source':source,'source_file':f'https://github.com/Roblox/creator-docs/blob/{commit}/{path}','content':body.strip(),'retrieved':retrieved,'revision':commit,'license':'CC BY 4.0','attribution':'Roblox Creator Documentation contributors','digest':hashlib.sha256(raw.encode()).hexdigest(),'kind':'official','image':'/library/'+row.get('diagram','workflow')+'.svg'}
 print('Collected:',row['title'])
 return entry
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: entries=list(pool.map(collect,spec))
target=ROOT/'library/official.json'
target.with_suffix('.tmp').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
target.with_suffix('.tmp').replace(target)
print('Saved',len(entries),'references;',sum(len(x['content'].split()) for x in entries),'words; revision',commit)
