import json
from app.expiry import find_expired_fact_use
from app.retrieval import list_chunks

facts = list_chunks("fact")
data = json.load(open("eval/drafts.json", encoding="utf-8"))
hit = miss = false_alarm = 0
for d in data:
    flagged = any(f["source"]["id"] == "F20" for f in find_expired_fact_use(d["draft"], facts))
    if "F20" in d["expected"]:
        hit += flagged
        miss += (not flagged)
        print("OK   " if flagged else "MISS ", d["draft"][:85])
    elif flagged:
        false_alarm += 1
        print("FALSE ALARM", d["draft"][:85])
print("code-only: hit", hit, "miss", miss, "false alarms", false_alarm)
