# Assemble src/* into a single self-contained index.html.
# ASCII-only output; no external requests; no build step at deploy time.
import json, os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
D = os.path.join(HERE, 'data')

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

def jload(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

careers = {}
for fn in sorted(os.listdir(os.path.join(D, 'careers'))):
    if fn.endswith('.json'):
        c = jload(os.path.join(D, 'careers', fn))
        careers[c['key']] = c

DATA = {
    'core': jload(os.path.join(D, 'core-rules.json')),
    'loop': jload(os.path.join(D, 'term-loop.json')),
    'muster': jload(os.path.join(D, 'mustering-out.json')),
    'packages': jload(os.path.join(D, 'benefits-and-packages.json')),
    'careers': careers,
}

css = read(os.path.join(HERE, 'styles.css'))
engine = read(os.path.join(HERE, 'engine.js'))
app = read(os.path.join(HERE, 'app.js'))
data_js = json.dumps(DATA, ensure_ascii=True, separators=(',', ':'))

HTML = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Traveller -- Character Generator</title>
<meta name="description" content="An unofficial character generator for Mongoose Traveller 2nd Edition.">
<style>
%CSS%
</style>
<script>/* apply saved theme before paint to avoid a flash */(function(){try{if(localStorage.getItem('traveller_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();</script>
</head><body>
<a class="backbar no-print" href="https://thetable.xerosumgames.com/">&larr; The Table</a>
<div class="hdr">
  <div class="theme-toggle" role="group" aria-label="Colour theme">
    <button class="tt-btn" data-tv="light" onclick="setTheme('light')">Light</button>
    <button class="tt-btn" data-tv="dark" onclick="setTheme('dark')">Dark</button>
  </div>
  <div class="hdr-title">Traveller</div>
  <div class="hdr-sub">Character Generator &middot; Mongoose 2nd Edition</div>
  <button class="hdr-rand no-print" type="button" onclick="A.randomise()">&#9860; Randomise</button>
</div>
<div class="main">
  <div class="track" id="track"></div>
  <div id="main"></div>
</div>
<div class="footer no-print" style="text-align:center;padding:26px 16px;font-size:12px;color:#8d897c;line-height:1.6">
  <b>Traveller -- Character Generator.</b> An unofficial fan tool.<br>
  Traveller is a registered trade mark of Mongoose Publishing Ltd. Traveller (c)2024 Mongoose Publishing Ltd.
  This is an unofficial, fan-made character generator, not affiliated with or endorsed by the rights holders.
  All game rules and content remain the property of their respective owners.
</div>
<script>var DATA=%DATA%;</script>
<script>
%ENGINE%
</script>
<script>
%APP%
</script>
</body></html>
"""

out = (HTML.replace('%CSS%', css)
           .replace('%DATA%', data_js)
           .replace('%ENGINE%', engine)
           .replace('%APP%', app))

bad = [(i + 1, l) for i, l in enumerate(out.split('\n')) if any(ord(ch) > 127 for ch in l)]
if bad:
    print('NON-ASCII on %d line(s):' % len(bad))
    for n, l in bad[:10]:
        print('  %d: %s' % (n, l[:110]))
    sys.exit(1)

dest = os.path.join(ROOT, 'index.html')
with open(dest, 'w', encoding='ascii', newline='\n') as f:
    f.write(out)
print('wrote %s  (%d bytes)' % (dest, len(out)))
