import re
import sys

path = sys.argv[1]
needles = sys.argv[2:]
s = open(path, encoding='utf-8').read()
for m in re.finditer(r'const (css\$\d+) = "((?:[^"\\]|\\.)*)";', s):
    name, css = m.group(1), m.group(2)
    for chunk in css.split('}'):
        if any(n in chunk for n in needles):
            print(f'[{name}] {chunk}}}')
