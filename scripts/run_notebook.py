"""Execute the analysis notebook: .venv/bin/python scripts/run_notebook.py."""
import os
from pathlib import Path

for key, value in {
    'JUPYTER_CONFIG_DIR': '/tmp/pitwall-jupyter/config',
    'JUPYTER_DATA_DIR': '/tmp/pitwall-jupyter/data',
    'JUPYTER_RUNTIME_DIR': '/tmp/pitwall-jupyter/runtime',
    'IPYTHONDIR': '/tmp/pitwall-ipython',
    'MPLCONFIGDIR': '/tmp/pitwall-matplotlib',
    'OMP_NUM_THREADS': '2',
}.items():
    os.environ.setdefault(key, value)

import nbformat
from nbclient import NotebookClient

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'notebooks' / '01_eda_and_pace_baseline.ipynb'
notebook = nbformat.read(path, as_version=4)
NotebookClient(notebook, timeout=300, kernel_name='python3',
               resources={'metadata': {'path': str(ROOT)}}).execute()
nbformat.validate(notebook)
nbformat.write(notebook, path)
print(f'Executed {sum(cell.cell_type == "code" for cell in notebook.cells)} code cells: {path}')
