import re

with open('login.html', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """      if (found) {
        sessionStorage.setItem('mjunin_user', JSON.stringify({
          name:      found.name,
          email:     found.email,
          role:      found.role,
          secretaria: found.secretaria,
          tenant:    'municipio-junin',
          roleLabel: found.roleLabel,
          loginAt:   new Date().toISOString()
        }));"""

content = re.sub(r'if \(found\) \{\s*sessionStorage.setItem\(\'mjunin_user\', JSON\.stringify\(\{[\s\S]*?\}\)\);', replacement, content)

with open('login.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("login.html session updated")
