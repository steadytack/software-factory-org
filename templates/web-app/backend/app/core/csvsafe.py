"""One rule for text that goes into a CSV a spreadsheet will open.

A cell that starts with `=`, `+`, `-` or `@` can run as a formula when the file
is opened in Excel or Sheets (`=HYPERLINK(...)`, `+cmd|...`). Such text is
prefixed with an apostrophe so it is shown, not run. The same rule is applied
on screen by `frontend/src/components/ui/table/csv.ts`; the admin export
(`export_all.py`) had no guard until.

A plain negative number ("-0.12", a western longitude) is just a number, so it
is left alone; prefixing it turned it into text (audit R2-EXP-1). Only text is
guarded: numbers, dates and ids are written as they are.
"""

import re

_PLAIN_NEGATIVE_NUMBER = re.compile(r"^-\d+(\.\d+)?$")
_FORMULA_STARTS = ("=", "+", "-", "@")

# Excel reads a CSV as the local code page unless it starts with a UTF-8 BOM.
BOM = "﻿"


def safe_csv_text(value: str) -> str:
    if value.startswith(_FORMULA_STARTS) and not _PLAIN_NEGATIVE_NUMBER.match(value):
        return "'" + value
    return value
