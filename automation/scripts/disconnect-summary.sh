#!/usr/bin/env bash
set -euo pipefail
LOG=/home/ubuntu/clearsun-wa/disconnect-events.log
if [ ! -f "$LOG" ]; then
  echo "no_disconnect_log"
  exit 0
fi

since=${1:-3600} # seconds
cutoff=$(date -u -d "-$since seconds" +%s)

# Count reason codes in window
python3 - <<PY
import json, time
from collections import Counter
import os
log_path = "${LOG}"
cutoff = ${cutoff}

c = Counter()
rows=0
with open(log_path,'r') as f:
    for line in f:
        line=line.strip()
        if not line: continue
        try:
            obj=json.loads(line)
            ts=obj.get('ts','')
            # parse iso
            t=int(time.mktime(time.strptime(ts.split('.')[0], '%Y-%m-%dT%H:%M:%S')))
            if t < cutoff: continue
            reason=str(obj.get('reason','unknown'))
            c[reason]+=1
            rows+=1
        except Exception:
            continue
print('disconnect_events', rows)
for k,v in c.most_common():
    print('reason', k, v)
PY
