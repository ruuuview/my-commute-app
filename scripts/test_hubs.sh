#!/bin/bash
# Test all HUB codes against backend
for id in HUBCAW HUBBAN HUBWAT HUBPAD HUBKGX HUBVXH HUBHHY HUBLBG HUBSRA HUBWIM HUBZWL HUBTCR HUBEUS HUBFPK HUBHMS HUBBDS HUBZFD HUBZCW HUBCAN HUBCUS HUBQPW HUBEPH HUBCHX HUBEAL HUBLST HUBVIC; do
  result=$(curl -s --max-time 4 "https://my-commute-brain.vercel.app/api/stations/$id" 2>/dev/null)
  count=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('departures',[])))" 2>/dev/null)
  if [ "$count" = "" ]; then count="ERR"; fi
  if [ "$count" = "0" ]; then marker="❌ EMPTY"; else marker="✅ OK"; fi
  echo "$marker $id → $count departures"
done
