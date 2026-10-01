#!/usr/bin/env python3
"""Download Commons-licensed Wikipedia lead portraits and preserve attribution."""
import argparse
import html
import json
import re
import subprocess
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALIASES = {'RUS':'George Russell (racing driver)', 'ZHO':'Zhou Guanyu', 'ALB':'Alex Albon', 'HUL':'Nico Hülkenberg', 'PER':'Sergio Pérez', 'SAI':'Carlos Sainz Jr.', 'ANT':'Andrea Kimi Antonelli'}

def fetch(url):
    time.sleep(2)
    return subprocess.check_output(['curl', '-A', 'PitwallLab/1.0 (local educational driver photograph attribution)', '-f', '-sSL', '--retry', '2', '--max-time', '60', url])

def api(host, **params):
    return json.loads(fetch(f'https://{host}/w/api.php?' + urllib.parse.urlencode({'format':'json', 'action':'query', **params})))['query']['pages'].values()

def plain(value):
    return html.unescape(re.sub('<[^>]*>', '', str(value))).strip().replace('Unknown authorUnknown author', 'Unknown author')

def photo(code, name, selected_title=None):
    pages = api('en.wikipedia.org', titles=ALIASES.get(code,name), prop='pageimages', piprop='name', redirects=1)
    filename = selected_title or ('Lewis Hamilton 2022 São Paulo Grand Prix (52497848109) (cropped).jpg' if code == 'HAM' else next((p['pageimage'] for p in pages if p.get('pageimage')), None))
    if not filename:
        raise ValueError('No lead photograph')
    page = next(iter(api('commons.wikimedia.org', titles='File:'+filename, prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=800)))
    info = page['imageinfo'][0]
    meta = {k:plain(v['value']) for k,v in info['extmetadata'].items()}
    license_name, license_url = meta.get('LicenseShortName',''), meta.get('LicenseUrl','').replace('http://creativecommons.org/', 'https://creativecommons.org/')
    if license_url.startswith('//'):
        license_url = 'https:' + license_url
    if not (license_name.startswith(('CC BY ', 'CC BY-SA ', 'CC0')) and license_url.startswith('https://creativecommons.org/')):
        raise ValueError(f'License not allowlisted: {license_name} {license_url}')
    author = meta.get('Attribution') or meta.get('Artist')
    if not author:
        raise ValueError('Missing attribution')
    content = fetch(info.get('thumburl',info['url']))
    extension = '.jpg' if content.startswith(b'\xff\xd8\xff') else '.png' if content.startswith(b'\x89PNG\r\n\x1a\n') else '.webp' if content.startswith(b'RIFF') and content[8:12] == b'WEBP' else None
    if not extension:
        raise ValueError('Downloaded response is not a supported image')
    target = ROOT/'public'/'drivers'/(code+extension)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return {'src':f'/drivers/{code}{extension}', 'author':author, 'license':license_name, 'licenseUrl':license_url, 'sourceUrl':info['descriptionurl'], 'title':plain(page['title'].removeprefix('File:')), 'changes':'Wikimedia Commons resized preview; displayed cropped to fit. No local image edits.', 'date':meta.get('DateTimeOriginal','')}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--driver', help='One driver code; default downloads all snapshot drivers')
    args=parser.parse_args()
    roster={driver['code']:driver['name'] for path in (ROOT/'data').glob('*/*.json') if path.name!='calendar.json' for driver in json.loads(path.read_text()).get('drivers',[])}
    manifest_path=ROOT/'data'/'driver-photos.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    failures=[]
    for code,name in roster.items():
        if args.driver and code!=args.driver:
            continue
        try:
            manifest[code]=photo(code,name,manifest.get(code,{}).get('title'))
            manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
            print(f'{code}: {manifest[code]["license"]}',flush=True)
        except Exception as error:
            failures.append(code)
            print(f'{code}: unavailable: {error}',flush=True)
    lines=['# Driver photograph credits','', 'These historical photographs are hosted locally. They do not imply current team affiliation or endorsement. Each photograph retains its own license. Wikimedia Commons supplies resized previews; the application crops their display with CSS and makes no local image edits.','', '| Driver | Photographer | License | Source | Photograph date |','| --- | --- | --- | --- | --- |']
    for code,image in sorted(manifest.items()):
        lines.append(f'| {roster.get(code,code)} | {image["author"].replace("|","/")} | [{image["license"]}]({image["licenseUrl"]}) | [Original and attribution]({image["sourceUrl"]}) | {image.get("date", "")} |')
    (ROOT/'docs'/'image-credits.md').write_text('\n'.join(lines)+'\n')
    if failures:
        raise SystemExit('Missing verified photographs: '+', '.join(failures))

if __name__=='__main__':
    main()
