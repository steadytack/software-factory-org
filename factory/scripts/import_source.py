#!/usr/bin/env python3
"""Bring a source document into an idea as clean markdown.

Usage: python factory/scripts/import_source.py <file> <slug> [--version v0.1] [--force]

Reads .docx, .md, .txt (and .pdf if `pdftotext` or `pypdf` is installed) and writes, under
ideas/<slug>/source/<version>/:
  <name>.md      the document as markdown (headings, lists, tables, code blocks, images)
  images/        pictures from the document
  original.<ext> the file exactly as given
  ids.json       IDs found in the first column of tables (for the Stage 2 source map)
and records the current version in ideas/<slug>/source/INDEX.md. An older version is kept,
so a new version of the source is a change request, not a restart.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
W = "{%s}" % NS["w"]
R = "{%s}" % NS["r"]
A = "{%s}" % NS["a"]
ID_IN_FIRST_CELL = re.compile(r"^[A-Z]{1,4}-?\d{1,3}$")


def _val(el: ET.Element | None) -> str | None:
    return None if el is None else el.get(W + "val")


def _list_formats(numbering: bytes | None) -> dict[tuple[str, str], str]:
    """(numId, level) -> numbering format ('bullet', 'decimal', ...)."""
    if not numbering:
        return {}
    root = ET.fromstring(numbering)
    abstract: dict[str, dict[str, str]] = {}
    for a in root.findall("w:abstractNum", NS):
        levels = {}
        for lvl in a.findall("w:lvl", NS):
            levels[lvl.get(W + "ilvl", "0")] = _val(lvl.find("w:numFmt", NS)) or "bullet"
        abstract[a.get(W + "abstractNumId", "")] = levels
    formats: dict[tuple[str, str], str] = {}
    for n in root.findall("w:num", NS):
        levels = abstract.get(_val(n.find("w:abstractNumId", NS)) or "", {})
        for level, fmt in levels.items():
            formats[(n.get(W + "numId", ""), level)] = fmt
    return formats


class Converter:
    def __init__(self, zf: zipfile.ZipFile) -> None:
        self.zf = zf
        rels = ET.fromstring(zf.read("word/_rels/document.xml.rels"))
        self.rels = {r.get("Id"): r.get("Target") for r in rels}
        names = zf.namelist()
        self.formats = _list_formats(zf.read("word/numbering.xml") if "word/numbering.xml" in names else None)
        self.counters: dict[tuple[str, str], int] = {}
        self.images: dict[str, bytes] = {}

    # ---- inline text ----
    def _image(self, drawing: ET.Element) -> str:
        blip = drawing.find(".//a:blip", NS)
        target = self.rels.get(blip.get(R + "embed")) if blip is not None else None
        if not target:
            return ""
        name = Path(target).name
        self.images[name] = self.zf.read("word/" + target)
        return f"![{Path(name).stem}](images/{name})"

    def _runs(self, p: ET.Element, code_block: bool) -> list[tuple[str, tuple[bool, bool, bool]]]:
        pieces: list[tuple[str, tuple[bool, bool, bool]]] = []
        for run in p.iter(W + "r"):
            props = run.find("w:rPr", NS)
            bold = props is not None and props.find("w:b", NS) is not None and _val(props.find("w:b", NS)) != "0"
            italic = props is not None and props.find("w:i", NS) is not None and _val(props.find("w:i", NS)) != "0"
            code = props is not None and _val(props.find("w:rStyle", NS)) == "CodeChar"
            text = ""
            for child in run:
                if child.tag == W + "t":
                    text += child.text or ""
                elif child.tag == W + "tab":
                    text += "    " if code_block else " "
                elif child.tag == W + "br":
                    text += "\n" if code_block else " "
                elif child.tag == W + "drawing":
                    text += self._image(child)
            if text:
                pieces.append((text, (bold, italic, code)))
        return pieces

    def _inline(self, p: ET.Element) -> str:
        merged: list[list] = []
        for text, fmt in self._runs(p, code_block=False):
            if merged and merged[-1][1] == fmt:
                merged[-1][0] += text
            else:
                merged.append([text, fmt])
        out = ""
        for text, (bold, italic, code) in merged:
            if text.startswith("!["):  # an image is never wrapped
                out += text
                continue
            lead, core, trail = re.match(r"^(\s*)(.*?)(\s*)$", text, re.S).groups()
            if not core:
                out += text
                continue
            if code:
                core = f"`{core}`"
            if italic:
                core = f"*{core}*"
            if bold:
                core = f"**{core}**"
            out += lead + core + trail
        return out.strip()

    # ---- blocks ----
    def _list_prefix(self, p: ET.Element) -> str | None:
        num = p.find("w:pPr/w:numPr", NS)
        if num is None:
            return None
        num_id = _val(num.find("w:numId", NS)) or "0"
        level = _val(num.find("w:ilvl", NS)) or "0"
        indent = "  " * int(level)
        if self.formats.get((num_id, level), "bullet") == "bullet":
            return f"{indent}- "
        count = self.counters.get((num_id, level), 0) + 1
        self.counters[(num_id, level)] = count
        return f"{indent}{count}. "

    def _cell(self, tc: ET.Element) -> str:
        parts = [self._inline(p) for p in tc.findall("w:p", NS)]
        return "<br>".join(x for x in parts if x).replace("|", "\\|")

    def _table(self, tbl: ET.Element) -> str:
        rows = []
        for tr in tbl.findall("w:tr", NS):
            rows.append([self._cell(tc) for tc in tr.findall("w:tc", NS)])
        if not rows:
            return ""
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * width]
        lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
        return "\n".join(lines)

    def convert(self) -> str:
        body = ET.fromstring(self.zf.read("word/document.xml")).find("w:body", NS)
        blocks: list[tuple[str, str]] = []  # (kind, text)
        for el in body:
            if el.tag == W + "tbl":
                blocks.append(("table", self._table(el)))
                continue
            if el.tag != W + "p":
                continue
            style = _val(el.find("w:pPr/w:pStyle", NS)) or ""
            if style == "Code":
                text = "".join(t for t, _ in self._runs(el, code_block=True))
                if blocks and blocks[-1][0] == "code":
                    blocks[-1] = ("code", blocks[-1][1] + "\n" + text)
                else:
                    blocks.append(("code", text))
                continue
            text = self._inline(el)
            if not text:
                continue
            heading = re.fullmatch(r"Heading([1-6])", style)
            if heading:
                blocks.append(("heading", "#" * int(heading.group(1)) + " " + text))
            elif style == "Title":
                blocks.append(("heading", "# " + text))
            elif (prefix := self._list_prefix(el)) is not None:
                blocks.append(("list", prefix + text))
            elif style == "Quote":
                blocks.append(("para", "> " + text))
            else:
                blocks.append(("para", text))
        out: list[str] = []
        for i, (kind, text) in enumerate(blocks):
            if kind == "code":
                text = "```text\n" + text.strip("\n") + "\n```"
            if i and not (kind == "list" and blocks[i - 1][0] == "list"):
                out.append("")
            out.append(text)
        return "\n".join(out).rstrip() + "\n"


def convert_docx(path: Path) -> tuple[str, dict[str, bytes]]:
    with zipfile.ZipFile(path) as zf:
        converter = Converter(zf)
        markdown = converter.convert()
    return markdown, converter.images


def convert_pdf(path: Path) -> str:
    if shutil.which("pdftotext"):
        done = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True)
        return done.stdout
    try:
        from pypdf import PdfReader  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit("PDF import needs `pdftotext` (poppler) on the PATH or `pip install pypdf`.") from exc
    return "\n\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)


def find_ids(markdown: str) -> list[str]:
    """IDs that open a table row (the first column), in order, without repeats."""
    found: list[str] = []
    for line in markdown.splitlines():
        if line.startswith("|"):
            first = line.strip().strip("|").split("|")[0].strip()
            if ID_IN_FIRST_CELL.match(first) and first not in found:
                found.append(first)
    return found


def detect_version(name: str, markdown: str) -> str:
    for text in (name, markdown[:400]):
        match = re.search(r"\bv(\d+(?:\.\d+)*)\b", text, re.I)
        if match:
            return "v" + match.group(1)
    return "v1"


def check_quality(markdown: str, source_images: int, found_images: int) -> list[str]:
    warnings = []
    if re.search(r"</?w:[a-zA-Z]", markdown):
        warnings.append("raw Word XML is left in the output")
    if not re.search(r"^#{1,6} ", markdown, re.M):
        warnings.append("no headings found")
    if len(markdown.strip()) < 200:
        warnings.append("very little text was extracted")
    if found_images < source_images:
        warnings.append(f"{source_images - found_images} referenced image(s) were not found")
    return warnings


def import_source(file: Path, slug: str, root: Path, version: str | None = None, force: bool = False) -> dict:
    file = file.resolve()
    suffix = file.suffix.lower()
    images: dict[str, bytes] = {}
    if suffix == ".docx":
        markdown, images = convert_docx(file)
    elif suffix in (".md", ".markdown", ".txt"):
        markdown = file.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    elif suffix == ".pdf":
        markdown = convert_pdf(file)
    else:
        raise SystemExit(f"Unsupported file type {suffix!r}; use .docx, .md, .txt or .pdf.")

    version = version or detect_version(file.stem, markdown)
    folder = root / "ideas" / slug / "source"
    target = folder / version
    if target.exists() and not force:
        raise SystemExit(f"{target} already exists; use a new --version or --force to replace it.")
    (target / "images").mkdir(parents=True, exist_ok=True)

    referenced = re.findall(r"!\[[^\]]*\]\((?!https?:)([^)\s]+)\)", markdown)
    found = 0
    for name, data in images.items():
        (target / "images" / name).write_bytes(data)
    for ref in referenced:
        if (target / ref).exists() or (file.parent / ref).exists():
            if not (target / ref).exists():
                (target / ref).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(file.parent / ref, target / ref)
            found += 1
    shutil.copy(file, target / f"original{suffix}")
    (target / f"{file.stem}.md").write_text(markdown, encoding="utf-8", newline="\n")

    ids = find_ids(markdown)
    (target / "ids.json").write_text(json.dumps(ids, indent=2) + "\n", encoding="utf-8", newline="\n")
    versions = sorted(p.name for p in folder.iterdir() if p.is_dir())
    (folder / "INDEX.md").write_text(
        f"current: {version}\nversions: {', '.join(versions)}\n", encoding="utf-8", newline="\n"
    )
    warnings = check_quality(markdown, len(referenced), found)
    stats = {
        "version": version,
        "folder": str(target),
        "headings": len(re.findall(r"^#{1,6} ", markdown, re.M)),
        "tables": len(re.findall(r"^\|\s*:?-{3,}", markdown, re.M)),  # |---| and | --- |
        "code_blocks": markdown.count("```") // 2,
        "images": len(referenced),
        "ids": len(ids),
        "characters": len(markdown),
        "warnings": warnings,
    }
    return stats


def main(argv: list[str]) -> int:
    rest = list(argv[1:])
    version = None
    if "--version" in rest:
        at = rest.index("--version")
        version = rest[at + 1] if at + 1 < len(rest) else None
        del rest[at : at + 2]
    force = "--force" in rest
    args = [a for a in rest if not a.startswith("--")]
    if len(args) != 2 or ("--version" in argv and version is None):
        print(__doc__)
        return 2
    root = Path(__file__).resolve().parents[2]
    stats = import_source(Path(args[0]), args[1], root, version, force)
    print(f"imported {args[0]} as {stats['version']} -> {stats['folder']}")
    print(
        f"  {stats['headings']} headings, {stats['tables']} tables, {stats['code_blocks']} code blocks, "
        f"{stats['images']} images, {stats['ids']} source IDs, {stats['characters']} characters"
    )
    for w in stats["warnings"]:
        print(f"  warning: {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
