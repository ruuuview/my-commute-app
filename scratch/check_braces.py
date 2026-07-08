def check_braces(filepath):
    print(f"Checking {filepath}...")
    with open(filepath, 'r') as f:
        content = f.read()
    
    braces = []
    parens = []
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        for char in line:
            if char == '{':
                braces.append(('{', i))
            elif char == '}':
                if braces:
                    braces.pop()
                else:
                    print(f"Extra '}}' on line {i}")
            elif char == '(':
                parens.append(('(', i))
            elif char == ')':
                if parens:
                    parens.pop()
                else:
                    print(f"Extra ')' on line {i}")
    
    for char, line in braces:
        print(f"Unclosed '{{' from line {line}")
    for char, line in parens:
        print(f"Unclosed '(' from line {line}")

check_braces("/Users/ruuuview/Desktop/my commute project folder/frontend/components/DepartureCard.tsx")
check_braces("/Users/ruuuview/Desktop/my commute project folder/frontend/components/LineCard.tsx")
