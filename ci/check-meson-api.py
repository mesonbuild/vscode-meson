#!/usr/bin/env python3

from pathlib import Path
import yaml
import json
import typing as T

def get_names(dirpath: Path) -> T.List[str]:
    names: T.List[str] = []
    for p in dirpath.glob('*.yaml'):
        if p.name.startswith('_'):
            continue
        with p.open('r', encoding='utf-8') as f:
            data = yaml.load(f, Loader=yaml.CLoader)
        names.append(data['name'])
    return names

functions = get_names(Path('meson/docs/yaml/functions'))
builtins = get_names(Path('meson/docs/yaml/builtins'))

with Path('syntaxes/meson.tmLanguage.json').open('r', encoding='utf-8') as f:
    language = json.load(f)

for d in language['patterns']:
    if d.get('name') == 'support.function.builtin.meson':
        functions_str = '|'.join(sorted(functions))
        assert functions_str in d['match'], f'Expected functions: {functions_str}'
    elif d.get('name') == 'support.variable.meson':
        builtins_str = '|'.join(sorted(builtins))
        assert builtins_str in d['match'], f'Expected builtins: {builtins_str}'
