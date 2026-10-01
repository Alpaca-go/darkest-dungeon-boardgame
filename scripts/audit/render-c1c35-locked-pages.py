"""Offline reproduction of reviewed images; never acquire new sources.

Run with PyMuPDF 1.28.2 against the existing local locked corpus. Rendering
must reproduce the pinned receipt's bytes; a new renderer is a new review.
"""
import hashlib
import json
from pathlib import Path
import pymupdf

root = Path('docs/data/complete-edition')
manifest = json.loads((root / 'c1c32r2-local-official-source-manifest.json').read_text(encoding='utf-8'))
receipt = json.loads((root / 'c1c35-locked-page-review.json').read_text(encoding='utf-8'))
for relative in dict.fromkeys(row['sourceReference']['relativePath'] for row in receipt['extracts']):
    original = next(row for row in manifest['files'] if row['relativePath'] == relative)
    path = Path(manifest['mandatoryRoot']) / original['relativePath']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == original['sha256']
    with pymupdf.open(path) as document:
        for extract in receipt['extracts']:
            ref = extract['sourceReference']
            if ref['relativePath'] != relative:
                continue
            assert original['sha256'] == ref['sha256']
            assert extract['renderer'] == 'PyMuPDF ' + pymupdf.VersionBind
            scale = extract['scale']
            data = document[ref['page'] - 1].get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False).tobytes('png')
            assert hashlib.sha256(data).hexdigest() == extract['sha256'], extract['path']
            Path(extract['path']).write_bytes(data)
print('C1C35 locked page reproduction: PASS')
