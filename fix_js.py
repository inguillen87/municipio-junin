import os

with open('js/bottom-nav.js', 'r', encoding='utf-8', errors='ignore') as f:
    c = f.read()

c = c.replace("{ icon: '??', label: 'Inicio'", "{ icon: '🏠', label: 'Inicio'")
c = c.replace("{ icon: '??', label: 'Presup.'", "{ icon: '💰', label: 'Presup.'")
c = c.replace("{ icon: '??', label: 'IA'", "{ icon: '🤖', label: 'IA'")
c = c.replace("{ icon: '???', label: 'Vecinos'", "{ icon: '👥', label: 'Vecinos'")
c = c.replace("{ icon: '?',  label: 'Ms'", "{ icon: '☰',  label: 'Más'")
c = c.replace("Navegacin", "Navegación")
c = c.replace("'Ms'", "'Más'")

# Also there might be literal question marks or other encoded chars, let's just do a regex replace
import re
c = re.sub(r"\{\s*icon:\s*'.*?',\s*label:\s*'Inicio'", "{ icon: '🏠', label: 'Inicio'", c)
c = re.sub(r"\{\s*icon:\s*'.*?',\s*label:\s*'Presup\.'", "{ icon: '💰', label: 'Presup.'", c)
c = re.sub(r"\{\s*icon:\s*'.*?',\s*label:\s*'IA'", "{ icon: '🤖', label: 'IA'", c)
c = re.sub(r"\{\s*icon:\s*'.*?',\s*label:\s*'Vecinos'", "{ icon: '👥', label: 'Vecinos'", c)
c = re.sub(r"\{\s*icon:\s*'.*?',\s*label:\s*'M.s'", "{ icon: '☰',  label: 'Más'", c)
c = re.sub(r"Navegaci.n", "Navegación", c)
c = re.sub(r"'M.s'", "'Más'", c)

with open('js/bottom-nav.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Fixed JS")
