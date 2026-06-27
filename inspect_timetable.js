const https = require('https');

const url = 'https://api.tfl.gov.uk/Line/central/Timetable/940GZZLUBNK';
const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
};

https.get(url, options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.disambiguation && data.disambiguation.disambiguationOptions) {
        const nextUri = 'https://api.tfl.gov.uk' + data.disambiguation.disambiguationOptions[0].uri;
        https.get(nextUri, options, (res2) => {
          let body2 = '';
          res2.on('data', (chunk) => body2 += chunk);
          res2.on('end', () => {
            const data2 = JSON.parse(body2);
            if (data2.stations && data2.stations.length > 0) {
                console.log("Last station in data2.stations:", data2.stations[data2.stations.length - 1].name);
            }
            if (data2.timetable && data2.timetable.routes && data2.timetable.routes.length > 0) {
                const route = data2.timetable.routes[0];
                if (route.stationIntervals && route.stationIntervals.length > 0) {
                    const interval = route.stationIntervals[0];
                    if (interval.intervals && interval.intervals.length > 0) {
                        const lastInterval = interval.intervals[interval.intervals.length - 1];
                        console.log("Last interval in stationIntervals:", lastInterval.stopId);
                        // Let's find this stopId in data2.stops or data2.stations
                        const stop = (data2.stops || []).find(s => s.id === lastInterval.stopId);
                        if (stop) console.log("Found stop name:", stop.name);
                        const station = (data2.stations || []).find(s => s.id === lastInterval.stopId);
                        if (station) console.log("Found station name:", station.name);
                    }
                }
            }
          });
        });
      }
    } catch (e) {
      console.error("JSON error:", e.message);
    }
  });
}).on('error', (e) => {
  console.error("Fetch error:", e.message);
});
