/**
 * Trips.gs — vehicle trips with an open → close flow (Q51/Q52).
 * The driver is auto-filled from the assignment active on the start date.
 */

function tripDto_(t, ctx) {
  var v = findById(ctx.vehicles, t.VehicleId);
  var d = t.DriverId ? findById(ctx.drivers, t.DriverId) : null;
  return {
    id: t.Id, vehicleId: t.VehicleId, vehicleReg: v ? v.RegNo : '',
    driverId: t.DriverId || '', driverName: d ? d.Name : '',
    fromLoc: t.FromLoc || '', toLoc: t.ToLoc || '', purpose: t.Purpose || '',
    startDate: t.StartDate, startMeter: num(t.StartMeter),
    endDate: t.EndDate || '', endMeter: t.EndMeter === '' ? '' : num(t.EndMeter),
    km: num(t.Km), status: t.Status, demo: t.Demo || ''
  };
}

function listTrips(token, f) {
  guard(token, 'trips.view');
  f = f || {};
  var ctx = { vehicles: loadTable('Vehicles'), drivers: loadTable('Drivers') };
  return loadTable('Trips')
    .filter(function (t) {
      if (f.vehicleId && String(t.VehicleId) !== String(f.vehicleId)) return false;
      if (f.status && t.Status !== f.status) return false;
      if (f.from && t.StartDate < f.from) return false;
      if (f.to && t.StartDate > f.to) return false;
      return true;
    })
    .sort(function (a, b) { return a.StartDate < b.StartDate ? 1 : -1; })
    .map(function (t) { return tripDto_(t, ctx); });
}

function startTrip(token, p) {
  var user = guard(token, 'trips.manage');
  if (!p.vehicleId) fail('Vehicle is required.');
  if (!p.startDate) fail('Start date is required.');
  if (p.startMeter === '' || p.startMeter === undefined) fail('Start meter is required.');
  if (!p.toLoc) fail('Destination (To) is required.');
  var trips = loadTable('Trips');
  var overlap = trips.some(function (t) {
    return String(t.VehicleId) === String(p.vehicleId) && t.Status === 'Open';
  });
  var assignments = loadTable('DriverAssignments');
  var nt = {
    Id: uid(), VehicleId: p.vehicleId,
    DriverId: driverForDate(assignments, p.vehicleId, p.startDate),
    FromLoc: p.fromLoc || '', ToLoc: p.toLoc, Purpose: p.purpose || '',
    StartDate: p.startDate, StartMeter: num(p.startMeter),
    EndDate: '', EndMeter: '', Km: 0, Status: 'Open',
    CreatedBy: user.Username, CreatedAt: nowIso(), Demo: p.demo || ''
  };
  trips.push(nt);
  saveTable('Trips', trips);
  var vehicles = loadTable('Vehicles');
  var v = findById(vehicles, p.vehicleId);
  logAudit(user.Username, 'trip-start', 'Vehicle', p.vehicleId,
    'Trip started: ' + (v ? v.RegNo : '') + ' to ' + p.toLoc + (overlap ? ' (warning: another trip was already open)' : ''));
  return { ok: true, id: nt.Id, overlapWarning: overlap };
}

function closeTrip(token, id, endDate, endMeter) {
  var user = guard(token, 'trips.manage');
  if (endMeter === '' || endMeter === undefined) fail('End meter is required to close a trip.');
  var trips = loadTable('Trips');
  var t = findById(trips, id);
  if (!t) fail('Trip not found.');
  if (t.Status === 'Closed') fail('This trip is already closed.');
  if (num(endMeter) < num(t.StartMeter)) fail('End meter cannot be lower than the start meter (' + t.StartMeter + ').');
  t.EndDate = endDate || todayStr();
  t.EndMeter = num(endMeter);
  t.Km = round2(num(endMeter) - num(t.StartMeter));
  t.Status = 'Closed';
  saveTable('Trips', trips);
  logAudit(user.Username, 'trip-close', 'Vehicle', t.VehicleId, 'Trip closed: ' + t.Km + ' km to ' + t.ToLoc);
  recalcVehicle(t.VehicleId); // refresh the unexplained-km cross-check
  return { ok: true, km: t.Km };
}

function deleteTrip(token, id) {
  var user = guard(token, 'trips.manage');
  var trips = loadTable('Trips');
  var t = findById(trips, id);
  if (!t) fail('Trip not found.');
  trips = trips.filter(function (x) { return String(x.Id) !== String(id); });
  saveTable('Trips', trips);
  logAudit(user.Username, 'trip-delete', 'Vehicle', t.VehicleId, 'Trip deleted: to ' + t.ToLoc + ' on ' + t.StartDate);
  recalcVehicle(t.VehicleId);
  return { ok: true };
}
