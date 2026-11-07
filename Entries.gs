/**
 * Entries.gs — fuel entries (Card / Cash / Company Tank), tank audits,
 * flags and month locking. All checking rules from the spec live here + Calc.
 */

function entryDto_(e, ctx) {
  var v = findById(ctx.vehicles, e.VehicleId);
  var c = e.CardId ? findById(ctx.cards, e.CardId) : null;
  var p = e.PumpId ? findById(ctx.pumps, e.PumpId) : null;
  var d = e.DriverId ? findById(ctx.drivers, e.DriverId) : null;
  var openFlags = ctx.flags.filter(function (f) {
    return String(f.RefId) === String(e.Id) && f.Status === 'Open';
  }).map(function (f) { return { id: f.Id, kind: f.Kind, message: f.Message }; });
  return {
    id: e.Id, date: e.Date, time: e.Time || '', source: e.Source,
    vehicleId: e.VehicleId, vehicleReg: v ? v.RegNo : '', vehicleModel: v ? v.Model : '',
    cardId: e.CardId || '', cardNumber: c ? c.Number : '',
    pumpId: e.PumpId || '', pumpName: p ? p.Name : '',
    docNo: e.DocNo, litres: num(e.Litres), slipRemaining: e.SlipRemaining === '' ? '' : num(e.SlipRemaining),
    meter: num(e.Meter), ratePerLitre: e.RatePerLitre === '' ? '' : num(e.RatePerLitre),
    amount: e.Amount === '' ? '' : num(e.Amount), paidBy: e.PaidBy || '', reason: e.Reason || '',
    driverName: d ? d.Name : '', kmRun: num(e.KmRun), usedLitres: num(e.UsedLitres),
    tankAfter: num(e.TankAfter), systemRemaining: e.SystemRemaining === '' ? '' : num(e.SystemRemaining),
    alternateCard: String(e.AlternateCard) === '1', problemPeriod: String(e.ProblemPeriod) === '1',
    flags: openFlags, createdBy: e.CreatedBy || '', demo: e.Demo || ''
  };
}

function ctx_() {
  return {
    vehicles: loadTable('Vehicles'), cards: loadTable('Cards'),
    pumps: loadTable('Pumps'), drivers: loadTable('Drivers'), flags: loadTable('Flags')
  };
}

function listEntries(token, f) {
  guard(token, 'entries.view');
  f = f || {};
  var ctx = ctx_();
  var rows = loadTable('Entries');
  rows.sort(function (a, b) {
    var ka = a.Date + ' ' + (a.Time || ''), kb = b.Date + ' ' + (b.Time || '');
    return ka < kb ? 1 : -1;
  });
  return rows.filter(function (e) {
    if (f.from && e.Date < f.from) return false;
    if (f.to && e.Date > f.to) return false;
    if (f.vehicleId && String(e.VehicleId) !== String(f.vehicleId)) return false;
    if (f.cardId && String(e.CardId) !== String(f.cardId)) return false;
    if (f.source && e.Source !== f.source) return false;
    if (f.search && String(e.DocNo).toLowerCase().indexOf(String(f.search).toLowerCase()) === -1) return false;
    return true;
  }).slice(0, 500).map(function (e) { return entryDto_(e, ctx); });
}

function findEntryByDoc(token, docNo) {
  guard(token, 'entries.view');
  var ctx = ctx_();
  var rows = loadTable('Entries');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].DocNo).toLowerCase() === String(docNo).toLowerCase()) return entryDto_(rows[i], ctx);
  }
  return null;
}

function docExists_(entries, source, docNo, excludeId) {
  return entries.some(function (e) {
    return e.Source === source && String(e.DocNo).toLowerCase() === String(docNo).toLowerCase()
      && String(e.Id) !== String(excludeId || '');
  });
}

function saveEntry(token, p) {
  var isEdit = !!p.id;
  var user = guard(token, isEdit ? 'entries.edit' : 'entries.add');
  if (!p.vehicleId) fail('Vehicle is required.');
  if (!p.date) fail('Date is required.');
  if (!(num(p.litres) > 0)) fail('Litres filled must be greater than zero.');
  if (p.meter === '' || p.meter === undefined || p.meter === null) fail('Meter reading is compulsory.');
  assertMonthWritable(user, monthKeyOf(p.date), 'changing entries in it');

  var vehicles = loadTable('Vehicles');
  var vehicle = findById(vehicles, p.vehicleId);
  if (!vehicle) fail('Vehicle not found.');
  var entries = loadTable('Entries');
  var cards = loadTable('Cards');
  var source = p.source || 'CARD';
  var oldEntry = isEdit ? findById(entries, p.id) : null;
  if (isEdit && !oldEntry) fail('Entry not found.');

  var card = null;
  if (source === 'CARD') {
    if (!p.cardId) fail('Card is required for a card entry.');
    card = findById(cards, p.cardId);
    if (!card) fail('Card not found.');
    if (!p.pumpId) fail('Pump is required for a card entry.');
    if (!p.docNo) fail('Tracking ID is required.');
    if (docExists_(entries, 'CARD', p.docNo, p.id)) fail('Duplicate Tracking ID — this slip has already been entered.');
    // Over-limit BLOCK (Q20): litres cannot exceed the card's remaining for that month
    var others = entries.filter(function (e) { return String(e.Id) !== String(p.id || ''); });
    var remainingBefore = cardRemaining(others, card, monthKeyOf(p.date));
    if (num(p.litres) > remainingBefore) {
      fail('Entry blocked: ' + p.litres + ' Ltr exceeds the card\'s remaining balance of ' + remainingBefore + ' Ltr for ' + monthKeyOf(p.date) + '.');
    }
  } else if (source === 'CASH') {
    if (!p.docNo) fail('Receipt No. is required for a cash entry.');
    if (docExists_(entries, 'CASH', p.docNo, p.id)) fail('Duplicate Receipt No. — this receipt has already been entered.');
    if (!p.pumpId) fail('Pump is required for a cash entry.');
    if (!p.reason) fail('Reason is required for a cash entry (e.g. card not working).');
  } else if (source === 'TANK') {
    if (!p.docNo) fail('Issue Voucher No. is required for a company tank entry.');
    if (docExists_(entries, 'TANK', p.docNo, p.id)) fail('Duplicate Issue Voucher No. — this voucher has already been entered.');
    var tankFuel = getSettings().companyTankFuelType;
    if (tankFuel && vehicle.FuelType && tankFuel !== vehicle.FuelType) {
      fail('Blocked: the company tank holds ' + tankFuel + ' but this vehicle uses ' + vehicle.FuelType + '.');
    }
  } else {
    fail('Unknown fuel source.');
  }

  // Meter chain-order check (Q41): in date/time order the meter may not go
  // backwards, and a back-dated entry may not jump over the next entry.
  var when = p.date + ' ' + (p.time || '00:00');
  var siblings = entries.filter(function (e) {
    return String(e.VehicleId) === String(p.vehicleId) && String(e.Id) !== String(p.id || '');
  });
  var pred = null, succ = null;
  siblings.forEach(function (e) {
    var k = e.Date + ' ' + (e.Time || '00:00');
    if (k <= when && (!pred || k > pred.k)) pred = { k: k, meter: num(e.Meter) };
    if (k > when && (!succ || k < succ.k)) succ = { k: k, meter: num(e.Meter) };
  });
  var startMeter = pred ? pred.meter : num(vehicle.OpeningMeter);
  if (num(p.meter) < startMeter) fail('Entry blocked: meter reading ' + p.meter + ' is lower than the previous reading ' + startMeter + ' for this vehicle.');
  if (succ && num(p.meter) > succ.meter) fail('Entry blocked: meter reading ' + p.meter + ' is higher than the next entry\'s reading ' + succ.meter + '. Check the date/time or the reading.');

  var row = oldEntry || { Id: uid(), CreatedAt: nowIso() };
  row.Date = p.date; row.Time = p.time || '';
  row.Source = source; row.VehicleId = p.vehicleId;
  row.CardId = source === 'CARD' ? p.cardId : '';
  row.PumpId = source === 'TANK' ? '' : (p.pumpId || '');
  row.DocNo = p.docNo; row.Litres = num(p.litres);
  row.SlipRemaining = source === 'CARD' && p.slipRemaining !== '' && p.slipRemaining !== undefined ? num(p.slipRemaining) : '';
  row.Meter = num(p.meter);
  row.RatePerLitre = p.ratePerLitre === '' || p.ratePerLitre === undefined ? '' : num(p.ratePerLitre);
  row.Amount = p.amount === '' || p.amount === undefined ? '' : num(p.amount);
  row.PaidBy = source === 'CASH' ? (p.paidBy || '') : '';
  row.Reason = source === 'CASH' ? (p.reason || '') : '';
  row.AlternateCard = source === 'CARD' && vehicle.CardId && String(p.cardId) !== String(vehicle.CardId) ? '1' : '';
  row.CreatedBy = row.CreatedBy || user.Username;
  row.Demo = row.Demo || p.demo || '';
  if (!oldEntry) entries.push(row);
  saveTable('Entries', entries);

  // Slip-vs-system mismatch: WARN & FLAG, but the entry stays saved (Q19)
  recalcVehicle(p.vehicleId);
  if (oldEntry && String(oldEntry.VehicleId) !== String(p.vehicleId)) recalcVehicle(oldEntry.VehicleId);
  if (source === 'CARD' && row.SlipRemaining !== '') {
    var fresh = findById(loadTable('Entries'), row.Id);
    var flags = loadTable('Flags');
    var mismatch = fresh && num(fresh.SystemRemaining) !== num(row.SlipRemaining);
    if (mismatch) {
      syncAutoFlag(flags, 'SLIP_MISMATCH', row.Id, p.vehicleId, p.cardId, monthKeyOf(p.date),
        'Slip remaining ' + row.SlipRemaining + ' Ltr does not match system remaining ' + fresh.SystemRemaining + ' Ltr (Tracking ID ' + row.DocNo + ').');
      saveTable('Flags', flags);
    }
  }

  logAudit(user.Username, isEdit ? 'edit' : 'create', 'Entry', row.Id,
    (source + ' entry ' + row.DocNo + ', ' + row.Litres + ' Ltr, vehicle ' + vehicle.RegNo));
  return { ok: true, id: row.Id };
}

function deleteEntry(token, id) {
  var user = guard(token, 'entries.delete');
  var entries = loadTable('Entries');
  var e = findById(entries, id);
  if (!e) fail('Entry not found.');
  assertMonthWritable(user, monthKeyOf(e.Date), 'deleting entries from it');
  entries = entries.filter(function (x) { return String(x.Id) !== String(id); });
  saveTable('Entries', entries);
  var flags = loadTable('Flags').filter(function (f) { return String(f.RefId) !== String(id); });
  saveTable('Flags', flags);
  logAudit(user.Username, 'delete', 'Entry', id, 'Entry deleted: ' + e.DocNo + ' (' + e.Litres + ' Ltr)');
  recalcVehicle(e.VehicleId);
  return { ok: true };
}

/* ---------- tank audits (Q33/Q34) ---------- */

function listTankAudits(token) {
  guard(token, 'tank.audit');
  var vehicles = loadTable('Vehicles');
  return loadTable('TankAudits')
    .sort(function (a, b) { return (a.Date + a.Time) < (b.Date + b.Time) ? 1 : -1; })
    .map(function (a) {
      var v = findById(vehicles, a.VehicleId);
      return {
        id: a.Id, vehicleId: a.VehicleId, vehicleReg: v ? v.RegNo : '', date: a.Date, time: a.Time || '',
        physicalLitres: num(a.PhysicalLitres), systemLitres: num(a.SystemLitres),
        difference: num(a.Difference), reason: a.Reason || '', auditor: a.Auditor || '',
        linkedProblemId: a.LinkedProblemId || ''
      };
    });
}

function saveTankAudit(token, p) {
  var user = guard(token, 'tank.audit');
  if (!p.vehicleId) fail('Vehicle is required.');
  if (!p.date) fail('Audit date is required.');
  if (p.physicalLitres === '' || p.physicalLitres === undefined) fail('Physical tank figure is required.');
  if (!p.reason) fail('A reason note is required for a tank audit.');
  assertMonthWritable(user, monthKeyOf(p.date), 'changing entries in it');
  var rows = loadTable('TankAudits');
  var na = {
    Id: uid(), VehicleId: p.vehicleId, Date: p.date, Time: p.time || '',
    PhysicalLitres: num(p.physicalLitres), SystemLitres: '', Difference: '',
    Reason: p.reason, Auditor: p.auditor || user.Username, LinkedProblemId: p.linkedProblemId || '',
    CreatedBy: user.Username, CreatedAt: nowIso(), Demo: p.demo || ''
  };
  rows.push(na);
  saveTable('TankAudits', rows);
  recalcVehicle(p.vehicleId); // fills SystemLitres + Difference and flags ANY difference
  var saved = findById(loadTable('TankAudits'), na.Id);
  logAudit(user.Username, 'tank-audit', 'Vehicle', p.vehicleId,
    'Tank audit: physical ' + na.PhysicalLitres + ' Ltr, system ' + (saved ? saved.SystemLitres : '?') + ', difference ' + (saved ? saved.Difference : '?'));
  return { ok: true, id: na.Id, difference: saved ? num(saved.Difference) : 0 };
}

/* ---------- flags ---------- */

function listFlags(token, status) {
  guard(token, null);
  var vehicles = loadTable('Vehicles');
  var cards = loadTable('Cards');
  return loadTable('Flags')
    .filter(function (f) { return !status || f.Status === status; })
    .sort(function (a, b) { return a.CreatedAt < b.CreatedAt ? 1 : -1; })
    .map(function (f) {
      var v = f.VehicleId ? findById(vehicles, f.VehicleId) : null;
      var c = f.CardId ? findById(cards, f.CardId) : null;
      return {
        id: f.Id, kind: f.Kind, refId: f.RefId, vehicleReg: v ? v.RegNo : '',
        cardNumber: c ? c.Number : '', period: f.Period || '', message: f.Message,
        status: f.Status, resolveNote: f.ResolveNote || '', resolvedBy: f.ResolvedBy || '',
        resolvedAt: f.ResolvedAt || '', createdAt: f.CreatedAt
      };
    });
}

function resolveFlag(token, id, note) {
  var user = guard(token, 'flags.resolve');
  if (!note) fail('A resolution note is required.');
  var flags = loadTable('Flags');
  var f = findById(flags, id);
  if (!f) fail('Flag not found.');
  f.Status = 'Resolved';
  f.ResolveNote = note;
  f.ResolvedBy = user.Username;
  f.ResolvedAt = nowIso();
  saveTable('Flags', flags);
  logAudit(user.Username, 'flag-resolve', 'Flag', id, f.Kind + ': ' + note);
  return { ok: true };
}

/* ---------- month lock ---------- */

function getLockedMonths(token) {
  guard(token, null);
  return lockedMonths_();
}

function setMonthLock(token, monthKey, locked) {
  var user = guard(token, 'month.lock');
  var months = lockedMonths_();
  if (locked && months.indexOf(monthKey) === -1) months.push(monthKey);
  if (!locked) months = months.filter(function (m) { return m !== monthKey; });
  setSetting('lockedMonths', JSON.stringify(months));
  logAudit(user.Username, locked ? 'month-lock' : 'month-unlock', 'Month', monthKey, 'Month ' + monthKey + (locked ? ' locked' : ' unlocked'));
  return { ok: true, lockedMonths: months };
}
