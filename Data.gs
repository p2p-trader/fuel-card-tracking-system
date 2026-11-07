/**
 * Data.gs — Google Sheet storage layer.
 * One Sheet file = the database; one tab per record kind; one row = one record.
 * Tables are loaded whole, mutated in memory, and written back (fleet scale).
 */

var TABLES = {
  Users: ['Id', 'FullName', 'Username', 'PassHash', 'Salt', 'IsAdmin', 'Perms', 'Active', 'Theme', 'CreatedAt', 'Demo'],
  Vehicles: ['Id', 'RegNo', 'Model', 'FuelType', 'CardId', 'OpeningMeter', 'StdAvg', 'TankCapacity', 'OpeningTank', 'Ownership', 'ContractorName', 'Status', 'ServiceIntervalKm', 'LastServiceMeter', 'CreatedAt', 'Demo'],
  Cards: ['Id', 'Number', 'Pin', 'Provider', 'LimitLitres', 'OpeningRemaining', 'OpeningMonth', 'PrimaryVehicleId', 'ExpiryDate', 'Status', 'CloseReason', 'ReplacedById', 'CreatedAt', 'Demo'],
  Drivers: ['Id', 'Name', 'Status', 'CreatedAt', 'Demo'],
  DriverAssignments: ['Id', 'VehicleId', 'DriverId', 'FromDate', 'ToDate', 'CreatedAt', 'Demo'],
  Pumps: ['Id', 'Name', 'Status', 'CreatedAt', 'Demo'],
  Entries: ['Id', 'Date', 'Time', 'Source', 'VehicleId', 'CardId', 'PumpId', 'DocNo', 'Litres', 'SlipRemaining', 'Meter', 'RatePerLitre', 'Amount', 'PaidBy', 'Reason', 'DriverId', 'KmRun', 'UsedLitres', 'TankAfter', 'SystemRemaining', 'AlternateCard', 'ProblemPeriod', 'CreatedBy', 'CreatedAt', 'Demo'],
  TankAudits: ['Id', 'VehicleId', 'Date', 'Time', 'PhysicalLitres', 'SystemLitres', 'Difference', 'Reason', 'Auditor', 'LinkedProblemId', 'CreatedBy', 'CreatedAt', 'Demo'],
  AuditLog: ['Id', 'Timestamp', 'Username', 'Action', 'Entity', 'EntityId', 'Details', 'Demo'],
  Settings: ['Key', 'Value'],
  VehicleProblems: ['Id', 'VehicleId', 'StartDate', 'EndDate', 'Note', 'RepairNote', 'TempAvg', 'Status', 'CreatedBy', 'CreatedAt', 'Demo'],
  Trips: ['Id', 'VehicleId', 'DriverId', 'FromLoc', 'ToLoc', 'Purpose', 'StartDate', 'StartMeter', 'EndDate', 'EndMeter', 'Km', 'Status', 'CreatedBy', 'CreatedAt', 'Demo'],
  Flags: ['Id', 'Kind', 'RefId', 'VehicleId', 'CardId', 'Period', 'Message', 'Status', 'ResolveNote', 'ResolvedBy', 'ResolvedAt', 'CreatedAt', 'Demo']
};

var DB_PROP_KEY = 'FUEL_DB_ID';

function getDb() {
  var props = PropertiesService.getScriptProperties();
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { active = null; }
  if (active) {
    if (props.getProperty(DB_PROP_KEY) !== active.getId()) props.setProperty(DB_PROP_KEY, active.getId());
    ensureTabs_(active);
    return active;
  }
  var id = props.getProperty(DB_PROP_KEY);
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Fuel Card System DB');
    props.setProperty(DB_PROP_KEY, ss.getId());
  }
  ensureTabs_(ss);
  return ss;
}

var _tabsEnsured = false;
function ensureTabs_(ss) {
  if (_tabsEnsured) return;
  Object.keys(TABLES).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]);
    }
  });
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) { try { ss.deleteSheet(def); } catch (e) {} }
  _tabsEnsured = true;
}

/** Load a table as an array of objects keyed by its header names. */
function loadTable(name) {
  var ss = getDb();
  var sh = ss.getSheetByName(name);
  var headers = TABLES[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  }).filter(function (o) { return String(o[headers[0]] || '') !== ''; });
}

/** Replace a table's rows with the given objects. */
function saveTable(name, rows) {
  var ss = getDb();
  var sh = ss.getSheetByName(name);
  var headers = TABLES[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (rows.length) {
    var values = rows.map(function (o) {
      return headers.map(function (h) {
        var v = o[h];
        return v === undefined || v === null ? '' : v;
      });
    });
    sh.getRange(2, 1, values.length, headers.length).setValues(values);
  }
}

function findById(rows, id) {
  for (var i = 0; i < rows.length; i++) if (String(rows[i].Id) === String(id)) return rows[i];
  return null;
}

/* ---------- settings (key/value) ---------- */

function getSettings() {
  var rows = loadTable('Settings');
  var out = {};
  rows.forEach(function (r) { out[r.Key] = r.Value; });
  return out;
}

function setSetting(key, value) {
  var rows = loadTable('Settings');
  var found = null;
  rows.forEach(function (r) { if (r.Key === key) found = r; });
  if (found) found.Value = value; else rows.push({ Key: key, Value: value });
  saveTable('Settings', rows);
}

function setSettings(map) {
  var rows = loadTable('Settings');
  Object.keys(map).forEach(function (key) {
    var found = null;
    rows.forEach(function (r) { if (r.Key === key) found = r; });
    if (found) found.Value = map[key]; else rows.push({ Key: key, Value: map[key] });
  });
  saveTable('Settings', rows);
}

/* ---------- audit history ---------- */

function logAudit(username, action, entity, entityId, details) {
  try {
    var rows = loadTable('AuditLog');
    rows.push({
      Id: uid(), Timestamp: nowIso(), Username: username || '', Action: action,
      Entity: entity || '', EntityId: entityId || '', Details: details || '', Demo: ''
    });
    saveTable('AuditLog', rows);
  } catch (e) { /* history must never block the real action */ }
}
