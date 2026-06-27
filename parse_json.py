import http.client
import json
import os

conn = http.client.HTTPSConnection("api.tfl.gov.uk")
tfl_key = os.environ.get("TFL_API_KEY", "")
path = "/Line/jubilee/Timetable/940GZZLUSTD"
if tfl_key:
    path += f"?app_key={tfl_key}"

headers = {"User-Agent": "Mozilla/5.0"}
try:
    conn.request("GET", path, headers=headers)
    res = conn.getresponse()
    print("STATUS:", res.status)
    data = json.loads(res.read().decode("utf-8"))
    print("KEYS:", list(data.keys()))
    if "timetable" in data:
        tt = data["timetable"]
        print("TIMETABLE KEYS:", list(tt.keys()))
        if "routes" in tt and len(tt["routes"]) > 0:
            route = tt["routes"][0]
            print("ROUTE KEYS:", list(route.keys()))
            if "schedules" in route and len(route["schedules"]) > 0:
                sched = route["schedules"][0]
                print("SCHEDULE KEYS:", list(sched.keys()))
except Exception as e:
    import traceback
    traceback.print_exc()
