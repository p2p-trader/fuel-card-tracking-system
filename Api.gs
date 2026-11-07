/**
 * Api.gs — read-only JSON API (Q47). Requires an API key created in Settings.
 * PINs and passwords are never returned. Every call is logged.
 */

function checkApiKey_(key) {
  if (!key) return false;
  try {
    var keys = JSON.parse(getSettings().apiKeys || '[]');
    return keys.some(function (k) { return k.key === key && k.active; });
  } catch (e) { return false; }
}

function handleApiRequest(e) {
  var p = (e && e.parameter) || {};
  var endpoint = p.api || '';
  function json(obj, code) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  }
  if (!checkApiKey_(p.key)) {
    return json({ ok: false, error: 'Invalid or missing API key.' });
  }
  try {
    var entries = loadTable('Entries');
    var vehicles = loadTable('Vehicles');
    var cards = loadTable('Cards');
    var drivers = loadTable('Drivers');
    var out = null;

    if (endpoint === 'vehicles') {
      out = vehicles.map(function (v) {
        var live = vehicleLiveStats(v.Id);
        return {
          id: v.Id, regNo: v.RegNo, model: v.Model, fuelType: v.FuelType,
          status: v.Status, tankLitres: live.tank, tankCapacity: num(v.TankCapacity),
          meter: live.meter, stdAvg: num(v.StdAvg)
        };
      });
    } else if (endpoint === 'cards') {
      var mk = p.month || currentMonthKey();
      out = cards.map(function (c) {
        var st = cardLiveStats(c, entries, mk);
        return { // NOTE: no PIN field — PINs never leave the system (Q47)
          id: c.Id, number: c.Number, provider: c.Provider || '', status: c.Status,
          limitLitres: num(c.LimitLitres), usedLitres: st.used, remainingLitres: st.remaining,
          low: st.low, month: mk
        };
      });
    } else if (endpoint === 'entries') {
      out = entries.filter(function (en) {
        if (p.from && en.Date < p.from) return false;
        if (p.to && en.Date > p.to) return false;
        if (p.vehicle && String(en.VehicleId) !== String(p.vehicle)) return false;
        if (p.card && String(en.CardId) !== String(p.card)) return false;
        if (p.pump && String(en.PumpId) !== String(p.pump)) return false;
        if (p.driver && String(en.DriverId) !== String(p.driver)) return false;
        if (p.source && en.Source !== p.source) return false;
        return true;
      }).map(function (en) {
        var v = findById(vehicles, en.VehicleId);
        var d = en.DriverId ? findById(drivers, en.DriverId) : null;
        return {
          id: en.Id, date: en.Date, time: en.Time || '', source: en.Source,
          vehicle: v ? v.RegNo : '', litres: num(en.Litres), meter: num(en.Meter),
          kmRun: num(en.KmRun), usedLitres: num(en.UsedLitres), tankAfter: num(en.TankAfter),
          docNo: en.DocNo, driver: d ? d.Name : ''
        };
      });
    } else if (endpoint === 'dashboard') {
      var mkd = currentMonthKey();
      var openFlags = loadTable('Flags').filter(function (f) { return f.Status === 'Open'; }).length;
      out = {
        month: mkd,
        litresThisMonth: round2(entries.filter(function (en) { return monthKeyOf(en.Date) === mkd; })
          .reduce(function (s, en) { return s + num(en.Litres); }, 0)),
        openFlags: openFlags,
        activeCards: cards.filter(function (c) { return c.Status === 'Active'; }).length,
        activeVehicles: vehicles.filter(function (v) { return v.Status === 'Active'; }).length
      };
    } else if (endpoint === 'report') {
      // Reports through the API reuse the internal report builders via a
      // synthetic admin-free path: only non-sensitive monthly aggregates.
      if (p.name === 'monthly-cards') {
        var mkr = p.month || currentMonthKey();
        out = cards.map(function (c) {
          var st = cardLiveStats(c, entries, mkr);
          return { card: c.Number, limit: num(c.LimitLitres), used: st.used, remaining: st.remaining };
        });
      } else {
        return json({ ok: false, error: 'Supported API reports: monthly-cards' });
      }
    } else {
      return json({ ok: false, error: 'Unknown endpoint. Use vehicles, cards, entries, dashboard or report.' });
    }

    logAudit('api', 'api-call', endpoint, '', 'API ' + endpoint + ' called');
    return json({ ok: true, endpoint: endpoint, data: out });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}
