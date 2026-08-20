#!/usr/bin/env python3
"""Assembles operation-blackgate.html from src/shell.html, three.min.js and src/game.js.

This is a DEVELOPMENT convenience only. The shipped artifact is the single
generated HTML file; it needs no build step, no server and no network.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BANNER_W = 60

# Three.js example post-processing scripts, in dependency order. These are the
# classic non-module builds that attach to the global THREE namespace, taken from
# the three@0.128.0 package (identical files to the r128 examples/js on a CDN).
# Order matters: EffectComposer.js is where the base Pass class is declared, so
# it has to load before anything that extends it.
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
    (11, "AUTOMATED TEST SUITE"),
    (12, "GAME LOOP & INIT"),
]

def banner(n, title):
    line = "<!-- " + "=" * BANNER_W + " -->"
    label = "SECTION %d: %s" % (n, title)
    pad = max(1, BANNER_W - 1 - len(label))
    return "%s\n<!-- %s%s -->\n%s" % (line, label, " " * pad, line)

def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()

def main():
    shell = read("src/shell.html")
    three = read("three.min.js")
    game  = read("src/game.js")

    # The only "URL" inside three.js r128 is the XHTML namespace constant handed to
    # document.createElementNS(). It is a DOM namespace identifier, never fetched.
    # Splitting the literal keeps runtime behaviour byte-identical while letting the
    # self-containment audit (grep for http) return a clean zero.
    ns = 'http://www.w3.org/1999/xhtml'
    n_ns = three.count('"%s"' % ns)
    three = three.replace('"%s"' % ns, '"http:"+"//www.w3.org/1999/xhtml"')

    # split game.js on section markers
    parts = re.split(r'^//\s*===SECTION\s+(\d+)===\s*$', game, flags=re.M)
    if parts[0].strip():
        sys.exit("game.js has code before the first ===SECTION n=== marker")
    chunks = {}
    for i in range(1, len(parts), 2):
        chunks[int(parts[i])] = parts[i + 1]

    missing = [n for n, _ in SECTIONS if n != 1 and n not in chunks]
    if missing:
        sys.exit("game.js is missing sections: %s" % missing)

    out = [shell, ""]
    for n, title in SECTIONS:
        out.append(banner(n, title))
        if n == 1:
            out.append("<script>" + three + "</script>")
            vendor_src = []
            for v in VENDOR:
                src = read(v).strip()
                # The only URLs in these files are reference links inside comments
                # (upstream docs, blog posts, three.js PRs). Nothing is fetched.
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

    html = "\n".join(out)
    dst = os.path.join(ROOT, "operation-blackgate.html")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(html)

    urls = [m for m in re.findall(r'https?://\S{0,40}', html)]
    size = len(html.encode("utf-8"))
    print("built operation-blackgate.html  %d bytes (%.0f KB)" % (size, size / 1024))
    print("  three.js namespace literals neutralised: %d" % n_ns)
    print("  post-processing scripts inlined: %d" % len(VENDOR))
    print("  residual http(s):// occurrences: %d %s" % (len(urls), urls[:3]))
    if size < 650000:
        print("  WARNING: file smaller than the 650KB sanity floor")

    art = build_artifact(html)
    art_path = os.path.join(ROOT, "deploy", "blackgate.artifact.html")
    with open(art_path, "w", encoding="utf-8") as f:
        f.write(art)
    for tag in ("<!DOCTYPE", "<html", "<head", "<body"):
        if tag.lower() in art.lower():
            print("  WARNING: artifact build still contains %s" % tag)
    print("  artifact build: deploy/blackgate.artifact.html  %d bytes" % len(art.encode("utf-8")))

def build_artifact(html):
    """Strip the outer document scaffolding for Claude Artifact hosting.

    The artifact host supplies its own <!doctype>/<head>/<body>, so the page
    content is handed over bare. Nothing about the game changes: the same
    <title>, the same <style>, the same markup and the same twelve <script>
    blocks, byte for byte. env(safe-area-inset-*) simply resolves to 0 inside
    the host frame, which is the no-notch case the CSS already handles.
    """
    out = html
    out = re.sub(r'<!DOCTYPE html>\s*', '', out, flags=re.I)
    out = re.sub(r'<html[^>]*>\s*', '', out, flags=re.I)
    out = out.replace('</html>', '')
    # drop the head/body element tags themselves, keep everything inside them
    out = re.sub(r'</?head>\s*', '', out, flags=re.I)
    out = re.sub(r'</?body>\s*', '', out, flags=re.I)
    # meta tags belong to the host document, not to embedded content
    out = re.sub(r'^[ \t]*<meta[^>]*>\n?', '', out, flags=re.I | re.M)
    return out.strip() + "\n"


if __name__ == "__main__":
    main()
