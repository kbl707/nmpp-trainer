#!/usr/bin/env python3
"""Deploy-time cache busting (run by .github/workflows/deploy.yml).

    stamp-version.py <commit-sha> [root]

* appends ?v=<short sha> to every LOCAL <script src> and <link rel=stylesheet>
  in every .html file (CDN / absolute URLs are left alone);
* writes the same short sha into the page footer (data-html-version) and into
  app.js (APP_VERSION), which the footer displays;
* then re-checks the result and exits non-zero if any local script/stylesheet
  was left without ?v= or the version constants were not stamped.
"""
import pathlib
import re
import sys

sha = sys.argv[1].strip()[:7]
root = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ".")
if not re.fullmatch(r"[0-9a-f]{7}", sha):
    sys.exit(f"stamp-version: '{sys.argv[1]}' does not look like a commit sha")

SKIP = {"node_modules", ".git"}
EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//)", re.I)  # http:, https:, data:, //cdn…
TAG = re.compile(r"<(script|link)\b[^>]*>", re.I)
ATTR = {"script": re.compile(r"(\bsrc=)([\"'])([^\"']+)\2", re.I), "link": re.compile(r"(\bhref=)([\"'])([^\"']+)\2", re.I)}
ANY_ATTR = {"script": re.compile(r"\bsrc=", re.I), "link": re.compile(r"\bhref=", re.I)}


def bust(url: str) -> str:
    base, hash_sep, frag = url.partition("#")
    base = re.sub(r"([?&])v=[^&]*&?", r"\1", base).rstrip("?&")  # replace an old v=
    return f"{base}{'&' if '?' in base else '?'}v={sha}{hash_sep}{frag}"


def stamp_tag(m: re.Match) -> str:
    tag, kind = m.group(0), m.group(1).lower()
    if kind == "link" and "stylesheet" not in tag.lower():
        return tag  # icons, preconnect, …
    return ATTR[kind].sub(
        lambda a: a.group(0) if EXTERNAL.match(a.group(3)) else f"{a.group(1)}{a.group(2)}{bust(a.group(3))}{a.group(2)}",
        tag,
        count=1,
    )


def local_assets(html: str):
    for m in TAG.finditer(html):
        tag, kind = m.group(0), m.group(1).lower()
        if kind == "link" and "stylesheet" not in tag.lower():
            continue
        a = ATTR[kind].search(tag)
        if a is None and ANY_ATTR[kind].search(tag):
            yield f"UNPARSEABLE {tag}"  # an unquoted / odd attribute we cannot rewrite: fail, never skip silently
        elif a and not EXTERNAL.match(a.group(3)):
            yield a.group(3)


stamped_pages = 0
problems = []
for page in sorted(p for p in root.rglob("*.html") if not SKIP & set(p.parts)):
    text = page.read_text(encoding="utf-8")
    new = TAG.sub(stamp_tag, text).replace("__APP_VERSION__", sha)
    page.write_text(new, encoding="utf-8")
    stamped_pages += 1
    problems += [f"{page}: {u} has no ?v={sha}" for u in local_assets(new) if f"v={sha}" not in u]

app = root / "app.js"
src = app.read_text(encoding="utf-8")
if src.count('"__APP_VERSION__"') != 1:
    problems.append(f'{app}: expected exactly one "__APP_VERSION__" constant, found {src.count(chr(34) + "__APP_VERSION__" + chr(34))}')
else:
    app.write_text(src.replace('"__APP_VERSION__"', f'"{sha}"'), encoding="utf-8")

for page in (root / "index.html", root / "l" / "uzduotys" / "index.html"):
    if page.exists() and f'data-html-version="{sha}"' not in page.read_text(encoding="utf-8"):
        problems.append(f"{page}: footer version not stamped")

if problems:
    print("stamp-version FAILED:\n  " + "\n  ".join(problems))
    sys.exit(1)
print(f"stamp-version: {sha} — {stamped_pages} page(s) stamped, app.js stamped")
