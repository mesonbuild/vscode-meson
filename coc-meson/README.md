# Meson for Visual Studio Code

Ported from [vscode-meson](https://github.com/deribaucourt/vscode-meson).

Because some APIs of [vscode](github.com/microsoft/vscode) are missing in
[coc.nvim](https://github.com/neoclide/coc.nvim), disable some features
temporarily:

- tasks: miss `vscode.task`

## Install

- [coc-marketplace](https://github.com/fannheyward/coc-marketplace)
- [npm](https://www.npmjs.com/package/coc-meson)
- vim:

```vim
" command line
CocInstall coc-meson
" or add the following code to your vimrc
let g:coc_global_extensions = ['coc-meson', 'other coc-plugins']
```

## Usage

Refer [vscode-meson](https://github.com/deribaucourt/vscode-meson).
