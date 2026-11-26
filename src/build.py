"""단일 HTML 빌드: python3 src/build.py  (먼저 npm install 필요)"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
t = (src / 'template.html').read_text(encoding='utf-8')
rules = json.dumps(json.loads((src / 'rules.json').read_text(encoding='utf-8')), ensure_ascii=False, indent=1)
t = t.replace('/*RULES*/', rules, 1).replace('/*ENGINE*/', (src / 'engine.js').read_text(encoding='utf-8'), 1)
x = (root / 'node_modules/xlsx/dist/xlsx.mini.min.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
t = t.replace('/*SHEETJS*/', '/*! SheetJS Community Edition (Apache-2.0) 내장 */\n' + x, 1)
(root / 'index.html').write_text(t, encoding='utf-8')
print('index.html', len(t.encode()) // 1024, 'KB')
