/**
 * Masters.gs — vehicles, fuel cards, drivers, pumps, assignments, vehicle
 * problems and service records.
 */

/* ---------- computed live stats ---------- */

function vehicleLiveStats(vehicleId) {
  var entries = loadTable('Entries').filter(function (e) { return String(e.VehicleId) === String(vehicleId); });
  var audits = loadTable('TankAudits').filter(function (a) { return String(a.VehicleId) === String(vehicleId); });
  var vehicles = loadTable('Vehicles');
  var v = findById(vehicles, vehicleId);
  var tank = v ? num(v.OpeningTank) : 0;
  var meter = v ? num(v.OpeningMeter) : 0;
  var events = [];
  entries.forEach(function (e) { events.push({ at: e.Date + ' ' + (e.Time || '00:00'), tank: num(e.TankAfter), meter: num(e.Meter) }); });
  audits.forEach(function (a) { events.push({ at: a.Date + ' ' + (a.Time || '23:59'), tank: num(a.PhysicalLitres), meter: null }); });
  events.sort(function (x, y) { return x.at < y.at ? -1 : 1; });
  events.forEach(function (ev) { tank = ev.tank; if (ev.meter !== null) meter = ev.meter; });
  return { tank: round2(tank), meter: meter };
}

function cardLiveStats(card, entries, monthKey) {
  var used = cardUsedLitres(entries, card, monthKey);
  var remaining = round2(num(card.LimitLitres) - used);
  var s = getSettings();
  var lowPct = num(s.lowCardPct, 20);
  var low = num(card.LimitLitres) > 0 && remaining <= num(card.LimitLitres) * lowPct / 100;
  // Finish forecast (Q53): projected date the remaining runs out at current pace
  var forecast = '';
  if (monthKey === currentMonthKey() && used > 0 && remaining > 0) {
    var dayOfMonth = parseInt(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd'), 10);
    var pace = used / Math.max(1, dayOfMonth);
    if (pace > 0) forecast = addDays(todayStr(), Math.floor(remaining / pace));
  }
  return { used: used, remaining: remaining, low: low, forecast: forecast };
}

/* ---------- vehicles ---------- */

function getVehicles(token) {
  var user = guard(token, null);
  var vehicles = loadTable('Vehicles');
  var assignments = loadTable('DriverAssignments');
  var drivers = loadTable('Drivers');
  var problems = loadTable('VehicleProblems');
  var cards = loadTable('Cards');
  var s = getSettings();
  return vehicles.map(function (v) {
    var live = vehicleLiveStats(v.Id);
    var asg = activeAssignment(assignments, v.Id);
    var drv = asg ? findById(drivers, asg.DriverId) : null;
    var card = v.CardId ? findById(cards, v.CardId) : null;
    var openProb = problems.some(function (p) { return String(p.VehicleId) === String(v.Id) && p.Status === 'Open'; });
    var nextService = num(v.LastServiceMeter) + num(v.ServiceIntervalKm);
    var serviceDueIn = num(v.ServiceIntervalKm) > 0 ? round2(nextService - live.meter) : null;
    return {
      id: v.Id, regNo: v.RegNo, model: v.Model, fuelType: v.FuelType, cardId: v.CardId || '',
      cardNumber: card ? card.Number : '', openingMeter: num(v.OpeningMeter), stdAvg: num(v.StdAvg),
      tankCapacity: num(v.TankCapacity), openingTank: num(v.OpeningTank), ownership: v.Ownership,
      contractorName: v.ContractorName || '', status: v.Status, currentTank: live.tank,
      currentMeter: live.meter, activeDriverId: asg ? asg.DriverId : '', activeDriverName: drv ? drv.Name : '',
      hasProblem: openProb, serviceIntervalKm: num(v.ServiceIntervalKm),
      lastServiceMeter: num(v.LastServiceMeter), nextServiceAt: num(v.ServiceIntervalKm) > 0 ? nextService : '',
      serviceDueIn: serviceDueIn,
      serviceOverdue: serviceDueIn !== null && serviceDueIn < 0,
      serviceNear: serviceDueIn !== null && serviceDueIn >= 0 && serviceDueIn <= num(s.serviceWarnKm, 500),
      demo: v.Demo || ''
    };
  });
}

function saveVehicle(token, p) {
  var user = guard(token, 'vehicles.manage');
  var vehicles = loadTable('Vehicles');
  if (!p.regNo) fail('Registration No. is required.');
  if (!(num(p.stdAvg) > 0)) fail('Standard Average (km/L) must be greater than zero.');
  if (p.id) {
    var v = findById(vehicles, p.id);
    if (!v) fail('Vehicle not found.');
    v.RegNo = p.regNo; v.Model = p.model || ''; v.FuelType = p.fuelType || v.FuelType;
    v.StdAvg = num(p.stdAvg); v.TankCapacity = num(p.tankCapacity);
    v.Ownership = p.ownership || v.Ownership; v.ContractorName = p.contractorName || '';
    v.ServiceIntervalKm = num(p.serviceIntervalKm); v.CardId = p.cardId || v.CardId || '';
    saveTable('Vehicles', vehicles);
    logAudit(user.Username, 'edit', 'Vehicle', v.Id, 'Vehicle updated: ' + v.RegNo);
    recalcVehicle(v.Id);
    return { ok: true, id: v.Id };
  }
  var nv = {
    Id: uid(), RegNo: p.regNo, Model: p.model || '', FuelType: p.fuelType || 'Petrol',
    CardId: p.cardId || '', OpeningMeter: num(p.openingMeter), StdAvg: num(p.stdAvg),
    TankCapacity: num(p.tankCapacity), OpeningTank: num(p.openingTank),
    Ownership: p.ownership || 'Company Own', ContractorName: p.contractorName || '',
    Status: 'Active', ServiceIntervalKm: num(p.serviceIntervalKm),
    LastServiceMeter: num(p.lastServiceMeter || p.openingMeter), CreatedAt: nowIso(), Demo: p.demo || ''
  };
  vehicles.push(nv);
  saveTable('Vehicles', vehicles);
  logAudit(user.Username, 'create', 'Vehicle', nv.Id, 'Vehicle added: ' + nv.RegNo);
  return { ok: true, id: nv.Id };
}

function setVehicleStatus(token, id, status) {
  var user = guard(token, 'vehicles.manage');
  var vehicles = loadTable('Vehicles');
  var v = findById(vehicles, id);
  if (!v) fail('Vehicle not found.');
  v.Status = status === 'Inactive' ? 'Inactive' : 'Active';
  saveTable('Vehicles', vehicles);
  logAudit(user.Username, 'status', 'Vehicle', id, 'Vehicle ' + v.RegNo + ' set ' + v.Status);
  return { ok: true };
}

function recordService(token, vehicleId, meter) {
  var user = guard(token, 'vehicles.manage');
  var vehicles = loadTable('Vehicles');
  var v = findById(vehicles, vehicleId);
  if (!v) fail('Vehicle not found.');
  v.LastServiceMeter = num(meter);
  saveTable('Vehicles', vehicles);
  logAudit(user.Username, 'service', 'Vehicle', vehicleId, 'Service recorded for ' + v.RegNo + ' at meter ' + meter);
  return { ok: true };
}

/* ---------- fuel cards ---------- */

function getCards(token, monthKey) {
  var user = guard(token, null);
  var canPin = hasPerm(user, 'cards.pin');
  var mk = monthKey || currentMonthKey();
  var entries = loadTable('Entries');
  var vehicles = loadTable('Vehicles');
  var s = getSettings();
  var today = todayStr();
  return loadTable('Cards').map(function (c) {
    var st = cardLiveStats(c, entries, mk);
    var veh = c.PrimaryVehicleId ? findById(vehicles, c.PrimaryVehicleId) : null;
    var expDays = c.ExpiryDate ? daysBetween(today, c.ExpiryDate) : null;
    return {
      id: c.Id, number: c.Number, pin: canPin ? (c.Pin || '') : '',
      pinMasked: c.Pin ? '••••' : '', provider: c.Provider || '',
      limitLitres: num(c.LimitLitres), openingRemaining: num(c.OpeningRemaining),
      openingMonth: c.OpeningMonth || '', primaryVehicleId: c.PrimaryVehicleId || '',
      primaryVehicleReg: veh ? veh.RegNo : '', expiryDate: c.ExpiryDate || '',
      expiringSoon: expDays !== null && expDays >= 0 && expDays <= num(s.expiryWarnDays, 30),
      expired: expDays !== null && expDays < 0,
      status: c.Status, closeReason: c.CloseReason || '', used: st.used,
      remaining: st.remaining, low: st.low, forecast: st.forecast, demo: c.Demo || ''
    };
  });
}

function saveCard(token, p) {
  var user = guard(token, 'cards.manage');
  var cards = loadTable('Cards');
  if (!p.number) fail('Card number is required.');
  if (p.id) {
    var c = findById(cards, p.id);
    if (!c) fail('Card not found.');
    if (p.limitLitres !== undefined && num(p.limitLitres) !== num(c.LimitLitres)) {
      if (!hasPerm(user, 'cards.limit')) fail('You do not have permission to change the monthly limit.');
      logAudit(user.Username, 'limit-change', 'Card', c.Id, 'Limit changed ' + c.LimitLitres + ' -> ' + p.limitLitres + ' for card ' + c.Number);
      c.LimitLitres = num(p.limitLitres);
    }
    c.Number = p.number; c.Provider = p.provider || '';
    if (p.pin) c.Pin = p.pin;
    c.ExpiryDate = p.expiryDate || '';
    c.PrimaryVehicleId = p.primaryVehicleId || c.PrimaryVehicleId || '';
    saveTable('Cards', cards);
    syncVehicleCardLink_(c);
    recalcCardVehicles(c.Id);
    logAudit(user.Username, 'edit', 'Card', c.Id, 'Card updated: ' + c.Number);
    return { ok: true, id: c.Id };
  }
  var nc = {
    Id: uid(), Number: p.number, Pin: p.pin || '', Provider: p.provider || '',
    LimitLitres: num(p.limitLitres), OpeningRemaining: num(p.openingRemaining),
    OpeningMonth: p.openingMonth || currentMonthKey(), PrimaryVehicleId: p.primaryVehicleId || '',
    ExpiryDate: p.expiryDate || '', Status: 'Active', CloseReason: '', ReplacedById: '',
    CreatedAt: nowIso(), Demo: p.demo || ''
  };
  cards.push(nc);
  saveTable('Cards', cards);
  syncVehicleCardLink_(nc);
  logAudit(user.Username, 'create', 'Card', nc.Id, 'Card added: ' + nc.Number);
  return { ok: true, id: nc.Id };
}

function syncVehicleCardLink_(card) {
  if (!card.PrimaryVehicleId) return;
  var vehicles = loadTable('Vehicles');
  var v = findById(vehicles, card.PrimaryVehicleId);
  if (v && String(v.CardId) !== String(card.Id)) {
    v.CardId = card.Id;
    saveTable('Vehicles', vehicles);
  }
}

function getCardPin(token, id) {
  var user = guard(token, 'cards.pin');
  var c = findById(loadTable('Cards'), id);
  if (!c) fail('Card not found.');
  logAudit(user.Username, 'view-pin', 'Card', id, 'PIN viewed for card ' + c.Number);
  return { pin: c.Pin || '' };
}

/** Lost/replaced flow (Q41): close a card, optionally create its replacement. */
function closeCard(token, id, reason, replacement) {
  var user = guard(token, 'cards.manage');
  var cards = loadTable('Cards');
  var c = findById(cards, id);
  if (!c) fail('Card not found.');
  c.Status = 'Closed';
  c.CloseReason = reason || 'Closed';
  var newId = '';
  if (replacement && replacement.number) {
    var nc = {
      Id: uid(), Number: replacement.number, Pin: replacement.pin || '',
      Provider: replacement.provider || c.Provider, LimitLitres: num(replacement.limitLitres || c.LimitLitres),
      OpeningRemaining: num(replacement.openingRemaining), OpeningMonth: currentMonthKey(),
      PrimaryVehicleId: c.PrimaryVehicleId || '', ExpiryDate: replacement.expiryDate || '',
      Status: 'Active', CloseReason: '', ReplacedById: '', CreatedAt: nowIso(), Demo: ''
    };
    cards.push(nc);
    c.ReplacedById = nc.Id;
    newId = nc.Id;
    saveTable('Cards', cards);
    syncVehicleCardLink_(nc);
    logAudit(user.Username, 'replace', 'Card', id, 'Card ' + c.Number + ' closed (' + c.CloseReason + ') and replaced by ' + nc.Number);
  } else {
    saveTable('Cards', cards);
    logAudit(user.Username, 'close', 'Card', id, 'Card ' + c.Number + ' closed (' + c.CloseReason + ')');
  }
  return { ok: true, newCardId: newId };
}

/* ---------- drivers & assignments ---------- */

function getDrivers(token) {
  guard(token, null);
  return loadTable('Drivers').map(function (d) {
    return { id: d.Id, name: d.Name, status: d.Status, demo: d.Demo || '' };
  });
}

function saveDriver(token, p) {
  var user = guard(token, 'drivers.manage');
  var drivers = loadTable('Drivers');
  if (!p.name) fail('Driver name is required.');
  if (p.id) {
    var d = findById(drivers, p.id);
    if (!d) fail('Driver not found.');
    d.Name = p.name;
    saveTable('Drivers', drivers);
    logAudit(user.Username, 'edit', 'Driver', d.Id, 'Driver renamed: ' + p.name);
    return { ok: true, id: d.Id };
  }
  var nd = { Id: uid(), Name: p.name, Status: 'Active', CreatedAt: nowIso(), Demo: p.demo || '' };
  drivers.push(nd);
  saveTable('Drivers', drivers);
  logAudit(user.Username, 'create', 'Driver', nd.Id, 'Driver added: ' + p.name);
  return { ok: true, id: nd.Id };
}

function setDriverStatus(token, id, status) {
  var user = guard(token, 'drivers.manage');
  var drivers = loadTable('Drivers');
  var d = findById(drivers, id);
  if (!d) fail('Driver not found.');
  d.Status = status === 'Inactive' ? 'Inactive' : 'Active';
  saveTable('Drivers', drivers);
  logAudit(user.Username, 'status', 'Driver', id, 'Driver ' + d.Name + ' set ' + d.Status);
  return { ok: true };
}

function getAssignments(token, vehicleId) {
  guard(token, null);
  var drivers = loadTable('Drivers');
  return loadTable('DriverAssignments')
    .filter(function (a) { return String(a.VehicleId) === String(vehicleId); })
    .sort(function (x, y) { return x.FromDate < y.FromDate ? 1 : -1; })
    .map(function (a) {
      var d = findById(drivers, a.DriverId);
      return { id: a.Id, driverId: a.DriverId, driverName: d ? d.Name : '', fromDate: a.FromDate, toDate: a.ToDate || '' };
    });
}

/** Change the active driver of a vehicle from a date (Q15-B). */
function assignDriver(token, vehicleId, driverId, fromDate) {
  var user = guard(token, 'drivers.manage');
  var drivers = loadTable('Drivers');
  var d = findById(drivers, driverId);
  if (!d) fail('Driver not found.');
  if (d.Status !== 'Active') fail('That driver is inactive and cannot be assigned.');
  if (!fromDate) fail('A start date is required.');
  var rows = loadTable('DriverAssignments');
  rows.forEach(function (a) {
    if (String(a.VehicleId) === String(vehicleId) && !a.ToDate && a.FromDate < fromDate) {
      a.ToDate = addDays(fromDate, -1);
    }
  });
  var na = { Id: uid(), VehicleId: vehicleId, DriverId: driverId, FromDate: fromDate, ToDate: '', CreatedAt: nowIso(), Demo: '' };
  rows.push(na);
  saveTable('DriverAssignments', rows);
  var vehicles = loadTable('Vehicles');
  var v = findById(vehicles, vehicleId);
  logAudit(user.Username, 'assign-driver', 'Vehicle', vehicleId, 'Driver ' + d.Name + ' assigned to ' + (v ? v.RegNo : vehicleId) + ' from ' + fromDate);
  recalcVehicle(vehicleId);
  return { ok: true };
}

/* ---------- pumps ---------- */

function getPumps(token) {
  guard(token, null);
  return loadTable('Pumps').map(function (p) { return { id: p.Id, name: p.Name, status: p.Status }; });
}

function savePump(token, p) {
  var user = guard(token, 'pumps.manage');
  var pumps = loadTable('Pumps');
  if (!p.name) fail('Pump name is required.');
  if (p.id) {
    var x = findById(pumps, p.id);
    if (!x) fail('Pump not found.');
    x.Name = p.name;
    saveTable('Pumps', pumps);
    return { ok: true, id: x.Id };
  }
  var np = { Id: uid(), Name: p.name, Status: 'Active', CreatedAt: nowIso(), Demo: p.demo || '' };
  pumps.push(np);
  saveTable('Pumps', pumps);
  logAudit(user.Username, 'create', 'Pump', np.Id, 'Pump added: ' + p.name);
  return { ok: true, id: np.Id };
}

function setPumpStatus(token, id, status) {
  var user = guard(token, 'pumps.manage');
  var pumps = loadTable('Pumps');
  var x = findById(pumps, id);
  if (!x) fail('Pump not found.');
  x.Status = status === 'Inactive' ? 'Inactive' : 'Active';
  saveTable('Pumps', pumps);
  return { ok: true };
}

/* ---------- vehicle problems (Q46) ---------- */

function getProblems(token, vehicleId) {
  guard(token, null);
  return loadTable('VehicleProblems')
    .filter(function (p) { return !vehicleId || String(p.VehicleId) === String(vehicleId); })
    .sort(function (x, y) { return x.StartDate < y.StartDate ? 1 : -1; })
    .map(function (p) {
      return {
        id: p.Id, vehicleId: p.VehicleId, startDate: p.StartDate, endDate: p.EndDate || '',
        note: p.Note || '', repairNote: p.RepairNote || '', tempAvg: num(p.TempAvg), status: p.Status
      };
    });
}

function openProblem(token, p) {
  var user = guard(token, 'vehicles.manage');
  if (!p.vehicleId || !p.startDate || !p.note) fail('Vehicle, start date and problem note are required.');
  var rows = loadTable('VehicleProblems');
  var np = {
    Id: uid(), VehicleId: p.vehicleId, StartDate: p.startDate, EndDate: '', Note: p.note,
    RepairNote: '', TempAvg: num(p.tempAvg), Status: 'Open', CreatedBy: user.Username,
    CreatedAt: nowIso(), Demo: p.demo || ''
  };
  rows.push(np);
  saveTable('VehicleProblems', rows);
  logAudit(user.Username, 'problem-open', 'Vehicle', p.vehicleId, 'Problem opened: ' + p.note);
  recalcVehicle(p.vehicleId);
  return { ok: true, id: np.Id };
}

function closeProblem(token, id, endDate, repairNote) {
  var user = guard(token, 'vehicles.manage');
  var rows = loadTable('VehicleProblems');
  var p = findById(rows, id);
  if (!p) fail('Problem record not found.');
  p.EndDate = endDate || todayStr();
  p.RepairNote = repairNote || '';
  p.Status = 'Closed';
  saveTable('VehicleProblems', rows);
  logAudit(user.Username, 'problem-close', 'Vehicle', p.VehicleId, 'Problem closed: ' + p.Note);
  recalcVehicle(p.VehicleId);
  return { ok: true };
}
