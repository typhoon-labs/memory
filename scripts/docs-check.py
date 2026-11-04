#!/usr/bin/env python3
"""`task docs:check`: are the documents' links, spelling, diagrams and freshness lines in order?

    docs-check.py              every Markdown document in the repository
    docs-check.py FILE ...     only these

Checks, for each document (CONTRIBUTING.md, "Documentation", says why):

  link        a relative link names a file that exists, and an anchor that the
              target's headings make (GitHub's rule: lowercase, punctuation
              dropped, spaces to hyphens, a repeat gets -1, -2 ...)
  spelling    no British spelling outside code: American English is the rule
  mermaid     no semicolon inside a Mermaid block, which ends a statement there
  freshness   the line under the title that says who keeps the document, which
              job it does and when it was last checked against the code

One line per problem, `path:line: check: what is wrong`, and the exit status 1
when there is any. It reads files only and needs nothing but Python 3.

Documents that are inputs to a program rather than documentation (an agent's
prompt, a skill) are not checked: see RUNTIME_INPUTS.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Read by a running agent, not by people: their wording is behavior.
RUNTIME_INPUTS = (
    re.compile(r"^components/[^/]+/prompts/"),
    re.compile(r"(^|/)skills/[^/]+/SKILL\.md$"),
)

TYPES = ("start", "explanation", "proposal", "reference", "runbook", "record")
FRESHNESS = re.compile(
    r"^> \*\*Owner:\*\* .+ · \*\*Type:\*\* (?P<type>[a-z]+) · \*\*Checked:\*\* \d{4}-\d{2}-\d{2}\b"
)

# British forms, matched as whole words. Names that belong to someone else
# keep their spelling (asyncio.CancelledError), and those are in code, which
# is skipped.
BRITISH_WORDS = [
    "colour", "colours", "coloured", "behaviour", "behaviours", "favour",
    "favourite", "honour", "labour", "catalogue", "catalogues", "centre",
    "centres", "metre", "metres", "grey", "licence", "licences", "defence",
    "offence", "programme", "programmes", "artefact", "artefacts", "towards",
    "whilst", "amongst", "learnt", "spelt", "misspelt", "judgement",
    "cancelled", "cancelling", "travelled", "travelling", "modelled",
    "modelling", "labelled", "labelling", "signalled", "fulfil", "enrol",
    "untick", "unticked", "analyse", "analysed", "analysing", "organise",
    "organised", "organises", "organising", "organisation", "organisations",
    "recognise", "recognised", "prioritise", "prioritised", "summarise",
    "summarised", "optimise", "optimised", "initialise", "initialised",
    "authorise", "authorised", "serialise", "serialised", "normalise",
    "normalised", "minimise", "maximise", "customise", "customised",
]
BRITISH = re.compile(r"\b(" + "|".join(BRITISH_WORDS) + r")\b", re.IGNORECASE)

FENCE = re.compile(r"^\s*(```|~~~)")
INLINE_CODE = re.compile(r"`[^`]*`")
LINK = re.compile(r"(?<!!)\[(?:[^\]\[]|\[[^\]]*\])*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
IMAGE = re.compile(r"!\[[^\]]*\]\(([^)\s]+)\)")
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
HTML_ANCHOR = re.compile(r"<a\s+(?:id|name)=\"([^\"]+)\"")


def documents(args: list[str]) -> list[Path]:
    if args:
        return [Path(a).resolve() for a in args]
    listed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.split()
    keep = []
    for name in listed:
        if any(part.startswith(".") for part in Path(name).parts):
            continue
        if any(rule.search(name) for rule in RUNTIME_INPUTS):
            continue
        keep.append(ROOT / name)
    return sorted(set(keep))


def prose_lines(text: str):
    """(line number, line, in_mermaid) for each line outside code, and Mermaid lines."""
    fence = None
    mermaid = False
    for number, line in enumerate(text.splitlines(), 1):
        match = FENCE.match(line)
        if match:
            if fence is None:
                fence = match.group(1)
                mermaid = line.strip().lower().startswith(fence + "mermaid")
            elif line.strip().startswith(fence):
                fence, mermaid = None, False
            continue
        if fence is None:
            yield number, line, False
        elif mermaid:
            yield number, line, True


def slug(heading: str) -> str:
    heading = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", heading)
    heading = heading.strip().lower()
    heading = re.sub(r"[^\w\- ]", "", heading)
    return heading.replace(" ", "-")


_anchors: dict[Path, set[str]] = {}


def anchors(path: Path) -> set[str]:
    if path not in _anchors:
        seen: dict[str, int] = {}
        found: set[str] = set()
        text = path.read_text(encoding="utf-8")
        for _, line, mermaid in prose_lines(text):
            if mermaid:
                continue
            found.update(HTML_ANCHOR.findall(line))
            match = HEADING.match(line)
            if not match:
                continue
            base = slug(match.group(2))
            count = seen.get(base, 0)
            seen[base] = count + 1
            found.add(base if count == 0 else f"{base}-{count}")
        _anchors[path] = found
    return _anchors[path]


def check(path: Path) -> list[str]:
    problems: list[str] = []
    rel = path.relative_to(ROOT) if path.is_relative_to(ROOT) else path
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    def report(number: int, kind: str, message: str) -> None:
        problems.append(f"{rel}:{number}: {kind}: {message}")

    # freshness: the first non-empty line after the title
    title = next((i for i, l in enumerate(lines) if l.startswith("# ")), None)
    if title is None:
        report(1, "freshness", "no title (a line starting '# ')")
    else:
        after = next((i for i in range(title + 1, len(lines)) if lines[i].strip()), title)
        match = FRESHNESS.match(lines[after]) if after != title else None
        if not match:
            report(title + 2, "freshness", "the line under the title is not "
                   "'> **Owner:** ... · **Type:** ... · **Checked:** YYYY-MM-DD ...'")
        elif match.group("type") not in TYPES:
            report(after + 1, "freshness", f"type {match.group('type')!r} is not one of {', '.join(TYPES)}")

    for number, line, mermaid in prose_lines(text):
        if mermaid:
            if ";" in line:
                report(number, "mermaid", "a semicolon ends the statement inside a Mermaid block")
            continue
        prose = INLINE_CODE.sub("", line)
        for word in BRITISH.findall(re.sub(r"<?https?://\S+", "", prose)):
            report(number, "spelling", f"{word!r} is British; write American English")
        for target in LINK.findall(prose) + IMAGE.findall(prose):
            if re.match(r"^[a-z][a-z0-9+.-]*:", target):
                continue
            file_part, _, anchor = target.partition("#")
            dest = (path.parent / file_part).resolve() if file_part else path
            if not dest.exists():
                report(number, "link", f"{target} names a file that does not exist")
                continue
            if anchor and dest.suffix == ".md" and anchor.lower() not in anchors(dest):
                report(number, "link", f"{target}: no heading in {dest.name} makes #{anchor}")
    return problems


def main(argv: list[str]) -> int:
    problems: list[str] = []
    files = documents(argv)
    for path in files:
        problems.extend(check(path))
    for line in problems:
        print(line)
    print(f"{len(files)} documents, {len(problems)} problems", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
