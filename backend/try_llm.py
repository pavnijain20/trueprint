from app.llm import call_llm

result = call_llm("Reply with JSON only.", 'Return {"ok": true}')
print(result)