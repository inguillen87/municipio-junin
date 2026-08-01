with open('vecinos.html', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('<th>SLA</th>\n                <th>SLA</th>', '<th>SLA</th>')
with open('vecinos.html', 'w', encoding='utf-8') as f:
    f.write(c)

with open('js/vecinos.js', 'r', encoding='utf-8') as f:
    c = f.read()

import re
c = re.sub(r'(<td><span style="font-size:10px;padding:3px 6px;border-radius:6px;background:rgba\(16,185,129,0\.1\);color:#10b981;border:1px solid rgba\(16,185,129,0\.2\)">A tiempo</span></td>\s*){2,}', r'\1', c)

with open('js/vecinos.js', 'w', encoding='utf-8') as f:
    f.write(c)
