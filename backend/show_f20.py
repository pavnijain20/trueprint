import json
r = json.load(open("eval/report.json", encoding="utf-8"))
for x in r["rows"]:
    if "Winter Sale" in x["draft"]:
        print("OK " if "F20" in x["predicted"] else "MISS", x["predicted"], "|", x["draft"][:70])
