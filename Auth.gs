/**
 * Auth.gs — in-system username/password login, sessions, and the 22-tick
 * permission checklist. Admin profile is duplicated to create staff users.
 */

var PERMS = [
  ['dashboard', 'View Dashboard'],
  ['entries.view', 'View Fuel Entries'],
  ['entries.add', 'Add Fuel Entry'],
  ['entries.edit', 'Edit Fuel Entry'],
  ['entries.delete', 'Delete Fuel Entry'],
  ['vehicles.manage', 'Add/Edit Vehicle'],
  ['cards.manage', 'Add/Edit Fuel Card'],
  ['cards.limit', 'Change Monthly Limit'],
  ['cards.pin', 'View Card PIN'],
  ['drivers.manage', 'Add Driver / Change Vehicle Driver'],
  ['reports.view', 'View Reports'],
  ['reports.export', 'Export/Print Reports'],
  ['history.view', 'View Change History'],
  ['users.manage', 'Manage Users & Permissions'],
  ['tank.audit', 'Tank Audit / Adjustment'],
  ['flags.resolve', 'Resolve Flagged Entries'],
  ['settings.manage', 'Manage Settings'],
  ['month.lock', 'Month Lock / Unlock'],
  ['backup.download', 'Download Backup'],
  ['pumps.manage', 'Manage Pump List'],
  ['trips.view', 'View Trips'],
  ['trips.manage', 'Manage Trips (add/edit/delete)']
];

var ALL_PERM_KEYS = PERMS.map(function (p) { return p[0]; });
var SESSION_TTL_SECONDS = 1800; // 30 minutes of inactivity = auto-logout (Q48)

/* ---------- app state / branding ---------- */

function branding_() {
  var s = getSettings();
  return {
    companyName: s.companyName || '',
    logoSvg: s.logoSvg || '',
    brandColor: s.brandColor || '#2563eb',
    address: s.address || '',
    phone: s.phone || ''
  };
}

function appState() {
  var users = loadTable('Users');
  return { needsWizard: users.length === 0, branding: branding_() };
}

/* ---------- startup wizard (first launch only) ---------- */

function wizardSubmit(p) {
  var users = loadTable('Users');
  if (users.length > 0) fail('Setup is already complete.');
  if (!p.companyName) fail('Company name is required.');
  if (!p.adminName || !p.adminUsername || !p.adminPassword) fail('Admin name, username and password are required.');
  if (String(p.adminPassword).length < 6) fail('Admin password must be at least 6 characters.');
  if (!p.recoveryEmail) fail('A recovery email is required (it is the only password recovery route).');

  setSettings({
    companyName: p.companyName,
    logoSvg: sanitizeSvg(p.logoSvg || ''),
    brandColor: p.brandColor || '#2563eb',
    address: p.address || '',
    phone: p.phone || '',
    recoveryEmail: p.recoveryEmail,
    lowCardPct: 20,
    expiryWarnDays: 30,
    meterJumpKm: 1000,
    serviceWarnKm: 500,
    tripLongDays: 7,
    companyTankFuelType: '',
    wizardDone: '1',
    apiKeys: '[]',
    lockedMonths: '[]'
  });

  var salt = newSalt();
  users.push({
    Id: uid(), FullName: p.adminName, Username: String(p.adminUsername).toLowerCase(),
    PassHash: hashPassword(p.adminPassword, salt), Salt: salt, IsAdmin: '1',
    Perms: JSON.stringify(ALL_PERM_KEYS), Active: '1', Theme: 'light',
    CreatedAt: nowIso(), Demo: ''
  });
  saveTable('Users', users);
  logAudit(p.adminUsername, 'setup', 'System', '', 'Startup wizard completed for ' + p.companyName);
  return { ok: true };
}

/* ---------- sessions ---------- */

function createSession_(user) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('sess_' + token, JSON.stringify({
    userId: user.Id, lastSeen: Date.now()
  }), SESSION_TTL_SECONDS);
  return token;
}

function getSessionUser_(token) {
  if (!token) fail('Please log in again.');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess_' + token);
  if (!raw) fail('Session expired. Please log in again.');
  var sess = JSON.parse(raw);
  var users = loadTable('Users');
  var user = findById(users, sess.userId);
  if (!user || String(user.Active) !== '1') fail('This account is not active. Please log in again.');
  // sliding expiry: refresh on activity
  cache.put('sess_' + token, JSON.stringify({ userId: user.Id, lastSeen: Date.now() }), SESSION_TTL_SECONDS);
  return user;
}

function userPerms_(user) {
  if (String(user.IsAdmin) === '1') return ALL_PERM_KEYS.slice();
  try { return JSON.parse(user.Perms || '[]'); } catch (e) { return []; }
}

function hasPerm(user, key) {
  return userPerms_(user).indexOf(key) !== -1;
}

/** Guard used by every server function: returns the user or throws. */
function guard(token, permKey) {
  var user = getSessionUser_(token);
  if (permKey && !hasPerm(user, permKey)) fail('You do not have permission for this action.');
  return user;
}

function publicUser_(user) {
  return {
    id: user.Id, fullName: user.FullName, username: user.Username,
    isAdmin: String(user.IsAdmin) === '1', perms: userPerms_(user), theme: user.Theme || 'light'
  };
}

/* ---------- login / logout ---------- */

function login(username, password) {
  var users = loadTable('Users');
  if (users.length === 0) fail('Setup is not complete yet.');
  var uname = String(username || '').toLowerCase();
  var user = null;
  users.forEach(function (u) { if (String(u.Username).toLowerCase() === uname) user = u; });
  if (!user) fail('Wrong username or password.');
  if (String(user.Active) !== '1') fail('This account has been deactivated.');
  if (hashPassword(password || '', user.Salt) !== user.PassHash) fail('Wrong username or password.');
  var token = createSession_(user);
  logAudit(user.Username, 'login', 'User', user.Id, 'Logged in');
  return { token: token, user: publicUser_(user), branding: branding_(), permDefs: PERMS };
}

/** Restore the signed-in user on page refresh. */
function me(token) {
  var user = guard(token, null);
  return { user: publicUser_(user), permDefs: PERMS, branding: branding_() };
}

function logout(token) {
  try { CacheService.getScriptCache().remove('sess_' + token); } catch (e) {}
  return { ok: true };
}

function setMyTheme(token, theme) {
  var user = guard(token, null);
  var users = loadTable('Users');
  var me = findById(users, user.Id);
  me.Theme = theme === 'dark' ? 'dark' : 'light';
  saveTable('Users', users);
  return { ok: true };
}

/* ---------- password: change own / admin reset / email recovery ---------- */

function changeMyPassword(token, oldPassword, newPassword) {
  var user = guard(token, null);
  if (hashPassword(oldPassword || '', user.Salt) !== user.PassHash) fail('Current password is wrong.');
  if (String(newPassword || '').length < 6) fail('New password must be at least 6 characters.');
  var users = loadTable('Users');
  var me = findById(users, user.Id);
  me.Salt = newSalt();
  me.PassHash = hashPassword(newPassword, me.Salt);
  saveTable('Users', users);
  logAudit(user.Username, 'password-change', 'User', user.Id, 'Changed own password');
  return { ok: true };
}

function requestPasswordReset(email) {
  var s = getSettings();
  if (!s.recoveryEmail || String(email || '').toLowerCase() !== String(s.recoveryEmail).toLowerCase()) {
    // Same response either way, so the form cannot be used to probe emails.
    return { ok: true };
  }
  var code = String(Math.floor(100000 + Math.random() * 900000));
  PropertiesService.getScriptProperties().setProperty('reset_' + code,
    JSON.stringify({ at: Date.now() }));
  try {
    MailApp.sendEmail(s.recoveryEmail, 'Fuel Card System — password reset code',
      'Your password reset code is: ' + code + '\n\nIt expires in 30 minutes. ' +
      'Enter it on the login screen with your new password. If you did not request this, ignore this email.');
  } catch (e) { fail('Could not send the reset email: ' + e.message); }
  return { ok: true };
}

function resetPasswordWithCode(code, username, newPassword) {
  var raw = PropertiesService.getScriptProperties().getProperty('reset_' + String(code || ''));
  if (!raw) fail('That reset code is not valid.');
  var rec = JSON.parse(raw);
  if (Date.now() - rec.at > 30 * 60 * 1000) fail('That reset code has expired. Request a new one.');
  if (String(newPassword || '').length < 6) fail('New password must be at least 6 characters.');
  var users = loadTable('Users');
  var user = null;
  users.forEach(function (u) { if (String(u.Username).toLowerCase() === String(username || '').toLowerCase()) user = u; });
  if (!user) fail('Username not found.');
  user.Salt = newSalt();
  user.PassHash = hashPassword(newPassword, user.Salt);
  saveTable('Users', users);
  PropertiesService.getScriptProperties().deleteProperty('reset_' + String(code));
  logAudit(user.Username, 'password-reset', 'User', user.Id, 'Password reset via recovery email code');
  return { ok: true };
}

/* ---------- user management (duplicate Admin profile, then tick permissions) ---------- */

function listUsers(token) {
  var me = guard(token, 'users.manage');
  return loadTable('Users').map(function (u) {
    return {
      id: u.Id, fullName: u.FullName, username: u.Username,
      isAdmin: String(u.IsAdmin) === '1', perms: userPerms_(u),
      active: String(u.Active) === '1', isMe: u.Id === me.Id
    };
  });
}

function saveUser(token, p) {
  var me = guard(token, 'users.manage');
  var users = loadTable('Users');
  var perms = (p.perms || []).filter(function (k) { return ALL_PERM_KEYS.indexOf(k) !== -1; });
  if (p.id) {
    var u = findById(users, p.id);
    if (!u) fail('User not found.');
    if (String(u.IsAdmin) === '1' && u.Id !== me.Id) fail('Another admin profile cannot be edited here.');
    u.FullName = p.fullName || u.FullName;
    u.Perms = JSON.stringify(String(u.IsAdmin) === '1' ? ALL_PERM_KEYS : perms);
    if (p.active !== undefined && u.Id !== me.Id) u.Active = p.active ? '1' : '0';
    if (p.newPassword) {
      if (String(p.newPassword).length < 6) fail('Password must be at least 6 characters.');
      u.Salt = newSalt();
      u.PassHash = hashPassword(p.newPassword, u.Salt);
    }
    saveTable('Users', users);
    logAudit(me.Username, 'edit', 'User', u.Id, 'User updated: ' + u.Username);
    return { ok: true, id: u.Id };
  }
  // Create: start from a duplicate of the chosen profile's permissions (Q8)
  if (!p.fullName || !p.username || !p.password) fail('Full name, username and password are required.');
  if (String(p.password).length < 6) fail('Password must be at least 6 characters.');
  var uname = String(p.username).toLowerCase();
  users.forEach(function (u) { if (String(u.Username).toLowerCase() === uname) fail('That username is already taken.'); });
  if (perms.length === 0 && p.duplicateFromId) {
    var src = findById(users, p.duplicateFromId);
    if (src) perms = userPerms_(src);
  }
  var salt = newSalt();
  var nu = {
    Id: uid(), FullName: p.fullName, Username: uname,
    PassHash: hashPassword(p.password, salt), Salt: salt, IsAdmin: '0',
    Perms: JSON.stringify(perms), Active: '1', Theme: 'light', CreatedAt: nowIso(), Demo: ''
  };
  users.push(nu);
  saveTable('Users', users);
  logAudit(me.Username, 'create', 'User', nu.Id, 'User created: ' + uname);
  return { ok: true, id: nu.Id };
}
