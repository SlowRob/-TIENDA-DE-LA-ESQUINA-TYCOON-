"""Genera dist/alianza-tareas.html: versión de un solo archivo para publicar en claude.ai.
Uso: python3 build-artifact.py"""
import re, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text()
css = (root / 'styles.css').read_text()
js = (root / 'app.js').read_text()
assert '</script' not in js.lower()
body = html.split('<body>', 1)[1].rsplit('</body>', 1)[0]
body = re.sub(r'\s*<script src="https://accounts.google.com/gsi/client"[^>]*></script>', '', body)
body = body.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
page = f'''<title>Alianza Tareas</title>
<meta name="theme-color" content="#1A3867">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {{ color-scheme: light; }}
{css}
</style>
{body}'''
out = root / 'dist'; out.mkdir(exist_ok=True)
(out / 'alianza-tareas.html').write_text(page)
print('dist/alianza-tareas.html', len(page), 'bytes')

# Versión instalable de un solo archivo (abre con doble clic, sin carpetas ni servidor).
standalone = f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{page.split('<style>', 1)[0]}<style>
:root {{ color-scheme: light; }}
{css}
</style>
</head>
<body>
{body}
</body>
</html>'''
(out / 'alianza-tareas-instalable.html').write_text(standalone)
print('dist/alianza-tareas-instalable.html', len(standalone), 'bytes')
