/**
 * Calc.gs — the calculation engine.
 *  - Card remaining per calendar month (limits reset on the 1st; opening
 *    balance covers usage before the system started).
 *  - Vehicle tank chain: Tank = Previous + Filled − Used, Used = Km ÷ Average.
 *    Back-dated entries re-run the whole chain (Q28). Tank audits restart the
 *    balance from the physical figure (Q33).
 *  - Driver resolution from assignment history by slip date (Q15-C).
 *  - Auto flags: negative tank, over-capacity, audit differences, unexplained
 *    km (trip cross-check), slip mismatches.
 */

var AUTO_FLAG_KINDS = ['NEGATIVE_TANK', 'OVER_CAPACITY', 'AUDIT_DIFF', 'UNEXPLAINED_KM', 'METER_JUMP'];

/* ---------- drivers ---------- */

function driverForDate(assignments, vehicleId, dateStr) {
  var best = null;
  assignments.forEach(function (a) {
    if (String(a.VehicleId) !== String(vehicleId)) return;
    if (a.FromDate > dateStr) return;
    if (a.ToDate && a.ToDate < dateStr) return;
    if (!best || a.FromDate > best.FromDate) best = a;
  });
  return best ? String(best.DriverId) : '';
}

function activeAssignment(assignments, vehicleId) {
  var best = null;
  assignments.forEach(function (a) {
    if (String(a.VehicleId) !== String(vehicleId)) return;
    if (a.ToDate) return;
    if (!best || a.FromDate > best.FromDate) best = a;
  });
  return best;
}

/* ---------- averages (standard vs problem-period temporary, Q46) ---------- */

function problemOnDate(problems, vehicleId, dateStr) {
  var found = null;
  problems.forEach(function (p) {
    if (String(p.VehicleId) !== String(vehicleId)) return;
    if (p.StartDate > dateStr) return;
    if (p.EndDate && p.EndDate < dateStr) return;
    if (!found || p.StartDate > found.StartDate) found = p;
  });
  return found;
}

function avgForDate(vehicle, problems, dateStr) {
  var prob = problemOnDate(problems, vehicle.Id, dateStr);
  if (prob && num(prob.TempAvg) > 0) return { avg: num(prob.TempAvg), problem: prob };
  return { avg: num(vehicle.StdAvg), problem: prob };
}

/* ---------- cards ---------- */

/** Litres used by a card in a month, including pre-system usage in its opening month. */
function cardUsedLitres(entries, card, monthKey) {
  var used = 0;
  entries.forEach(function (e) {
    if (e.Source !== 'CARD') return;
    if (String(e.CardId) !== String(card.Id)) return;
    if (monthKeyOf(e.Date) !== monthKey) return;
    used += num(e.Litres);
  });
  if (monthKeyOf(card.OpeningMonth ? (card.OpeningMonth + '-01') : '') === monthKey || card.OpeningMonth === monthKey) {
    used += Math.max(0, num(card.LimitLitres) - num(card.OpeningRemaining));
  }
  return round2(used);
}

function cardRemaining(entries, card, monthKey) {
  return round2(num(card.LimitLitres) - cardUsedLitres(entries, card, monthKey));
}

/* ---------- month lock ---------- */

function lockedMonths_() {
  try { return JSON.parse(getSettings().lockedMonths || '[]'); } catch (e) { return []; }
}

function isMonthLocked(monthKey) {
  return lockedMonths_().indexOf(monthKey) !== -1;
}

function assertMonthWritable(user, monthKey, actionLabel) {
  if (isMonthLocked(monthKey) && !hasPerm(user, 'month.lock')) {
    fail('The month ' + monthKey + ' is locked. An admin with Month Lock permission must unlock it before ' + actionLabel + '.');
  }
}

/* ---------- auto flags ---------- */

function syncAutoFlag(flags, kind, refId, vehicleId, cardId, period, message) {
  var exists = flags.some(function (f) {
    return f.Kind === kind && String(f.RefId) === String(refId) && (f.Period || '') === (period || '');
  });
  if (exists) return false;
  flags.push({
    Id: uid(), Kind: kind, RefId: refId, VehicleId: vehicleId || '', CardId: cardId || '',
    Period: period || '', Message: message, Status: 'Open', ResolveNote: '',
    ResolvedBy: '', ResolvedAt: '', CreatedAt: nowIso(), Demo: ''
  });
  return true;
}

/* ---------- vehicle tank chain ---------- */

/**
 * Recompute every entry of a vehicle in date/time order: KmRun, UsedLitres,
 * TankAfter, DriverId, ProblemPeriod, SystemRemaining (card entries), plus
 * audit SystemLitres/Difference, and refresh auto flags for the vehicle.
 * Returns the updated entries array (also saved).
 */
function recalcVehicle(vehicleId) {
  var vehicles = loadTable('Vehicles');
  var vehicle = findById(vehicles, vehicleId);
  if (!vehicle) return null;
  var entries = loadTable('Entries');
  var audits = loadTable('TankAudits');
  var problems = loadTable('VehicleProblems');
  var assignments = loadTable('DriverAssignments');
  var cards = loadTable('Cards');
  var flags = loadTable('Flags');

  // Drop this vehicle's still-open auto flags; they are rebuilt below.
  // Resolved flags are permanent history and are never touched.
  flags = flags.filter(function (f) {
    return !(String(f.VehicleId) === String(vehicleId) && f.Status === 'Open' && AUTO_FLAG_KINDS.indexOf(f.Kind) !== -1);
  });

  var myEntries = entries.filter(function (e) { return String(e.VehicleId) === String(vehicleId); });
  var myAudits = audits.filter(function (a) { return String(a.VehicleId) === String(vehicleId); });

  var events = [];
  myEntries.forEach(function (e) { events.push({ type: 'entry', at: e.Date + ' ' + (e.Time || '00:00'), ref: e }); });
  myAudits.forEach(function (a) { events.push({ type: 'audit', at: a.Date + ' ' + (a.Time || '23:59'), ref: a }); });
  events.sort(function (x, y) {
    if (x.at !== y.at) return x.at < y.at ? -1 : 1;
    if (x.type !== y.type) return x.type === 'entry' ? -1 : 1;
    return String(x.ref.CreatedAt) < String(y.ref.CreatedAt) ? -1 : 1;
  });

  var tank = num(vehicle.OpeningTank);
  var prevMeter = num(vehicle.OpeningMeter);
  var settings = getSettings();
  var jumpLimit = num(settings.meterJumpKm, 1000);

  events.forEach(function (ev) {
    if (ev.type === 'entry') {
      var e = ev.ref;
      var meter = num(e.Meter);
      var kmRun = meter - prevMeter;
      if (kmRun < 0) kmRun = 0;
      var av = avgForDate(vehicle, problems, e.Date);
      var used = av.avg > 0 ? kmRun / av.avg : 0;
      var tankAfter = tank - used + num(e.Litres);
      e.KmRun = round2(kmRun);
      e.UsedLitres = round2(used);
      e.TankAfter = round2(tankAfter);
      e.DriverId = driverForDate(assignments, vehicleId, e.Date);
      e.ProblemPeriod = av.problem ? '1' : '';
      if (kmRun > jumpLimit && jumpLimit > 0) {
        syncAutoFlag(flags, 'METER_JUMP', e.Id, vehicleId, e.CardId || '', monthKeyOf(e.Date),
          'Unusually large meter jump of ' + round2(kmRun) + ' km on ' + e.Date + ' (limit ' + jumpLimit + ' km).');
      }
      if (tankAfter < 0) {
        syncAutoFlag(flags, 'NEGATIVE_TANK', e.Id, vehicleId, e.CardId || '', monthKeyOf(e.Date),
          'Tank balance went negative (' + round2(tankAfter) + ' Ltr) on ' + e.Date + ' — a fill may be missing or the average may be wrong.');
      }
      if (num(vehicle.TankCapacity) > 0 && tankAfter > num(vehicle.TankCapacity)) {
        syncAutoFlag(flags, 'OVER_CAPACITY', e.Id, vehicleId, e.CardId || '', monthKeyOf(e.Date),
          'Tank balance ' + round2(tankAfter) + ' Ltr exceeds tank capacity ' + num(vehicle.TankCapacity) + ' Ltr on ' + e.Date + '.');
      }
      tank = tankAfter;
      prevMeter = meter;
    } else {
      var a = ev.ref;
      a.SystemLitres = round2(tank);
      a.Difference = round2(num(a.PhysicalLitres) - tank);
      if (num(a.Difference) !== 0) { // STRICT: every difference is flagged (Q34)
        syncAutoFlag(flags, 'AUDIT_DIFF', a.Id, vehicleId, '', monthKeyOf(a.Date),
          'Tank audit on ' + a.Date + ': difference of ' + a.Difference + ' Ltr (system ' + a.SystemLitres + ', physical ' + a.PhysicalLitres + ').');
      }
      tank = num(a.PhysicalLitres); // balance restarts from the physical figure (Q33)
    }
  });

  // Card SystemRemaining on each card entry (after all edits/recalc)
  myEntries.forEach(function (e) {
    if (e.Source === 'CARD' && e.CardId) {
      var card = findById(cards, e.CardId);
      if (card) e.SystemRemaining = cardRemaining(entries, card, monthKeyOf(e.Date));
    } else {
      e.SystemRemaining = '';
    }
  });

  saveTable('Entries', entries);
  saveTable('TankAudits', audits);

  // Unexplained-km cross-check per month (Q51): meter movement vs closed trips
  var trips = loadTable('Trips');
  var months = {};
  myEntries.forEach(function (e) { months[monthKeyOf(e.Date)] = true; });
  Object.keys(months).forEach(function (mk) {
    var inMonth = myEntries.filter(function (e) { return monthKeyOf(e.Date) === mk; });
    if (!inMonth.length) return;
    var maxMeter = Math.max.apply(null, inMonth.map(function (e) { return num(e.Meter); }));
    var before = myEntries.filter(function (e) { return monthKeyOf(e.Date) < mk; });
    var startMeter = before.length
      ? Math.max.apply(null, before.map(function (e) { return num(e.Meter); }))
      : num(vehicle.OpeningMeter);
    var movement = maxMeter - startMeter;
    var tripKm = 0;
    trips.forEach(function (t) {
      if (String(t.VehicleId) !== String(vehicleId)) return;
      if (t.Status !== 'Closed') return;
      if (monthKeyOf(t.StartDate) !== mk) return;
      tripKm += num(t.Km);
    });
    var unexplained = round2(movement - tripKm);
    if (unexplained > 0) {
      syncAutoFlag(flags, 'UNEXPLAINED_KM', vehicleId + ':' + mk, vehicleId, '', mk,
        'Unexplained ' + unexplained + ' km in ' + mk + ': meter moved ' + round2(movement) + ' km but closed trips explain ' + round2(tripKm) + ' km.');
    }
  });

  saveTable('Flags', flags);
  return vehicle;
}

function recalcCardVehicles(cardId) {
  var entries = loadTable('Entries');
  var seen = {};
  entries.forEach(function (e) { if (String(e.CardId) === String(cardId)) seen[e.VehicleId] = true; });
  var cards = loadTable('Cards');
  var card = findById(cards, cardId);
  if (card && card.PrimaryVehicleId) seen[card.PrimaryVehicleId] = true;
  Object.keys(seen).forEach(function (vid) { recalcVehicle(vid); });
}
