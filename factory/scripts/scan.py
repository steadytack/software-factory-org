"""Static checks on files that are never executed: secrets, risky scripts, licences.

Used by publish.py (before anything leaves the machine) and by the catalogue importer (on imported,
untrusted material). Findings never contain the secret itself: only its kind and where it is.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

SECRET_PATTERNS = {
    # the header followed by key material, so a regex or docs that only name the header are not flagged
    "private key": r"-----BEGIN (RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----\s*\n\s*[A-Za-z0-9+/]{40,}",
    "AWS key": r"AKIA[0-9A-Z]{16}",
    "GitHub token": r"gh[pousr]_[A-Za-z0-9]{36,}",
    "Slack token": r"xox[abprs]-[A-Za-z0-9-]{10,}",
    "API key (sk-)": r"\bsk-[A-Za-z0-9_-]{20,}",
    "Google key": r"AIza[0-9A-Za-z_-]{35}",
}
ASSIGNED_SECRET = re.compile(r"(?i)(api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['\"]([^'\"\s]{16,})['\"]")
PLACEHOLDER = re.compile(r"(?i)change|example|your|placeholder|test|dummy|xxxx")
SECRET_FILES = re.compile(r"(^|/)\.env$|\.pem$|\.key$|id_rsa|id_ed25519|\.p12$|\.pfx$")
BINARY_OR_GENERATED = re.compile(
    r"(package-lock\.json|\.lock$|\.svg$|\.png$|\.jpe?g$|\.gif$|\.ico$|\.woff2?$|\.ttf$|\.min\.|openapi\.(json|d\.ts)$|\.map$|\.pdf$|\.zip$|\.docx$)"
)
RISKY_SCRIPT = {
    "pipes a download into a shell": r"(curl|wget)[^\n|]*\|\s*(ba|z)?sh\b",
    "install hook": r"\"(pre|post)?install\"\s*:",
    "base64 decoded and executed": r"base64\s+(-d|--decode)[^\n]*\|\s*(ba)?sh|exec\(\s*base64",
    "runs code from a string": r"(?<![.\w])(eval|exec)\s*\(|\bnew\s+Function\s*\(",  # not regex.exec() or session.exec()
    "changes permissions widely": r"chmod\s+(-R\s+)?777",
}
INSTRUCTION_MARKERS = {
    "tries to override instructions": r"(?i)ignore (all |any )?(previous|prior|above) (instructions|rules)",
    "claims authority": r"(?i)(you are now|act as) (the )?(system|administrator|root)|system prompt override",
    "asks to hide actions": r"(?i)do not (tell|inform|mention to) the user",
    "asks for secrets": r"(?i)\b(send|post|upload|exfiltrate)\b[^\n]{0,40}\b(tokens?|passwords?|api keys?|credentials?)\b",
}
LICENCE_FILES = re.compile(r"(?i)^(licen[cs]e|copying)(\.(md|txt|rst))?$")
LICENCE_NAMES = {
    "MIT": r"Permission is hereby granted, free of charge",
    "Apache-2.0": r"Apache License,?\s+Version 2\.0",
    "GPL-3.0": r"GNU GENERAL PUBLIC LICENSE\s+Version 3",
    "GPL-2.0": r"GNU GENERAL PUBLIC LICENSE\s+Version 2",
    "AGPL-3.0": r"GNU AFFERO GENERAL PUBLIC LICENSE",
    "LGPL": r"GNU LESSER GENERAL PUBLIC LICENSE",
    "BSD": r"Redistribution and use in source and binary forms",
    "MPL-2.0": r"Mozilla Public License,? (v\. |Version )2\.0",
    "Unlicense": r"This is free and unencumbered software released into the public domain",
}


@dataclass
class Finding:
    severity: str  # info, warning, blocker
    kind: str  # secret, script, licence, dependency, instruction, other
    where: str
    what: str

    def as_dict(self) -> dict:
        return {"severity": self.severity, "kind": self.kind, "where": self.where, "what": self.what}


def entropy(value: str) -> float:
    counts = Counter(value)
    return -sum(n / len(value) * math.log2(n / len(value)) for n in counts.values())


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def text_files(root: Path, names: list[str] | None = None) -> list[tuple[str, Path]]:
    """(relative path, path) for every file to scan; `names` limits it (e.g. to git-tracked files)."""
    if names is None:
        names = [p.relative_to(root).as_posix() for p in sorted(root.rglob("*")) if p.is_file() and ".git" not in p.relative_to(root).parts]
    return [(n, root / n) for n in names if n and not BINARY_OR_GENERATED.search(n) and (root / n).is_file()]


def secret_files(names: list[str]) -> list[str]:
    return [n for n in names if SECRET_FILES.search(n) and ".example" not in n]


def is_example_value(value: str) -> bool:
    """Documentation examples and placeholders, not secrets: AWS's ...EXAMPLE keys, padded or masked values."""
    return bool(re.search(r"EXAMPLE|(0{5,}|X{5,}|x{5,})$", value))


def in_test_files(rel: str) -> bool:
    return bool(re.search(r"(^|/)(tests?|testdata|test_data|fixtures?|examples?|__tests__|spec)(/|$)|(_test|\.test|_spec)\.[a-z]+$", rel))


def scan_secrets(root: Path, names: list[str] | None = None, test_files_warn: bool = False) -> list[Finding]:
    """Secret patterns and secret-looking files. With test_files_warn (for third-party material), a match
    inside test, fixture or example files is a warning rather than a blocker; it is still reported."""
    found: list[Finding] = []
    for rel in secret_files(names if names is not None else [n for n, _ in text_files(root)]):
        found.append(Finding("blocker", "secret", rel, "a secret-looking file"))
    for rel, path in text_files(root, names):
        text = read_text(path)
        if text is None:
            continue
        for name, pattern in SECRET_PATTERNS.items():
            real = [m.group(0) for m in re.finditer(pattern, text) if not is_example_value(m.group(0))]
            if real:
                severity = "warning" if test_files_warn and in_test_files(rel) else "blocker"
                found.append(Finding(severity, "secret", rel, name + (" (in test or example files)" if severity == "warning" else "")))
        for match in ASSIGNED_SECRET.finditer(text):
            value = match.group(2)
            if entropy(value) > 3.5 and not PLACEHOLDER.search(value):
                found.append(Finding("warning", "secret", rel, f"possible secret ({match.group(1)})"))
    return dedupe(found)


def scan_scripts(root: Path) -> list[Finding]:
    found = []
    for rel, path in text_files(root):
        text = read_text(path)
        if text is None:
            continue
        for what, pattern in RISKY_SCRIPT.items():
            if re.search(pattern, text):
                severity = "info" if what in ("runs code from a string", "install hook") else "warning"
                found.append(Finding(severity, "script", rel, what))
    return dedupe(found)


def scan_instructions(root: Path) -> list[Finding]:
    """Prompt-injection markers in text an AI may read (prompts, skills, READMEs, docs)."""
    found = []
    for rel, path in text_files(root):
        if not re.search(r"(?i)\.(md|txt|prompt|ya?ml|json)$", rel):
            continue
        text = read_text(path) or ""
        for what, pattern in INSTRUCTION_MARKERS.items():
            if re.search(pattern, text):
                found.append(Finding("warning", "instruction", rel, what))
    return dedupe(found)


def detect_licence(root: Path) -> tuple[str, str | None]:
    """(licence name or 'unknown', the file it came from)."""
    for path in sorted(root.iterdir()) if root.is_dir() else []:
        if path.is_file() and LICENCE_FILES.match(path.name):
            text = read_text(path) or ""
            for name, pattern in LICENCE_NAMES.items():
                if re.search(pattern, text):
                    return name, path.name
            return "unknown (licence file not recognised)", path.name
    for manifest, pattern in (("package.json", r'"license"\s*:\s*"([^"]+)"'), ("pyproject.toml", r'(?m)^license\s*=\s*(?:\{\s*text\s*=\s*)?"([^"]+)"')):
        text = read_text(root / manifest) if (root / manifest).exists() else None
        match = re.search(pattern, text or "")
        if match:
            return match.group(1), manifest
    # a Python wheel: the licence is in its .dist-info folder
    for meta in sorted(root.glob("*.dist-info/METADATA")) if root.is_dir() else []:
        text = read_text(meta) or ""
        match = re.search(r"(?m)^License-Expression:\s*(\S.*)$", text) or re.search(r"(?m)^License:\s*(\S.{0,60})$", text)
        if match:
            return match.group(1).strip(), meta.relative_to(root).as_posix()
        for lic in sorted(meta.parent.glob("licenses/*")) + sorted(meta.parent.glob("LICEN[CS]E*")):
            body = read_text(lic) or ""
            for name, pattern in LICENCE_NAMES.items():
                if re.search(pattern, body):
                    return name, lic.relative_to(root).as_posix()
        classifier = re.search(r"(?m)^Classifier: License :: OSI Approved :: (.+)$", text)
        if classifier:
            return classifier.group(1).strip(), meta.relative_to(root).as_posix()
    return "unknown", None


def dedupe(findings: list[Finding]) -> list[Finding]:
    seen, out = set(), []
    for f in findings:
        key = (f.severity, f.kind, f.where, f.what)
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out
