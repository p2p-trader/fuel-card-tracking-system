/**
 * Reports.gs — dashboard (10 panels), the 9 reports, settings administration,
 * API keys, backup/restore, year archiving, history and demo data.
 */

/* ---------- shared lookups for forms/filters ---------- */

function bootstrapData(token) {
  guard(token, null);
  return {
    vehicles: getVehicles(token),
    cards: getCards(token),
    drivers: getDrivers(token),
    pumps: getPumps(token),
    lockedMonths: lockedMonths_(),
    settings: (function () {
      var s = getSettings();
      return { companyTankFuelType: s.companyTankFuelType || '', lowCardPct: num(s.lowCardPct, 20) };
    })()
  };
}

/* ---------- dashboard ---------- */

function getDashboard(token) {
  var user = guard(token, 'dashboard');
  var mk = currentMonthKey();
  var lmk = prevMonthKey(mk);
  var entries = loadTable('Entries');
  var vehicles = loadTable('Vehicles');
  var cards = loadTable('Cards');
  var flags = loadTable('Flags');
  var trips = loadTable('Trips');
  var s = getSettings();
  var today = todayStr();

  function litresIn(month, source) {
    return round2(entries.filter(function (e) {
      return monthKeyOf(e.Date) === month && (!source || e.Source === source);
    }).reduce(function (sum, e) { return sum + num(e.Litres); }, 0));
  }

  var summary = {
    litresThisMonth: litresIn(mk), litresLastMonth: litresIn(lmk),
    activeCards: cards.filter(function (c) { return c.Status === 'Active'; }).length,
    activeVehicles: vehicles.filter(function (v) { return v.Status === 'Active'; }).length,
    entriesToday: entries.filter(function (e) { return e.Date === today; }).length,
    openFlags: flags.filter(function (f) { return f.Status === 'Open'; }).length,
    month: mk
  };

  var attention = flags.filter(function (f) { return f.Status === 'Open'; })
    .sort(function (a, b) { return a.CreatedAt < b.CreatedAt ? 1 : -1; })
    .slice(0, 30).map(function (f) {
      var v = f.VehicleId ? findById(vehicles, f.VehicleId) : null;
      return { kind: f.Kind, message: f.Message, vehicleReg: v ? v.RegNo : '', period: f.Period || '', flagId: f.Id };
    });
  // Service due / overdue (Q52) joins Needs Attention
  vehicles.forEach(function (v) {
    if (v.Status !== 'Active' || !(num(v.ServiceIntervalKm) > 0)) return;
    var live = vehicleLiveStats(v.Id);
    var dueIn = num(v.LastServiceMeter) + num(v.ServiceIntervalKm) - live.meter;
    if (dueIn < 0) attention.push({ kind: 'SERVICE', message: 'Service OVERDUE by ' + round2(-dueIn) + ' km.', vehicleReg: v.RegNo, period: '' });
    else if (dueIn <= num(s.serviceWarnKm, 500)) attention.push({ kind: 'SERVICE', message: 'Service due in ' + round2(dueIn) + ' km (at meter ' + (num(v.LastServiceMeter) + num(v.ServiceIntervalKm)) + ').', vehicleReg: v.RegNo, period: '' });
  });
  // Trips open too long (Q53)
  trips.forEach(function (t) {
    if (t.Status !== 'Open') return;
    var days = daysBetween(t.StartDate, today);
    if (days > num(s.tripLongDays, 7)) {
      var v = findById(vehicles, t.VehicleId);
      attention.push({ kind: 'TRIP_LONG', message: 'Trip to ' + t.ToLoc + ' has been open for ' + days + ' days (started ' + t.StartDate + ').', vehicleReg: v ? v.RegNo : '', period: '' });
    }
  });

  var tanks = vehicles.filter(function (v) { return v.Status === 'Active'; }).map(function (v) {
    var live = vehicleLiveStats(v.Id);
    return {
      id: v.Id, regNo: v.RegNo, model: v.Model, tank: live.tank, capacity: num(v.TankCapacity),
      pct: num(v.TankCapacity) > 0 ? Math.round(live.tank / num(v.TankCapacity) * 100) : null,
      negative: live.tank < 0, over: num(v.TankCapacity) > 0 && live.tank > num(v.TankCapacity),
      nearEmpty: num(v.TankCapacity) > 0 && live.tank >= 0 && live.tank <= num(v.TankCapacity) * 0.15
    };
  });

  var sourceSplit = { CARD: litresIn(mk, 'CARD'), CASH: litresIn(mk, 'CASH'), TANK: litresIn(mk, 'TANK') };

  var chart = [];
  for (var i = 29; i >= 0; i--) {
    var d = addDays(today, -i);
    chart.push({
      date: d,
      litres: round2(entries.filter(function (e) { return e.Date === d; })
        .reduce(function (sum, e) { return sum + num(e.Litres); }, 0))
    });
  }

  var ctx = ctx_();
  var recentEntries = entries.slice().sort(function (a, b) {
    var ka = a.Date + ' ' + (a.Time || ''), kb = b.Date + ' ' + (b.Time || '');
    return ka < kb ? 1 : -1;
  }).slice(0, 10).map(function (e) { return entryDto_(e, ctx); });

  var recentActivity = loadTable('AuditLog').slice()
    .sort(function (a, b) { return a.Timestamp < b.Timestamp ? 1 : -1; })
    .slice(0, 8).map(function (r) {
      return { at: r.Timestamp, username: r.Username, action: r.Action, details: r.Details };
    });

  var drivers = loadTable('Drivers');
  var outNow = trips.filter(function (t) { return t.Status === 'Open'; }).map(function (t) {
    var v = findById(vehicles, t.VehicleId);
    var d = t.DriverId ? findById(drivers, t.DriverId) : null;
    return {
      tripId: t.Id, vehicleReg: v ? v.RegNo : '', driverName: d ? d.Name : '',
      toLoc: t.ToLoc, since: t.StartDate, days: daysBetween(t.StartDate, today)
    };
  });

  var perVehicle = {};
  entries.forEach(function (e) {
    if (monthKeyOf(e.Date) !== mk) return;
    perVehicle[e.VehicleId] = (perVehicle[e.VehicleId] || 0) + num(e.Litres);
  });
  var top5 = Object.keys(perVehicle).map(function (vid) {
    var v = findById(vehicles, vid);
    return { vehicleReg: v ? v.RegNo : vid, litres: round2(perVehicle[vid]) };
  }).sort(function (a, b) { return b.litres - a.litres; }).slice(0, 5);

  return {
    summary: summary,
    cards: getCards(token, mk),
    attention: attention,
    tanks: tanks,
    sourceSplit: sourceSplit,
    chart: chart,
    recentEntries: recentEntries,
    recentActivity: recentActivity,
    outNow: outNow,
    top5: top5,
    branding: branding_()
  };
}

/* ---------- reports ---------- */

function getReport(token, name, p) {
  var user = guard(token, 'reports.view');
  if (p && p.export && !hasPerm(user, 'reports.export')) fail('You do not have permission to export reports.');
  p = p || {};
  var month = p.month || currentMonthKey();
  var entries = loadTable('Entries');
  var vehicles = loadTable('Vehicles');
  var cards = loadTable('Cards');
  var drivers = loadTable('Drivers');
  var ctx = ctx_();
  var vReg = function (id) { var v = findById(vehicles, id); return v ? v.RegNo : ''; };
  var cNum = function (id) { var c = id ? findById(cards, id) : null; return c ? c.Number : ''; };
  var dName = function (id) { var d = id ? findById(drivers, id) : null; return d ? d.Name : ''; };

  if (name === 'monthly-cards') {
    return { title: 'Monthly Card Report — ' + month, columns: ['Card', 'Provider', 'Vehicle', 'Limit (Ltr)', 'Used (Ltr)', 'Remaining (Ltr)', 'Status'],
      rows: cards.map(function (c) {
        var st = cardLiveStats(c, entries, month);
        return [c.Number, c.Provider || '', vReg(c.PrimaryVehicleId), num(c.LimitLitres), st.used, st.remaining, c.Status];
      }) };
  }
  if (name === 'monthly-vehicles') {
    return { title: 'Monthly Vehicle Report — ' + month, columns: ['Vehicle', 'Model', 'Litres Filled', 'Km Run', 'Average Used (Ltr)', 'Tank Balance (Ltr)'],
      rows: vehicles.map(function (v) {
        var mine = entries.filter(function (e) { return String(e.VehicleId) === String(v.Id) && monthKeyOf(e.Date) === month; });
        var filled = round2(mine.reduce(function (s2, e) { return s2 + num(e.Litres); }, 0));
        var km = round2(mine.reduce(function (s2, e) { return s2 + num(e.KmRun); }, 0));
        var used = round2(mine.reduce(function (s2, e) { return s2 + num(e.UsedLitres); }, 0));
        return [v.RegNo, v.Model, filled, km, used, vehicleLiveStats(v.Id).tank];
      }) };
  }
  if (name === 'ledger') {
    var rows = entries.filter(function (e) {
      if (p.from && e.Date < p.from) return false;
      if (p.to && e.Date > p.to) return false;
      if (p.vehicleId && String(e.VehicleId) !== String(p.vehicleId)) return false;
      if (p.cardId && String(e.CardId) !== String(p.cardId)) return false;
      if (p.pumpId && String(e.PumpId) !== String(p.pumpId)) return false;
      if (p.driverId && String(e.DriverId) !== String(p.driverId)) return false;
      return true;
    }).sort(function (a, b) { return (a.Date + a.Time) < (b.Date + b.Time) ? -1 : 1; })
      .map(function (e) {
        var dto = entryDto_(e, ctx);
        return [e.Date, e.Time || '', e.Source, dto.vehicleReg, dto.cardNumber, dto.pumpName, e.DocNo, num(e.Litres), num(e.Meter), dto.driverName, num(e.TankAfter)];
      });
    return { title: 'Fuel Ledger', columns: ['Date', 'Time', 'Source', 'Vehicle', 'Card', 'Pump', 'Document No.', 'Litres', 'Meter', 'Driver', 'Tank After (Ltr)'], rows: rows };
  }
  if (name === 'alternate-card') {
    var alt = entries.filter(function (e) { return String(e.AlternateCard) === '1'; })
      .sort(function (a, b) { return a.Date < b.Date ? 1 : -1; })
      .map(function (e) {
        var v = findById(vehicles, e.VehicleId);
        var own = v && v.CardId ? findById(cards, v.CardId) : null;
        return [e.Date, vReg(e.VehicleId), own ? own.Number : '', cNum(e.CardId), e.DocNo, num(e.Litres), dName(e.DriverId)];
      });
    return { title: 'Alternate Card Report', columns: ['Date', 'Vehicle', 'Vehicle\'s Own Card', 'Card Actually Used', 'Tracking ID', 'Litres', 'Driver'], rows: alt };
  }
  if (name === 'flagged') {
    var fl = listFlags(token, '');
    return { title: 'Flagged Entries Report', columns: ['Created', 'Kind', 'Vehicle', 'Card', 'Period', 'Message', 'Status', 'Resolved By', 'Resolution Note'],
      rows: fl.map(function (f) { return [String(f.createdAt).slice(0, 10), f.kind, f.vehicleReg, f.cardNumber, f.period, f.message, f.status, f.resolvedBy, f.resolveNote]; }) };
  }
  if (name === 'source') {
    return { title: 'Source Report — ' + month, columns: ['Source', 'Entries', 'Litres'],
      rows: ['CARD', 'CASH', 'TANK'].map(function (src) {
        var mine = entries.filter(function (e) { return e.Source === src && monthKeyOf(e.Date) === month; });
        return [src === 'CARD' ? 'Card' : src === 'CASH' ? 'Cash (pump)' : 'Company Tank', mine.length,
          round2(mine.reduce(function (s2, e) { return s2 + num(e.Litres); }, 0))];
      }) };
  }
  if (name === 'driver') {
    return { title: 'Driver Report — ' + month, columns: ['Driver', 'Fills', 'Litres', 'Km Run', 'Trips', 'Trip Km'],
      rows: drivers.map(function (d) {
        var mine = entries.filter(function (e) { return String(e.DriverId) === String(d.Id) && monthKeyOf(e.Date) === month; });
        var tr = loadTable('Trips').filter(function (t) { return String(t.DriverId) === String(d.Id) && monthKeyOf(t.StartDate) === month && t.Status === 'Closed'; });
        return [d.Name, mine.length,
          round2(mine.reduce(function (s2, e) { return s2 + num(e.Litres); }, 0)),
          round2(mine.reduce(function (s2, e) { return s2 + num(e.KmRun); }, 0)),
          tr.length, round2(tr.reduce(function (s2, t) { return s2 + num(t.Km); }, 0))];
      }) };
  }
  if (name === 'tank-audit') {
    var au = listTankAudits(token);
    return { title: 'Tank Audit Report', columns: ['Date', 'Vehicle', 'System (Ltr)', 'Physical (Ltr)', 'Difference (Ltr)', 'Reason', 'Auditor'],
      rows: au.map(function (a) { return [a.date, a.vehicleReg, a.systemLitres, a.physicalLitres, a.difference, a.reason, a.auditor]; }) };
  }
  if (name === 'trips') {
    var tr2 = listTrips(token, { from: p.from, to: p.to, vehicleId: p.vehicleId });
    return { title: 'Trip Report', columns: ['Start', 'Return', 'Vehicle', 'Driver', 'From', 'To', 'Purpose', 'Km', 'Status'],
      rows: tr2.map(function (t) { return [t.startDate, t.endDate, t.vehicleReg, t.driverName, t.fromLoc, t.toLoc, t.purpose, t.km, t.status]; }) };
  }
  fail('Unknown report: ' + name);
}

/* ---------- settings administration ---------- */

function getSettingsAdmin(token) {
  guard(token, 'settings.manage');
  var s = getSettings();
  var keys = [];
  try { keys = JSON.parse(s.apiKeys || '[]'); } catch (e) { keys = []; }
  return {
    companyName: s.companyName || '', logoSvg: s.logoSvg || '', brandColor: s.brandColor || '#2563eb',
    address: s.address || '', phone: s.phone || '', recoveryEmail: s.recoveryEmail || '',
    lowCardPct: num(s.lowCardPct, 20), expiryWarnDays: num(s.expiryWarnDays, 30),
    meterJumpKm: num(s.meterJumpKm, 1000), serviceWarnKm: num(s.serviceWarnKm, 500),
    tripLongDays: num(s.tripLongDays, 7), companyTankFuelType: s.companyTankFuelType || '',
    apiKeys: keys, archives: (function () { try { return JSON.parse(s.archives || '[]'); } catch (e) { return []; } })()
  };
}

function saveSettingsAdmin(token, p) {
  var user = guard(token, 'settings.manage');
  setSettings({
    companyName: p.companyName || '', logoSvg: sanitizeSvg(p.logoSvg || ''),
    brandColor: p.brandColor || '#2563eb', address: p.address || '', phone: p.phone || '',
    recoveryEmail: p.recoveryEmail || '', lowCardPct: num(p.lowCardPct, 20),
    expiryWarnDays: num(p.expiryWarnDays, 30), meterJumpKm: num(p.meterJumpKm, 1000),
    serviceWarnKm: num(p.serviceWarnKm, 500), tripLongDays: num(p.tripLongDays, 7),
    companyTankFuelType: p.companyTankFuelType || ''
  });
  logAudit(user.Username, 'settings', 'Settings', '', 'Settings updated');
  return { ok: true, branding: branding_() };
}

function createApiKey(token, label) {
  var user = guard(token, 'settings.manage');
  var s = getSettings();
  var keys = [];
  try { keys = JSON.parse(s.apiKeys || '[]'); } catch (e) { keys = []; }
  var key = 'fcs_' + Utilities.getUuid().replace(/-/g, '');
  keys.push({ key: key, label: label || 'API key', createdAt: nowIso(), active: true });
  setSetting('apiKeys', JSON.stringify(keys));
  logAudit(user.Username, 'api-key-create', 'Settings', '', 'API key created: ' + (label || ''));
  return { ok: true, key: key };
}

function revokeApiKey(token, key) {
  var user = guard(token, 'settings.manage');
  var s = getSettings();
  var keys = [];
  try { keys = JSON.parse(s.apiKeys || '[]'); } catch (e) { keys = []; }
  keys.forEach(function (k) { if (k.key === key) k.active = false; });
  setSetting('apiKeys', JSON.stringify(keys));
  logAudit(user.Username, 'api-key-revoke', 'Settings', '', 'API key revoked');
  return { ok: true };
}

/* ---------- backup / restore ---------- */

function collectBackup_() {
  var out = { exportedAt: nowIso(), version: 1, tables: {} };
  Object.keys(TABLES).forEach(function (name) { out.tables[name] = loadTable(name); });
  return out;
}

function downloadBackup(token) {
  var user = guard(token, 'backup.download');
  logAudit(user.Username, 'backup-download', 'System', '', 'Full backup downloaded');
  return collectBackup_();
}

function prepareRestore(token) {
  guard(token, 'backup.download');
  // The current data is handed back first so the client downloads it before
  // any restore can overwrite it (Q48).
  return collectBackup_();
}

function confirmRestore(token, backup) {
  var user = guard(token, 'backup.download');
  if (!backup || !backup.tables) fail('That backup file is not valid.');
  var names = Object.keys(TABLES);
  for (var i = 0; i < names.length; i++) {
    if (!Array.isArray(backup.tables[names[i]])) fail('That backup file is missing the ' + names[i] + ' table.');
  }
  names.forEach(function (name) { saveTable(name, backup.tables[name]); });
  _tabsEnsured = true;
  logAudit(user.Username, 'restore', 'System', '', 'Data restored from a backup file dated ' + (backup.exportedAt || 'unknown'));
  // Rebuild every vehicle's calculated chain after a restore
  loadTable('Vehicles').forEach(function (v) { try { recalcVehicle(v.Id); } catch (e) {} });
  return { ok: true };
}

/* ---------- year archiving (Q52) ---------- */

function archiveYear(token, year) {
  var user = guard(token, 'settings.manage');
  year = String(year);
  var archive = SpreadsheetApp.create('Fuel Archive ' + year);
  var counts = {};
  ['Entries', 'Trips', 'TankAudits', 'Flags', 'AuditLog'].forEach(function (name) {
    var headers = TABLES[name];
    var rows = loadTable(name);
    var inYear = rows.filter(function (r) {
      var d = r.Date || r.StartDate || r.CreatedAt || r.Timestamp || '';
      return String(d).slice(0, 4) === year;
    });
    var keep = rows.filter(function (r) {
      var d = r.Date || r.StartDate || r.CreatedAt || r.Timestamp || '';
      return String(d).slice(0, 4) !== year;
    });
    var sh = archive.getSheets()[0];
    if (name !== 'Entries') sh = archive.insertSheet(name); else sh.setName(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (inYear.length) {
      sh.getRange(2, 1, inYear.length, headers.length).setValues(inYear.map(function (o) {
        return headers.map(function (h) { return o[h] === undefined || o[h] === null ? '' : o[h]; });
      }));
    }
    saveTable(name, keep);
    counts[name] = inYear.length;
  });
  var s = getSettings();
  var archives = [];
  try { archives = JSON.parse(s.archives || '[]'); } catch (e) { archives = []; }
  archives.push({ year: year, url: archive.getUrl(), at: nowIso(), counts: counts });
  setSetting('archives', JSON.stringify(archives));
  logAudit(user.Username, 'archive-year', 'System', '', 'Year ' + year + ' archived: ' + JSON.stringify(counts));
  loadTable('Vehicles').forEach(function (v) { try { recalcVehicle(v.Id); } catch (e) {} });
  return { ok: true, url: archive.getUrl(), counts: counts };
}

/* ---------- history ---------- */

function getHistory(token, limit) {
  guard(token, 'history.view');
  return loadTable('AuditLog')
    .sort(function (a, b) { return a.Timestamp < b.Timestamp ? 1 : -1; })
    .slice(0, limit || 300)
    .map(function (r) {
      return { at: r.Timestamp, username: r.Username, action: r.Action, entity: r.Entity, details: r.Details };
    });
}

/* ---------- bulk import (Q48) ---------- */

function bulkImport(token, kind, csvText) {
  var user = guard(token, 'settings.manage');
  var rows = Utilities.parseCsv(String(csvText || ''));
  if (rows.length < 2) fail('The file has no data rows.');
  var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  function cell(row, names) {
    for (var i = 0; i < names.length; i++) {
      var idx = headers.indexOf(names[i]);
      if (idx !== -1) return String(row[idx] === undefined ? '' : row[idx]).trim();
    }
    return '';
  }
  var added = 0, errors = [];
  for (var r = 1; r < rows.length; r++) {
    var row = rows[r];
    if (row.join('').trim() === '') continue;
    try {
      if (kind === 'vehicles') {
        saveVehicle(token, {
          regNo: cell(row, ['regno', 'registration no', 'registration']), model: cell(row, ['model', 'vehicle name']),
          fuelType: cell(row, ['fueltype', 'fuel type']) || 'Petrol', stdAvg: num(cell(row, ['stdavg', 'average', 'standard average'])),
          tankCapacity: num(cell(row, ['tankcapacity', 'tank capacity'])), openingMeter: num(cell(row, ['openingmeter', 'opening meter'])),
          openingTank: num(cell(row, ['openingtank', 'opening tank'])), ownership: cell(row, ['ownership']) || 'Company Own',
          contractorName: cell(row, ['contractorname', 'contractor'])
        });
      } else if (kind === 'cards') {
        saveCard(token, {
          number: cell(row, ['number', 'card number', 'card']), pin: cell(row, ['pin', 'code']),
          provider: cell(row, ['provider', 'company']), limitLitres: num(cell(row, ['limitlitres', 'limit', 'monthly limit'])),
          openingRemaining: num(cell(row, ['openingremaining', 'remaining'])), expiryDate: cell(row, ['expirydate', 'expiry'])
        });
      } else if (kind === 'drivers') {
        saveDriver(token, { name: cell(row, ['name', 'driver', 'driver name']) });
      } else if (kind === 'pumps') {
        savePump(token, { name: cell(row, ['name', 'pump', 'pump name']) });
      } else {
        fail('Unknown import kind: ' + kind);
      }
      added++;
    } catch (e) {
      errors.push('Row ' + (r + 1) + ': ' + e.message);
    }
  }
  logAudit(user.Username, 'bulk-import', kind, '', added + ' imported, ' + errors.length + ' skipped');
  return { ok: true, added: added, errors: errors };
}

/* ---------- demo data (Q44: only by button, always marked, clear removes only demo) ---------- */

function loadDemoData(token) {
  var user = guard(token, 'settings.manage');
  if (loadTable('Vehicles').some(function (v) { return v.Demo === '1'; })) fail('Demo data is already loaded. Clear it first.');
  var D = '1';
  var v1 = saveVehicle(token, { regNo: 'DEMO-101', model: 'Toyota Corolla', fuelType: 'Petrol', stdAvg: 12.5, tankCapacity: 45, openingMeter: 50000, openingTank: 35, ownership: 'Company Own', serviceIntervalKm: 5000, lastServiceMeter: 48000, demo: D }).id;
  var v2 = saveVehicle(token, { regNo: 'DEMO-102', model: 'Suzuki Bolan', fuelType: 'Petrol', stdAvg: 11, tankCapacity: 36, openingMeter: 82000, openingTank: 20, ownership: 'Company Own', demo: D }).id;
  var v3 = saveVehicle(token, { regNo: 'DEMO-103', model: 'Hino Truck', fuelType: 'Diesel', stdAvg: 6.5, tankCapacity: 100, openingMeter: 210000, openingTank: 60, ownership: 'Third-Party', contractorName: 'Demo Logistics', demo: D }).id;
  var c1 = saveCard(token, { number: 'DEMO-001', pin: '1234', provider: 'PSO', limitLitres: 300, openingRemaining: 300, primaryVehicleId: v1, demo: D }).id;
  var c2 = saveCard(token, { number: 'DEMO-002', pin: '2345', provider: 'Shell', limitLitres: 250, openingRemaining: 250, primaryVehicleId: v2, demo: D }).id;
  var c3 = saveCard(token, { number: 'DEMO-003', pin: '3456', provider: 'Attock', limitLitres: 600, openingRemaining: 600, primaryVehicleId: v3, demo: D }).id;
  var vehicles = loadTable('Vehicles');
  [ [v1, c1], [v2, c2], [v3, c3] ].forEach(function (pair) {
    var v = findById(vehicles, pair[0]); if (v) v.CardId = pair[1];
  });
  saveTable('Vehicles', vehicles);
  var d1 = saveDriver(token, { name: 'Demo Driver Ahmed', demo: D }).id;
  var d2 = saveDriver(token, { name: 'Demo Driver Bilal', demo: D }).id;
  saveDriver(token, { name: 'Demo Driver Chen', demo: D });
  saveDriver(token, { name: 'Demo Driver Dawood', demo: D });
  var p1 = savePump(token, { name: 'Demo Pump — PSO Clifton', demo: D }).id;
  var p2 = savePump(token, { name: 'Demo Pump — Shell DHA', demo: D }).id;
  var m = currentMonthKey();
  var d05 = m + '-05', d06 = m + '-06', d07 = m + '-07';
  assignDriver(token, v1, d1, d05);
  saveEntry(token, { vehicleId: v1, date: d05, time: '09:15', source: 'CARD', cardId: c1, pumpId: p1, docNo: 'DEMO-TRK-001', litres: 25, slipRemaining: 275, meter: 50250, demo: D });
  saveEntry(token, { vehicleId: v2, date: d06, time: '10:00', source: 'CARD', cardId: c1, pumpId: p2, docNo: 'DEMO-TRK-002', litres: 20, slipRemaining: 255, meter: 82180, demo: D }); // alternate-card use
  saveEntry(token, { vehicleId: v1, date: d06, time: '12:30', source: 'CASH', pumpId: p1, docNo: 'DEMO-RCP-001', litres: 10, meter: 50370, paidBy: 'Demo Driver Ahmed', reason: 'Card not working', demo: D });
  setSetting('companyTankFuelType', 'Diesel');
  saveEntry(token, { vehicleId: v3, date: d07, time: '08:00', source: 'TANK', docNo: 'DEMO-VCH-001', litres: 40, meter: 210400, demo: D });
  saveEntry(token, { vehicleId: v1, date: d07, time: '09:00', source: 'CARD', cardId: c1, pumpId: p1, docNo: 'DEMO-TRK-003', litres: 15, slipRemaining: 200, meter: 50500, demo: D }); // slip mismatch -> flagged
  startTrip(token, { vehicleId: v1, fromLoc: 'Karachi Office', toLoc: 'Hyderabad', purpose: 'Demo delivery', startDate: d07, startMeter: 50500, demo: D });
  var t2 = startTrip(token, { vehicleId: v2, fromLoc: 'Karachi Office', toLoc: 'Warehouse SITE', purpose: 'Demo pickup', startDate: d06, startMeter: 82180, demo: D });
  closeTrip(token, t2.id, d06, 82260);
  saveTankAudit(token, { vehicleId: v2, date: d07, time: '18:00', physicalLitres: 14, reason: 'Demo monthly audit', demo: D });
  openProblem(token, { vehicleId: v2, startDate: d07, note: 'Demo: engine missing, under observation', tempAvg: 9, demo: D });
  logAudit(user.Username, 'demo-load', 'System', '', 'Demo data loaded');
  return { ok: true };
}

function clearDemoData(token) {
  var user = guard(token, 'settings.manage');
  ['Entries', 'Trips', 'TankAudits', 'VehicleProblems', 'DriverAssignments', 'Cards', 'Vehicles', 'Drivers', 'Pumps'].forEach(function (name) {
    saveTable(name, loadTable(name).filter(function (r) { return r.Demo !== '1'; }));
  });
  var demoIds = {};
  saveTable('Flags', loadTable('Flags').filter(function (f) { return f.Demo !== '1'; }));
  if (getSettings().companyTankFuelType) { /* keep admin's own setting untouched */ }
  loadTable('Vehicles').forEach(function (v) { try { recalcVehicle(v.Id); } catch (e) {} });
  logAudit(user.Username, 'demo-clear', 'System', '', 'Demo data cleared (real data untouched)');
  return { ok: true };
}
