#!/usr/bin/env python3

from pathlib import Path
import json
import sys
import typing as T

import yaml

def get_names(dirpath: Path) -> T.Set[str]:
    names: T.List[str] = []
    for p in dirpath.glob('*.yaml'):
        if p.name.startswith('_'):
            continue
        with p.open('r', encoding='utf-8') as f:
            data = yaml.load(f, Loader=yaml.CLoader)
        names.append(data['name'])
    return names

def split_regex(raw: str) -> T.Set[str]:
      got = raw.split('|')
      got[0] = got[0].rsplit('(', 1)[1]
      got[-1] = got[-1].rsplit('\n', 1)[0]
      return set(got)


def main() -> int:
  functions = get_names(Path('meson/docs/yaml/functions'))
  builtins = get_names(Path('meson/docs/yaml/builtins'))

  with Path('syntaxes/meson.tmLanguage.json').open('r', encoding='utf-8') as f:
      language = json.load(f)

  code = 0
  for d in language['patterns']:
      if d.get('name') == 'support.function.builtin.meson':
          functions_str = '|'.join(sorted(functions))
          if functions_str not in d['match']:
              expected = set(functions)
              got = split_regex(d['match'])
              diff = expected.difference(got)
              print(f'Missing the following functions: {", ".join(sorted(diff))}', file=sys.stderr)
              code = 1
      if d.get('name') == 'support.variable.meson':
          builtins_str = '|'.join(sorted(builtins))
          if builtins_str not in d['match']:
              expected = set(builtins)
              got = split_regex(d['match'])
              diff = expected.difference(got)
              print(f'Missing the following builtins: {", ".join(sorted(diff))}', file=sys.stderr)
              code = 1
  return code


if __name__ == "__main__":
  sys.exit(main())
