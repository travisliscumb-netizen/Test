/**
 * Demo data.
 *
 * Entirely invented: fictional street names, coordinates scattered over the
 * Barrie area so the map and the optimiser behave realistically, and a
 * synthetic six-week service history so the learning system has something to
 * chew on immediately.
 *
 * It exists because the real route is customer data and this repository is
 * public. Anyone can run the app, and the tests can exercise every path,
 * without a single real address ever leaving the operator's phone.
 */

const STREETS = [
  ['Alder Hollow', 'Mon'], ['Birch Row', 'Mon'], ['Cedar Bend', 'Mon'], ['Dunmore Close', 'Mon'],
  ['Elmgrove Walk', 'Mon'], ['Fernway Court', 'Mon'], ['Gorsehill Lane', 'Mon'],
  ['Harrow Field', 'Tue'], ['Ivybridge Way', 'Tue'], ['Juniper Rise', 'Tue'], ['Kestrel Green', 'Tue'],
  ['Larkspur Mews', 'Tue'], ['Mossgate Drive', 'Tue'], ['Northcote Path', 'Tue'],
  ['Oakhaven Terrace', 'Wed'], ['Pinefall Road', 'Wed'], ['Quarry Bank', 'Wed'], ['Redstone Loop', 'Wed'],
  ['Sorrelwood Place', 'Wed'], ['Thornbury Gate', 'Wed'],
  ['Underhill Croft', 'Thu'], ['Vinemount Circle', 'Thu'], ['Willowmere Ridge', 'Thu'],
  ['Yarrow Cross', 'Thu'], ['Ashfield Common', 'Thu'], ['Brackenlea Court', 'Thu'],
  ['Chandler Glen', 'Fri'], ['Deerfoot Trail', 'Fri'], ['Everley Square', 'Fri'],
  ['Foxglove Chase', 'Fri'], ['Gallowtree Row', 'Fri'], ['Hazelbank Drive', 'Fri'],
];

const NOTES = {
  2: 'Hand mow — the slope scalps with the stander.',
  5: 'Gate latch sticks. Lift and push.',
  9: 'Neighbour works nights — nothing before 9am.',
  14: 'Leave the seeded patch by the driveway alone.',
  18: 'Close the gate. Dog.',
  23: 'Trim the interlock borders weekly.',
  27: 'Cut high, 5 inches. No grass clippings in the beds.',
  30: 'Cut as late in the week as possible.',
};

/** Deterministic pseudo-random, so the demo is identical on every device. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildDemoProperties() {
  const r = rng(20260909);
  return STREETS.map(([street, day], i) => {
    // Clustered by weekday so each day is a coherent geographic run.
    const dayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(day);
    const clusterLat = 44.345 + dayIndex * 0.018;
    const clusterLng = -79.735 + dayIndex * 0.021;
    return {
      id: `demo-${i}`,
      address: `${10 + Math.floor(r() * 180)} ${street}`,
      city: 'Barrie',
      crew: 'south',
      day,
      order: i,
      note: NOTES[i] || '',
      lat: clusterLat + (r() - 0.5) * 0.016,
      lng: clusterLng + (r() - 0.5) * 0.024,
      geoSource: 'seed',
      pushMow: i % 7 === 2,
      active: true,
      legacyId: `demo-${i}`,
    };
  });
}

/**
 * Six weeks of plausible completions, so the demo shows a *learned* app rather
 * than an empty one. Each property has its own characteristic duration plus
 * noise, and two of the weeks include a batch of late taps, because that is
 * what the real data looks like and the estimator should be seen coping with it.
 */
export function buildDemoEvents(properties, weeks = 6, now = Date.now()) {
  const r = rng(77);
  const base = properties.map((p, i) => 9 + (i % 5) * 3 + r() * 6);
  const events = [];
  const dayNum = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };

  for (let w = weeks; w >= 1; w--) {
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
      const stops = properties.filter((p) => p.day === day);
      if (!stops.length) continue;
      const d = new Date(now - w * 7 * 86400000);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + (dayNum[day] - 1));
      d.setHours(8, Math.floor(r() * 20), 0, 0);
      let t = d.getTime();
      events.push({ type: 'day-start', at: t - 12 * 60000, date: iso(t) + '|south' });

      const batchWeek = w === 3 || w === 5;
      stops.forEach((p, idx) => {
        const i = properties.indexOf(p);
        const service = Math.max(5, base[i] * (0.82 + r() * 0.42));
        const travel = 2 + r() * 7;
        t += (service + travel) * 60000;
        if (batchWeek && idx >= stops.length - 3) {
          // The last three of the day tapped together, a minute apart.
          events.push({ type: 'complete', propertyId: p.id, at: t, date: iso(t) + '|south', source: 'manual' });
        } else {
          events.push({ type: 'complete', propertyId: p.id, at: t, date: iso(t) + '|south', source: 'manual' });
        }
      });
      if (batchWeek) {
        const tail = stops.slice(-3);
        const stamp = t + 60000;
        tail.forEach((p, k) => {
          const e = events.find((x) => x.propertyId === p.id && Math.abs(x.at - t) < 3600e3);
          if (e) e.at = stamp + k * 1200;
        });
      }
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

function iso(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
