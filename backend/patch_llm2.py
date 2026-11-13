from pathlib import Path
p = Path("app/llm.py")
s = p.read_text(encoding="utf-8")
assert "def _get_client" in s, "_get_client function nahi mila, mujhe llm.py bhejo"
marker = "    if client is None:"
assert s.count(marker) == 1, "marker ek baar nahi mila, mujhe llm.py bhejo"
i = s.index(marker)
if "client = _get_client()" not in s[s.rfind("def call_llm", 0, i):i]:
    s = s[:i] + "    client = _get_client()\n" + s[i:]
    print("added client = _get_client()")
else:
    print("client assignment already there")
s = s.replace("_client.models.generate_content(", "client.models.generate_content(")
p.write_text(s, encoding="utf-8")
print("llm.py fixed")
