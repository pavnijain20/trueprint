from pathlib import Path
p = Path("app/agents.py")
s = p.read_text(encoding="utf-8")
bad = '    rule_findings += find_expired_fact_use(draft, list_chunks("fact"))'
good = ('    rule_findings = rule_check(draft, get_chunk)\n'
        '    rule_findings += find_expired_fact_use(draft, list_chunks("fact"))')
assert s.count(bad) == 1, "bad line nahi mili ya ek se zyada hai"
assert "from app.rules import rule_check" in s, "rule_check ka import gayab hai"
p.write_text(s.replace(bad, good), encoding="utf-8")
print("agents.py fixed")
