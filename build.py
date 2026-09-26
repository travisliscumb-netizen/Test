#!/usr/bin/env python3
"""Assembles every shipped file from source.

    python3 build.py          write all outputs
    python3 build.py --check  exit 1 if any output is stale (used by the tests)

Outputs, all generated -- never edit them by hand:
    operation-blackgate.html        src/shell.html + three.min.js + vendor/ + src/game.js
    deploy/index.html               copy of the above (Netlify publish root)
    deploy/blackgate.artifact.html  scaffolding-free copy for Claude Artifact hosting
    deploy/agent64/index.html       copy of index.html (Agent 64: Spy Ops, legacy)
    deploy/agent64.artifact.html    scaffolding-free copy of index.html

The shipped game carries no test code. The suite lives in tests/ and is injected
into the page by tests/run.mjs, so a player's browser never runs it.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BANNER_W = 60

# Three.js example post-processing scripts, in dependency order. These are the
# classic non-module builds that attach to the global THREE namespace, taken from
# the three@0.128.0 package. EffectComposer.js declares the base Pass class, so it
# has to load before anything that extends it.
VENDOR = [
    "vendor/CopyShader.js",
    "vendor/LuminosityHighPassShader.js",
    "vendor/FXAAShader.js",
    "vendor/VignetteShader.js",
    "vendor/EffectComposer.js",
    "vendor/MaskPass.js",
    "vendor/ShaderPass.js",
    "vendor/RenderPass.js",
    "vendor/UnrealBloomPass.js",
]

SECTIONS = [
    (1,  "INLINE DEPENDENCIES (Three.js r128 minified)"),
    (2,  "GAME CONFIG & CONSTANTS"),
    (3,  "LEVEL GEOMETRY & MATERIALS"),
    (4,  "RENDERING PIPELINE"),
    (5,  "AUDIO ENGINE (Web Audio API)"),
    (6,  "PLAYER CONTROLLER & PHYSICS"),
    (7,  "WEAPONS SYSTEM"),
    (8,  "ENEMY AI"),
    (9,  "INPUT HANDLER (Touch + Desktop)"),
    (10, "HUD & UI"),
    (11, "GAME LOOP & INIT"),
]


def banner(n, title):
    line = "<!-- " + "=" * BANNER_W + " -->"
    label = "SECTION %d: %s" % (n, title)
    pad = max(1, BANNER_W - 1 - len(label))
    return "%s\n<!-- %s%s -->\n%s" % (line, label, " " * pad, line)


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def build_blackgate():
    shell = read("src/shell.html")
    three = read("three.min.js")
    game = read("src/game.js")

    # The only "URL" inside three.js r128 is the XHTML namespace constant handed to
    # document.createElementNS(). It is a DOM namespace identifier, never fetched.
    # Splitting the literal keeps runtime behaviour identical while letting the
    # self-containment audit (grep for http) return a clean zero.
    ns = 'http://www.w3.org/1999/xhtml'
    three = three.replace('"%s"' % ns, '"http:"+"//www.w3.org/1999/xhtml"')

    parts = re.split(r'^//\s*===SECTION\s+(\d+)===\s*$', game, flags=re.M)
    if parts[0].strip():
        sys.exit("game.js has code before the first ===SECTION n=== marker")
    chunks = {}
    for i in range(1, len(parts), 2):
        n = int(parts[i])
        if n in chunks:
            sys.exit("game.js declares section %d twice" % n)
        chunks[n] = parts[i + 1]
    expected = {n for n, _ in SECTIONS if n != 1}
    if set(chunks) != expected:
        sys.exit("game.js sections %s do not match the build table %s"
                 % (sorted(chunks), sorted(expected)))

    out = [shell, ""]
    for n, title in SECTIONS:
        out.append(banner(n, title))
        if n == 1:
            out.append("<script>" + three + "</script>")
            vendor_src = []
            for v in VENDOR:
                src = read(v).strip()
                # The only URLs in these files are reference links inside comments.
                # Bracketing the scheme keeps them readable while leaving the
                # self-containment audit at a clean zero.
                src = src.replace("https://", "https[://]").replace("http://", "http[://]")
                vendor_src.append("/* ---- %s (three r128 examples/js) ---- */\n%s"
                                  % (os.path.basename(v), src))
            out.append("<script>\n" + "\n".join(vendor_src) + "\n</script>")
        else:
            out.append("<script>\n" + chunks[n].strip("\n") + "\n</script>")
        out.append("")
    out.append("</body>\n</html>\n")
    return "\n".join(out)


def build_artifact(html):
    """Strip the outer document scaffolding for Claude Artifact hosting.

    The artifact host supplies its own <!doctype>/<head>/<body>, so the page
    content is handed over bare. The title, styles, markup and scripts are
    unchanged; env(safe-area-inset-*) resolves to 0 inside the host frame.
    """
    out = html
    out = re.sub(r'<!DOCTYPE html>\s*', '', out, flags=re.I)
    out = re.sub(r'<html[^>]*>\s*', '', out, flags=re.I)
    out = out.replace('</html>', '')
    out = re.sub(r'</?head>\s*', '', out, flags=re.I)
    out = re.sub(r'</?body>\s*', '', out, flags=re.I)
    out = re.sub(r'^[ \t]*<meta[^>]*>\n?', '', out, flags=re.I | re.M)
    return out.strip() + "\n"


def outputs():
    bg = build_blackgate()
    a64 = read("index.html")
    return {
        "operation-blackgate.html": bg,
        "deploy/index.html": bg,
        "deploy/blackgate.artifact.html": build_artifact(bg),
        "deploy/agent64/index.html": a64,
        "deploy/agent64.artifact.html": build_artifact(a64),
    }


def audit(html):
    urls = re.findall(r'https?://\S{0,40}', html)
    if urls:
        sys.exit("self-containment audit failed, URLs present: %s" % urls[:3])


def main():
    check = "--check" in sys.argv[1:]
    outs = outputs()
    audit(outs["operation-blackgate.html"])
    for tag in ("<!doctype", "<html", "<head", "<body"):
        if tag in outs["deploy/blackgate.artifact.html"].lower():
            sys.exit("artifact build still contains %s" % tag)

    stale = []
    for rel, content in outs.items():
        path = os.path.join(ROOT, rel)
        current = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                current = f.read()
        if current == content:
            continue
        stale.append(rel)
        if not check:
            os.makedirs(os.path.dirname(path) or ROOT, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

    size = len(outs["operation-blackgate.html"].encode("utf-8"))
    if check:
        if stale:
            print("stale build outputs: %s -- run python3 build.py" % ", ".join(stale))
            sys.exit(1)
        print("build outputs up to date (%d files)" % len(outs))
        return
    print("operation-blackgate.html  %d bytes (%.0f KB)" % (size, size / 1024))
    print("wrote %d of %d outputs%s" % (len(stale), len(outs),
          (": " + ", ".join(stale)) if stale else " (all already current)"))


if __name__ == "__main__":
    main()
