"""import_source.py: a document goes in, clean markdown, images and source IDs come out."""

import json
import sys
import zipfile
from pathlib import Path

import pytest
from conftest import REAL_ROOT

sys.path.insert(0, str(REAL_ROOT / "factory" / "scripts"))
import import_source as imp  # noqa: E402

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
PNG = bytes.fromhex("89504e470d0a1a0a")


def para(text, style=None, bold=False, num=None, code=False):
    ppr = ""
    if style:
        ppr += f'<w:pStyle w:val="{style}"/>'
    if num:
        ppr += f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>'
    rpr = ("<w:b/>" if bold else "") + ('<w:rStyle w:val="CodeChar"/>' if code else "")
    return f"<w:p><w:pPr>{ppr}</w:pPr><w:r><w:rPr>{rpr}</w:rPr><w:t xml:space=\"preserve\">{text}</w:t></w:r></w:p>"


def cell(text):
    return f"<w:tc>{para(text)}</w:tc>"


def make_docx(path: Path) -> Path:
    body = "".join(
        [
            para("Widget Spec v0.3", "Heading1"),
            para("An intro with a ", None) .replace("</w:p>", '<w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r></w:p>'),
            para("Goals", "Heading2"),
            para("first goal", "ListParagraph", num=1),
            para("second goal", "ListParagraph", num=1),
            para("step one", "ListParagraph", num=2),
            para("step two", "ListParagraph", num=2),
            "<w:tbl>"
            + "<w:tr>" + cell("ID") + cell("Story | pipe") + "</w:tr>"
            + "<w:tr>" + cell("A1") + cell("As a user") + "</w:tr>"
            + "<w:tr>" + cell("B2") + cell("As an admin") + "</w:tr>"
            + "</w:tbl>",
            para("a: 1", "Code"),
            para("b: 2", "Code"),
            para("with ", None).replace("</w:p>", '<w:r><w:rPr><w:rStyle w:val="CodeChar"/></w:rPr><w:t>inline</w:t></w:r></w:p>'),
            '<w:p><w:r><w:drawing><a:blip r:embed="rId9"/></w:drawing></w:r></w:p>',
        ]
    )
    document = f'<?xml version="1.0"?><w:document {W} {R} {A}><w:body>{body}</w:body></w:document>'
    numbering = (
        f'<?xml version="1.0"?><w:numbering {W}>'
        '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>'
        '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>'
        '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
        '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>'
    )
    rels = (
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId9" Type="x" Target="media/image1.png"/></Relationships>'
    )
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("word/document.xml", document)
        zf.writestr("word/numbering.xml", numbering)
        zf.writestr("word/_rels/document.xml.rels", rels)
        zf.writestr("word/media/image1.png", PNG)
    return path


@pytest.fixture
def docx(tmp_path):
    return make_docx(tmp_path / "Widget-Spec-v0.3.docx")


def test_a_docx_becomes_markdown_with_headings_lists_tables_code_and_images(docx):
    markdown, images = imp.convert_docx(docx)
    assert "# Widget Spec v0.3" in markdown and "## Goals" in markdown
    assert "An intro with a **bold**" in markdown
    assert "- first goal\n- second goal" in markdown
    assert "1. step one\n2. step two" in markdown  # a numbered list restarts per list
    assert "| ID | Story \\| pipe |\n|---|---|\n| A1 | As a user |\n| B2 | As an admin |" in markdown
    assert "```text\na: 1\nb: 2\n```" in markdown
    assert "with `inline`" in markdown
    assert "![image1](images/image1.png)" in markdown
    assert images == {"image1.png": PNG}
    assert "<w:" not in markdown


def test_source_ids_are_the_first_column_ids_only(docx):
    markdown, _ = imp.convert_docx(docx)
    assert imp.find_ids(markdown) == ["A1", "B2"]
    assert imp.find_ids("| ID | x |\n|---|---|\n| A1 | y |\n| A1 | again |\n| not-an-id | z |") == ["A1"]


def test_import_writes_the_version_folder_index_and_originals(docx, tmp_path):
    root = tmp_path / "root"
    stats = imp.import_source(docx, "widget", root)
    folder = root / "ideas" / "widget" / "source" / "v0.3"
    assert stats["version"] == "v0.3" and stats["ids"] == 2 and stats["warnings"] == []
    assert (folder / "Widget-Spec-v0.3.md").exists() and (folder / "original.docx").exists()
    assert (folder / "images" / "image1.png").read_bytes() == PNG
    assert json.loads((folder / "ids.json").read_text()) == ["A1", "B2"]
    assert (root / "ideas/widget/source/INDEX.md").read_text().startswith("current: v0.3")


def test_a_second_version_is_kept_beside_the_first_and_becomes_current(docx, tmp_path):
    root = tmp_path / "root"
    imp.import_source(docx, "widget", root)
    imp.import_source(docx, "widget", root, version="v0.4")
    index = (root / "ideas/widget/source/INDEX.md").read_text()
    assert "current: v0.4" in index and "v0.3" in index
    assert (root / "ideas/widget/source/v0.3").is_dir()


def test_importing_the_same_version_again_needs_force(docx, tmp_path):
    root = tmp_path / "root"
    imp.import_source(docx, "widget", root)
    with pytest.raises(SystemExit, match="already exists"):
        imp.import_source(docx, "widget", root)
    imp.import_source(docx, "widget", root, force=True)


def test_markdown_and_text_are_imported_with_their_images(tmp_path):
    src = tmp_path / "notes"
    (src / "images").mkdir(parents=True)
    (src / "images" / "pic.png").write_bytes(PNG)
    md = src / "Spec.md"
    md.write_text("# Spec v2\r\n\r\n| ID | x |\r\n|---|---|\r\n| Z9 | y |\r\n\r\n![p](images/pic.png)\r\n" + "x" * 200, encoding="utf-8")
    stats = imp.import_source(md, "m", tmp_path / "root")
    folder = tmp_path / "root/ideas/m/source/v2"
    assert stats["version"] == "v2" and stats["ids"] == 1 and stats["warnings"] == []
    assert "\r" not in (folder / "Spec.md").read_text()
    assert (folder / "images" / "pic.png").exists()


def test_tables_with_spaced_separators_are_counted(tmp_path):
    md = tmp_path / "Spec.md"
    md.write_text("# Spec\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n| c |\n|:---|\n| 3 |\n" + "x" * 200, encoding="utf-8")
    assert imp.import_source(md, "t", tmp_path / "root")["tables"] == 2


def test_a_missing_image_and_an_unsupported_type_are_reported(tmp_path):
    md = tmp_path / "Spec.md"
    md.write_text("# T\n\n![gone](images/missing.png)\n" + "y" * 300, encoding="utf-8")
    stats = imp.import_source(md, "m", tmp_path / "root")
    assert any("not found" in w for w in stats["warnings"])
    odd = tmp_path / "data.xlsx"
    odd.write_bytes(b"x")
    with pytest.raises(SystemExit, match="Unsupported file type"):
        imp.import_source(odd, "m", tmp_path / "root")


def test_a_pdf_without_a_converter_says_how_to_fix_it(tmp_path, monkeypatch):
    monkeypatch.setattr(imp.shutil, "which", lambda _name: None)
    monkeypatch.setitem(sys.modules, "pypdf", None)
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    with pytest.raises(SystemExit, match="pdftotext"):
        imp.convert_pdf(pdf)


def test_version_detection():
    assert imp.detect_version("Datapantry-Spec-v0.1", "") == "v0.1"
    assert imp.detect_version("notes", "# Spec v2.3\n") == "v2.3"
    assert imp.detect_version("notes", "no version here") == "v1"


def test_the_command_line_takes_a_version_and_imports(docx, repo, py):
    from conftest import run

    script = repo / "factory/scripts/import_source.py"
    done = run([py, str(script), str(docx), "cli-demo", "--version", "v9"], repo)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "imported" in done.stdout and "2 source IDs" in done.stdout
    assert (repo / "ideas/cli-demo/source/v9/ids.json").exists()
    assert run([py, str(script), str(docx)], repo).returncode == 2  # missing the slug
    assert run([py, str(script), str(docx), "x", "--version"], repo).returncode == 2
