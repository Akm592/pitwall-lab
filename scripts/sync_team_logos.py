#!/usr/bin/env python3
"""Download team logos and preserve their source and rights information.

Only logos Commons marks as public domain (too simple to be copyrighted) or under an allowlisted Creative Commons licence
are taken. They remain trademarks of their teams and are used here only to identify those teams. Teams whose logo is
copyrighted artwork fall back to a drawn monogram badge unless explicitly mapped to an official team asset below."""
import argparse
import html
import json
import re
import subprocess
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Team slug (lib/teams.ts teamSlug) -> Commons file. Several team names share one file.
FILES = {
    'mercedes':'Mercedes-AMG Petronas F1 Team logo (2026).svg',
    'ferrari':'Ferrari wordmark.svg',
    'mclaren':'Mclaren Logo 2021.svg',
    'williams':'Atlassian Williams F1 Team logo.svg',
    'alpine':'Alpine F1 Team Logo.svg',
    'alpine-f1-team':'Alpine F1 Team Logo.svg',
    'haas-f1-team':'TGR Haas F1 Team Logo (2026).svg',
    'audi':'Audif1.com logo17 (cropped).svg',
    'sauber':'Sauber F1 Team logo.svg',
    'kick-sauber':'Sauber F1 Team logo.svg',
    'alfa-romeo':'Alfa Romeo F1 Team Stake Logo.svg',
    'alfa-romeo-racing':'Alfa Romeo F1 Team Stake Logo.svg',
    'racing-point':'BWT Racing Point Logo.svg',
    'force-india':'Force India.svg',
    'cadillac':'Cadillac Formula 1 Team logo.png',
    'renault':'Renault F1 Team logo 2019.png',
}

# Official team branding requested for the directory; these are copyrighted trademarks, not freely licensed Commons files.
OFFICIAL = {
    'racing-bulls': {
        'url':'https://www.visacashapprb.com/_next/static/media/visacashapprb.2417cc46.svg',
        'sourceUrl':'https://www.visacashapprb.com/int-en',
        'author':'Visa Cash App Racing Bulls', 'title':'Visa Cash App Racing Bulls official team logo',
    },
    'red-bull-racing': {
        'url':'https://www.redbullracing.com/_next/static/media/ORBR_logo_2026.4059dac5.svg',
        'sourceUrl':'https://www.redbullracing.com/int-en',
        'author':'Oracle Red Bull Racing', 'title':'Oracle Red Bull Racing official team logo (2026)', 'background':'dark',
    },
    'aston-martin': {
        'url':'https://assets.astonmartinf1.com/public/cms/7ByTBLO6CIbZqzhqdSFtn8/be9b4abddc4c396a486b10255121684a/2025_AMF1_Team__logo_wide_black_RGB_BG.svg',
        'sourceUrl':'https://www.astonmartinf1.com/en-GB',
        'author':'Aston Martin Aramco Formula One Team', 'title':'Aston Martin Aramco official team logo',
    },
}
OFFICIAL['red-bull'] = OFFICIAL['red-bull-racing']

def fetch(url):
    for attempt in range(4):
        time.sleep(5 + attempt*15)
        try:
            return subprocess.check_output(['curl', '-A', 'PitwallLab/1.0 (local educational team logo attribution)', '-f', '-sSL', '--max-time', '60', url], stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            continue
    raise ValueError('Download failed or rate limited')

def plain(value):
    return html.unescape(re.sub('<[^>]*>', '', str(value))).strip().replace('Unknown authorUnknown author', 'Unknown author')

def logo(slug, filename):
    if slug in OFFICIAL:
        asset = OFFICIAL[slug]
        content = fetch(asset['url'])
        if b'<svg' not in content[:4000]:
            raise ValueError('Official asset is not an SVG')
        target = ROOT/'public'/'teams'/(slug+'.svg')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return {'src':f'/teams/{slug}.svg', 'author':asset['author'], 'license':'Copyrighted team logo; all rights reserved',
                'licenseUrl':asset['sourceUrl'], 'sourceUrl':asset['sourceUrl'], 'title':asset['title'], 'trademark':True,
                **({'background':asset['background']} if 'background' in asset else {})}
    query = urllib.parse.urlencode({'format':'json','action':'query','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url|extmetadata'})
    page = next(iter(json.loads(fetch('https://commons.wikimedia.org/w/api.php?'+query))['query']['pages'].values()))
    info = page['imageinfo'][0]
    meta = {key:plain(value['value']) for key,value in info['extmetadata'].items()}
    license_name = meta.get('LicenseShortName','')
    if not (license_name == 'Public domain' or license_name.startswith(('CC BY ', 'CC BY-SA ', 'CC0'))):
        raise ValueError(f'License not allowlisted: {license_name}')
    content = fetch(info['url'])
    extension = '.svg' if b'<svg' in content[:4000] else '.png' if content.startswith(b'\x89PNG\r\n\x1a\n') else None
    if not extension:
        raise ValueError('Downloaded response is not an SVG or PNG')
    target = ROOT/'public'/'teams'/(slug+extension)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    license_url = meta.get('LicenseUrl','').replace('http://creativecommons.org/', 'https://creativecommons.org/')
    return {'src':f'/teams/{slug}{extension}', 'author':meta.get('Attribution') or meta.get('Artist') or 'Unknown author', 'license':license_name,
            'licenseUrl':('https:'+license_url if license_url.startswith('//') else license_url) or info['descriptionurl'],
            'sourceUrl':info['descriptionurl'], 'title':plain(page['title'].removeprefix('File:')), 'trademark':meta.get('Restrictions','') == 'trademarked'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--team', help='One team slug; default downloads every mapped team')
    args = parser.parse_args()
    manifest_path = ROOT/'data'/'team-logos.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    failures = []
    for slug, filename in {**FILES, **{slug:asset['url'] for slug,asset in OFFICIAL.items()}}.items():
        if args.team and slug != args.team:
            continue
        try:
            manifest[slug] = logo(slug, filename)
            print(f'{slug}: {filename}', flush=True)
        except Exception as error:
            failures.append(slug)
            print(f'{slug}: LOGO FAILED: {error}', flush=True)
        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2, ensure_ascii=False) + '\n')
    if failures:
        raise SystemExit('Failed: ' + ', '.join(failures))

if __name__ == '__main__':
    main()
