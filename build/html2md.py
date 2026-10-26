#!/usr/bin/env python3
"""Converts the <article> of a guide or legal page to Markdown.

    python3 build/html2md.py investor-list.html > investor-list.md

Used by build/export.sh so the articles can be read, edited or reposted
(LinkedIn, newsletters, docs) without a browser. Only the article body is
kept: navigation, the table of contents, breadcrumbs, the call-to-action box
and related-guide links are site chrome, not content. Relative links become
absolute https://binder.red links so they still work outside the site.
"""
import sys
from html.parser import HTMLParser

SITE = "https://binder.red"
SKIP = {"nav", "aside", "script", "style", "svg"}


class Article(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inside = False      # within <article>
        self.skip_tag = None     # element being skipped (nav, aside, ...)
        self.skip = 0            # nesting depth of that same element
        self.out = []            # finished blocks
        self.buf = ""            # current inline text
        self.lists = []          # stack of "ul" / "ol" with counters
        self.href = None
        self.table = None        # list of rows while inside a table
        self.row = None
        self.cell = None
        self.crumbs = False

    # -- helpers ---------------------------------------------------------
    def flush(self, prefix=""):
        text = " ".join(self.buf.split())
        if text:
            self.out.append(prefix + text)
        self.buf = ""

    def emit(self, s):
        if self.cell is not None:
            self.cell += s
        else:
            self.buf += s

    # -- parser callbacks ------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "article":
            self.inside = True
            return
        if not self.inside:
            return
        # Count only the skipped element's own tag: other tags inside it may be
        # void or unbalanced, and counting them left the parser skipping
        # everything after the first <nav>.
        if self.skip:
            if tag == self.skip_tag:
                self.skip += 1
            return
        if tag in SKIP:
            self.skip_tag, self.skip = tag, 1
            return
        cls = a.get("class", "")
        if tag == "p" and "crumbs" in cls:
            self.crumbs = True
            return
        if tag in ("h1", "h2", "h3", "p", "summary"):
            self.flush()
        elif tag in ("ul", "ol"):
            self.flush()
            self.lists.append([tag, 0])
        elif tag == "li":
            self.flush()
        elif tag == "a":
            href = a.get("href", "")
            self.href = SITE + href if href.startswith("/") else href
            self.emit("[")
        elif tag in ("strong", "b"):
            self.emit("**")
        elif tag in ("em", "i"):
            self.emit("*")
        elif tag == "sup":
            self.emit("^")
        elif tag == "br":
            self.emit("  \n")
        elif tag == "table":
            self.flush()
            self.table = []
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = ""

    def handle_endtag(self, tag):
        if not self.inside:
            return
        if tag == "article":
            self.flush()
            self.inside = False
            return
        if self.skip:
            if tag == self.skip_tag:
                self.skip -= 1
            return
        if self.crumbs and tag == "p":
            self.crumbs = False
            self.buf = ""
            return
        if tag == "h1":
            self.flush("# ")
        elif tag == "h2":
            self.flush("## ")
        elif tag in ("h3", "summary"):
            self.flush("### ")
        elif tag == "p":
            self.flush()
        elif tag == "li":
            kind = self.lists[-1] if self.lists else ["ul", 0]
            kind[1] += 1
            indent = "  " * (len(self.lists) - 1)
            self.flush(indent + ("%d. " % kind[1] if kind[0] == "ol" else "- "))
        elif tag in ("ul", "ol"):
            self.lists.pop()
        elif tag == "a":
            self.emit("](%s)" % self.href)
            self.href = None
        elif tag in ("strong", "b"):
            self.emit("**")
        elif tag in ("em", "i"):
            self.emit("*")
        elif tag in ("td", "th"):
            self.row.append(" ".join(self.cell.split()).replace("|", "\\|"))
            self.cell = None
        elif tag == "tr":
            self.table.append(self.row)
            self.row = None
        elif tag == "table":
            rows = self.table
            self.table = None
            if rows:
                width = max(len(r) for r in rows)
                rows = [r + [""] * (width - len(r)) for r in rows]
                lines = ["| " + " | ".join(rows[0]) + " |", "|" + " --- |" * width]
                lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
                self.out.append("\n".join(lines))

    def handle_data(self, data):
        if self.inside and not self.skip and not self.crumbs:
            self.emit(data)


def convert(path):
    p = Article()
    with open(path, encoding="utf-8") as f:
        p.feed(f.read())
    if not p.out:
        raise SystemExit(f"html2md: no <article> content in {path}")
    # Consecutive list items read better without blank lines between them.
    md = []
    for block in p.out:
        is_item = block.lstrip().startswith(("- ", "1. ", "2. ", "3. ", "4. ", "5. ", "6. ", "7. ", "8. ", "9. "))
        if md and is_item and md[-1][1]:
            md[-1] = (md[-1][0] + "\n" + block, True)
        else:
            md.append((block, is_item))
    return "\n\n".join(b for b, _ in md) + "\n"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: html2md.py page.html")
    sys.stdout.write(convert(sys.argv[1]))
