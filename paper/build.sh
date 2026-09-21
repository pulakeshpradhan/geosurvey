#!/usr/bin/env bash
# Local preview of the JOSS paper: paper.md → paper.tex (pandoc, APA citations) → paper.pdf (xelatex).
# Needs pandoc and a TeX distribution with fontspec + the TeX Gyre fonts (TinyTeX: tlmgr install tex-gyre).
# The journal builds the final PDF itself from paper.md; this is only for checking the text.
set -euo pipefail
cd "$(dirname "$0")"
pandoc paper.md --from markdown --to latex --standalone --citeproc --csl apa.csl \
  --template template.tex --bibliography paper.bib -o paper.tex
xelatex -interaction=nonstopmode -halt-on-error paper.tex >/dev/null
xelatex -interaction=nonstopmode -halt-on-error paper.tex >/dev/null
rm -f paper.aux paper.log paper.out
echo "built paper.pdf"
