"""Run: python3 scripts/check_team_logos.py (no network requests)."""
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

import sync_team_logos as sync

manifest = json.loads((sync.ROOT/'data/team-logos.json').read_text())
for slug, asset in sync.OFFICIAL.items():
    entry = manifest[slug]
    assert entry['sourceUrl'] == asset['sourceUrl'], slug
    assert entry['trademark'] and entry['license'].startswith('Copyrighted'), slug
    assert entry.get('background') == asset.get('background'), slug
    path = sync.ROOT/'public'/entry['src'].lstrip('/')
    assert ElementTree.parse(path).getroot().tag == '{http://www.w3.org/2000/svg}svg', slug

with tempfile.TemporaryDirectory() as folder, patch.object(sync, 'ROOT', Path(folder)):
    with patch.object(sync, 'fetch', return_value=b'<svg xmlns="http://www.w3.org/2000/svg"/>') as fetch:
        entry = sync.logo('red-bull-racing', '')
        fetch.assert_called_once_with(sync.OFFICIAL['red-bull-racing']['url'])
        assert entry['background'] == 'dark'
        assert (Path(folder)/'public/teams/red-bull-racing.svg').is_file()
    with patch.object(sync, 'fetch', return_value=b'<html>Download failed</html>'):
        try:
            sync.logo('red-bull-racing', '')
        except ValueError:
            pass
        else:
            raise AssertionError('Rejected downloads must not overwrite a logo')
    assert (Path(folder)/'public/teams/red-bull-racing.svg').read_bytes().startswith(b'<svg')

print('Official logo sources, assets, contrast and downloader checks passed.')
