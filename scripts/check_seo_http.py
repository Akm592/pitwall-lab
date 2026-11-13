"""Check rendered SEO output: python3 scripts/check_seo_http.py http://localhost:3102."""
import json
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from xml.etree import ElementTree

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:3102'
public = 'https://pitwall-lab.vercel.app'
current = max(int(path.name) for path in Path('data').iterdir()
              if path.name.isdigit() and int(path.name) <= datetime.now(timezone.utc).year and (path / 'calendar.json').exists())


def fetch(path):
    try:
        with urlopen(base + path, timeout=60) as response:
            return response.status, response.read().decode()
    except HTTPError as error:
        return error.code, error.read().decode()


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.title, self.meta, self.links, self.schemas = '', {}, [], []
        self.canonical = None
        self.in_title = self.in_schema = False
        self.schema = ''
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if tag == 'meta':
            self.meta[attrs.get('name', attrs.get('property'))] = attrs.get('content', '')
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs['href']
        if tag == 'a':
            self.links.append(attrs.get('href'))
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.in_schema, self.schema = True, ''

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_schema:
            self.schema += data

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag == 'script' and self.in_schema:
            self.schemas.append(json.loads(self.schema))
            self.in_schema = False


for attempt in range(40):
    try:
        if fetch('/robots.txt')[0] == 200:
            break
    except (URLError, TimeoutError):
        pass
    time.sleep(.5)
else:
    raise AssertionError('Server did not become ready')

paths = ['/', '/races', '/races?season=1950', '/drivers', '/teams', '/about', '/image-credits',
         '/drivers/HAM?season=2026', '/teams/mercedes?season=2026',
         '/races/2026/brazil', '/races/2023/bahrain', '/races/1950/britain', '/races/2026/las-vegas',
         '/drivers/HAM?season=1950', '/teams/mercedes?season=1950']
pages = {}
for path in paths:
    status, html = fetch(path)
    assert status == 200, (path, status)
    page = pages[path] = Page(html)
    canonical = path + f'?season={current}' if path in ('/drivers', '/teams') else path
    assert page.canonical.rstrip('/') == (public + canonical).rstrip('/'), (path, page.canonical)
    assert page.title and page.meta.get('description'), path
    assert page.meta.get('og:url', '').rstrip('/') == page.canonical.rstrip('/'), path
    assert page.meta.get('twitter:card') == 'summary_large_image', path
    assert page.meta.get('og:image', '').startswith('https://'), path
    assert ('noindex' in page.meta.get('robots', '')) == (path in ('/drivers/HAM?season=1950', '/teams/mercedes?season=1950')), path
    if '/races/' in path or '/HAM?season=2026' in path or '/mercedes?season=2026' in path:
        crumbs = next(schema for schema in page.schemas if schema['@type'] == 'BreadcrumbList')
        assert crumbs['itemListElement'][-1]['item'] == page.canonical, path
    if path in ('/races', '/drivers', '/teams'):
        assert path + '?season=1950' in page.links, path
        assert path + '?season=2026' in page.links, path

assert any(schema['@type'] == 'WebSite' for schema in pages['/'].schemas)
assert 'Race Analysis & Lap Times' in pages['/races/2026/brazil'].title
for path in ('/races/1950/britain', '/races/2023/bahrain'):
    assert 'Results & Statistics' in pages[path].title and 'Lap Times' not in pages[path].title
assert fetch('/races/2026/not-a-race')[0] == 404
assert fetch('/drivers/NOT_A_DRIVER?season=2026')[0] == 404

status, xml = fetch('/sitemap.xml')
assert status == 200
namespace = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
entries = ElementTree.fromstring(xml).findall('s:url', namespace)
urls = [entry.find('s:loc', namespace).text for entry in entries]
assert len(urls) > 5000 and len(urls) == len(set(urls))
assert all(url.startswith(public + '/') for url in urls)
assert public + '/drivers' not in urls and public + '/teams' not in urls
assert public + '/drivers/HAM?season=1950' not in urls
assert all(page.canonical.rstrip('/') in {url.rstrip('/') for url in urls}
           for page in pages.values() if 'noindex' not in page.meta.get('robots', ''))
dated = {entry.find('s:loc', namespace).text: entry.find('s:lastmod', namespace).text
         for entry in entries if entry.find('s:lastmod', namespace) is not None}
assert len(dated) > len(entries) * .9
assert all(datetime.fromisoformat(value.replace('Z', '+00:00')) <= datetime.now(timezone.utc) for value in dated.values())
snapshot = json.loads(Path('data/2026/brazil.json').read_text())
assert abs((datetime.fromisoformat(dated[public + '/races/2026/brazil'].replace('Z', '+00:00')) - datetime.fromisoformat(snapshot['exportedAt'])).total_seconds()) < .001
assert 'Sitemap: ' + public + '/sitemap.xml' in fetch('/robots.txt')[1]
print(f'SEO HTTP checks passed: {len(paths)} pages, 404s, structured data, season links and {len(urls)} unique sitemap URLs.')
