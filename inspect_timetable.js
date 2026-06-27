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
      console.log("Top-level keys:", Object.keys(data));
      if (data.disambiguation && data.disambiguation.disambiguationOptions) {
        console.log("Found disambiguation options:");
        data.disambiguation.disambiguationOptions.forEach(opt => {
          console.log(`  - Description: ${opt.description}, URI: ${opt.uri}`);
        });
        
        // Let's fetch the first disambiguated URI
        const nextUri = 'https://api.tfl.gov.uk' + data.disambiguation.disambiguationOptions[0].uri;
        console.log(`\nFetching disambiguated URI: ${nextUri}...`);
        https.get(nextUri, options, (res2) => {
          let body2 = '';
          res2.on('data', (chunk) => body2 += chunk);
          res2.on('end', () => {
            const data2 = JSON.parse(body2);
            console.log("Timetable keys:", Object.keys(data2));
            if (data2.timetable) {
              const tt = data2.timetable;
              console.log("timetable keys:", Object.keys(tt));
              if (tt.routes && tt.routes.length > 0) {
                const route = tt.routes[0];
                console.log("Route keys:", Object.keys(route));
                console.log("Route name:", route.name);
                console.log("Route description:", route.description);
                console.log("Route stationIntervals length:", route.stationIntervals ? route.stationIntervals.length : 0);
                if (route.schedules && route.schedules.length > 0) {
                  console.log("Schedule keys:", Object.keys(route.schedules[0]));
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
