/**
 * malik-finder — Job Tracker sync & automation
 *
 * A container-bound Google Apps Script that turns a plain spreadsheet into a
 * job-application pipeline: it ingests the "Job Inbox" sheets a discovery agent
 * drops into Drive, emails you a digest, drafts recruiter outreach, and keeps
 * deadlines and interviews on your Calendar.
 *
 * The script runs as YOU — it uses native Gmail / Calendar / Drive / Sheets
 * access, so there are no API keys, service accounts, or secrets anywhere.
 *
 * ── Setup (see docs/SETUP.md for the full walkthrough) ────────────────────
 *   1. Open your tracker sheet › Extensions › Apps Script.
 *   2. Paste this file in, Save.
 *   3. Run `setup` once and approve the OAuth prompt
 *      (Advanced › Go to project › Allow).
 *   4. Open the new `Config` tab and fill in "Job Applications folder ID"
 *      and "Your name".
 *
 * ── What runs on its own after setup ─────────────────────────────────────
 *   • `syncFromBot`      hourly  — ingest new inbox sheets, email a digest,
 *                                  send or draft recruiter outreach.
 *   • `handleEdit`       on edit — status "Applied" stamps Date Submitted;
 *                                  an Interview Date creates a Calendar event.
 *   • `dailyMaintenance` daily   — deadline and follow-up Calendar reminders.
 *
 * Re-run `setup` after pulling a new version: it is idempotent and never
 * overwrites an existing Config tab.
 */

const VERSION = '1.0.0';

// ===================== Constants =====================
const DATA_SHEET_NAME = 'Tracker';
const CONFIG_SHEET_NAME = 'Config';
const DASHBOARD_SHEET_NAME = 'Dashboard';

/** Sheets the discovery routine drops into Drive must start with this. */
const INBOX_PREFIX = 'Job Inbox';
/** Prepended to an inbox sheet's name once its rows are in the Tracker. */
const SYNCED_TAG = '[synced]';
/** Optional Script Property fallback for the Drive folder ID. */
const FOLDER_ID_PROPERTY = 'JOB_APPLICATIONS_FOLDER_ID';

const HEADERS = [
  'Company Name', 'Role', 'Location', 'Application Status', 'Salary', 'Date Found',
  'Date Submitted', 'Link to Job Req', 'Source', 'Resume Used', 'Cover Letter Link',
  'Match Reason', 'Rejection Reason', 'Notes', 'Recruiter Name',
  'Recruiter Email', 'Outreach Status', 'Outreach Sent Date', 'Outreach Doc Link',
  'Deadline', 'Interview Date'
];

// 1-based column indices. Keep in sync with HEADERS and docs/SCHEMA.md.
const COL = {
  COMPANY: 1, ROLE: 2, LOCATION: 3, STATUS: 4, SALARY: 5, DATE_FOUND: 6, DATE_SUBMITTED: 7,
  URL: 8, SOURCE: 9, RESUME: 10, COVER: 11, MATCH: 12, REJECTION: 13, NOTES: 14,
  REC_NAME: 15, REC_EMAIL: 16, OUTREACH_STATUS: 17, OUTREACH_DATE: 18,
  OUTREACH_DOC: 19, DEADLINE: 20, INTERVIEW: 21
};

const STATUS_OPTIONS = ['Not Applied', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'On Hold'];
const STATUS_COLORS = {
  'Not Applied': '#fff2cc', 'Applied': '#d9ead3', 'Interviewing': '#cfe2f3',
  'Offer': '#b6d7a8', 'Rejected': '#f4cccc', 'On Hold': '#ead1dc'
};
const OUTREACH_OPTIONS = ['Pending', 'Sent', 'Drafted', 'Skipped', 'Replied'];

/**
 * Seeded into the Config tab on first `setup`. Every value is user-editable
 * from the sheet — nothing here should ever be personalised in source control.
 * See docs/CONFIGURATION.md for what each key does.
 */
const CONFIG_DEFAULTS = [
  ['Key', 'Value'],
  ['Your name', ''],                    // signs recruiter outreach; blank = unsigned
  ['Job Applications folder ID', ''],   // REQUIRED — Drive folder the routine writes to
  ['Target companies', ''],
  ['Role keywords', 'Software Engineer, Machine Learning, Data'],
  ['Locations', 'Remote'],
  ['Exclusions', 'Senior, Staff, Principal, Lead, 5+ years, 7+ years, Director'],
  ['Jobs per run', '10'],
  ['Recruiter auto-send', 'FALSE'],     // kill-switch: starts OFF so you review drafts first
  ['Max sends per run', '5'],
  ['Digest enabled', 'TRUE'],
  ['Digest recipient', ''],             // blank = the account running the script
  ['Follow-up days', '7'],
  ['Stale days', '5']
];

// ===================== Menu =====================
/** Simple trigger — adds a menu so the sheet is usable without the editor. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Job Finder')
    .addItem('Sync now', 'syncFromBot')
    .addItem('Rebuild dashboard', 'rebuildDashboard')
    .addSeparator()
    .addItem('Check setup', 'checkSetup')
    .addItem('Re-run setup', 'setup')
    .addToUi();
}

// ===================== Setup =====================
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(DATA_SHEET_NAME) || ss.getSheets()[0];
  sh.setName(DATA_SHEET_NAME);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  // drop any leftover columns beyond our schema (e.g. an older, wider header)
  const extraCols = sh.getMaxColumns() - HEADERS.length;
  if (extraCols > 0) sh.deleteColumns(HEADERS.length + 1, extraCols);
  seedConfig_(ss);
  applyFormats_(sh);
  buildDashboard_(ss);
  ensureTriggers_(ss);
  ss.toast('Setup complete — fill in the Config tab next.', 'Job Finder ' + VERSION, 10);
}

function seedConfig_(ss) {
  let c = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (c) return; // never overwrite existing user config
  c = ss.insertSheet(CONFIG_SHEET_NAME);
  c.getRange(1, 1, CONFIG_DEFAULTS.length, 2).setValues(CONFIG_DEFAULTS);
  c.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  c.setColumnWidth(1, 220).setColumnWidth(2, 420);
  c.getRange(1, 1, c.getMaxRows(), 1).setFontWeight('bold');
}

function getConfig_() {
  const c = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
  const map = {};
  if (c) {
    c.getRange(2, 1, Math.max(c.getLastRow() - 1, 0), 2).getValues().forEach(function (r) {
      if (r[0]) map[String(r[0]).trim()] = String(r[1]).trim();
    });
  }
  const bool = function (v, d) { return v === undefined || v === '' ? d : /^(true|yes|1|on)$/i.test(v); };
  const num = function (v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; };
  return {
    ownerName: map['Your name'] || '',
    folderId: map['Job Applications folder ID'] ||
      PropertiesService.getScriptProperties().getProperty(FOLDER_ID_PROPERTY) || '',
    recruiterAutoSend: bool(map['Recruiter auto-send'], false),
    maxSends: num(map['Max sends per run'], 5),
    digestEnabled: bool(map['Digest enabled'], true),
    digestRecipient: map['Digest recipient'] || Session.getActiveUser().getEmail(),
    followUpDays: num(map['Follow-up days'], 7),
    staleDays: num(map['Stale days'], 5)
  };
}

/** Reports what is and isn't wired up. Surfaced via the Job Finder menu. */
function checkSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = getConfig_();
  const lines = ['Job Finder ' + VERSION];

  lines.push(ss.getSheetByName(DATA_SHEET_NAME) ? 'OK  Tracker tab' : 'MISSING  Tracker tab — run setup');
  lines.push(ss.getSheetByName(CONFIG_SHEET_NAME) ? 'OK  Config tab' : 'MISSING  Config tab — run setup');

  if (!cfg.folderId) {
    lines.push('MISSING  "Job Applications folder ID" in Config');
  } else {
    try {
      const name = DriveApp.getFolderById(cfg.folderId).getName();
      lines.push('OK  Drive folder "' + name + '"');
    } catch (err) {
      lines.push('ERROR  Cannot open folder ' + cfg.folderId + ' — check the ID and sharing');
    }
  }

  lines.push(cfg.ownerName
    ? 'OK  Outreach signed "' + cfg.ownerName + '"'
    : 'WARN  "Your name" is blank — outreach will be unsigned');
  lines.push('Digest: ' + (cfg.digestEnabled ? 'on → ' + cfg.digestRecipient : 'off'));
  lines.push('Recruiter auto-send: ' +
    (cfg.recruiterAutoSend ? 'ON (max ' + cfg.maxSends + '/run)' : 'off — drafts only'));

  const handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  ['syncFromBot', 'handleEdit', 'dailyMaintenance'].forEach(function (h) {
    lines.push((handlers.indexOf(h) === -1 ? 'MISSING' : 'OK') + '  trigger ' + h);
  });

  const ui = SpreadsheetApp.getUi();
  ui.alert('Job Finder — setup check', lines.join('\n'), ui.ButtonSet.OK);
}

function rebuildDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  buildDashboard_(ss);
  ss.toast('Dashboard rebuilt.');
}

// ===================== Formatting =====================
function applyFormats_(sh) {
  const lastRow = Math.max(sh.getLastRow(), 2);
  const n = lastRow - 1;
  // dropdowns
  setListValidation_(sh.getRange(2, COL.STATUS, n, 1), STATUS_OPTIONS);
  setListValidation_(sh.getRange(2, COL.OUTREACH_STATUS, n, 1), OUTREACH_OPTIONS);
  // conditional formatting: status colors + stale "Not Applied"
  const statusRange = sh.getRange(2, COL.STATUS, n, 1);
  const cfg = getConfig_();
  const rules = Object.keys(STATUS_COLORS).map(function (k) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(k).setBackground(STATUS_COLORS[k]).setRanges([statusRange]).build();
  });
  // highlight a row's Date Found cell red if still "Not Applied" after staleDays
  const dateFoundRange = sh.getRange(2, COL.DATE_FOUND, n, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($D2="Not Applied",$F2<>"",TODAY()-$F2>' + cfg.staleDays + ')')
    .setBackground('#f4cccc').setRanges([dateFoundRange]).build());
  sh.setConditionalFormatRules(rules);
  // filter across all data
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, lastRow, HEADERS.length).createFilter();
}

function setListValidation_(range, list) {
  range.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build());
}

// ===================== Dashboard =====================
function buildDashboard_(ss) {
  const s = ss.getSheetByName(DASHBOARD_SHEET_NAME) || ss.insertSheet(DASHBOARD_SHEET_NAME);
  s.clear();
  const T = "'" + DATA_SHEET_NAME + "'";
  // Pipeline funnel (status counts)
  s.getRange(1, 1).setValue('Pipeline').setFontWeight('bold').setFontSize(12);
  s.getRange(2, 1, 1, 2).setValues([['Status', 'Count']]).setFontWeight('bold');
  STATUS_OPTIONS.forEach(function (st, i) {
    s.getRange(3 + i, 1).setValue(st);
    s.getRange(3 + i, 2).setFormula('=COUNTIF(' + T + '!D:D,A' + (3 + i) + ')');
  });
  const totalRow = 3 + STATUS_OPTIONS.length;
  s.getRange(totalRow, 1).setValue('TOTAL').setFontWeight('bold');
  s.getRange(totalRow, 2).setFormula('=COUNTA(' + T + '!A2:A)');
  // KPIs — the column letters below track COL; update both if the schema changes.
  s.getRange(2, 4).setValue('Found this week').setFontWeight('bold');
  s.getRange(2, 5).setFormula('=SUMPRODUCT((' + T + '!F2:F>=TODAY()-7)*(' + T + '!F2:F<>""))');
  s.getRange(3, 4).setValue('Outreach sent').setFontWeight('bold');
  s.getRange(3, 5).setFormula('=COUNTIF(' + T + '!Q:Q,"Sent")');
  s.getRange(4, 4).setValue('Follow-ups due').setFontWeight('bold');
  s.getRange(4, 5).setFormula('=SUMPRODUCT((' + T + '!D2:D="Applied")*(' + T + '!G2:G<>"")*(TODAY()-' + T + '!G2:G>=7))');
  // Breakdown by Resume Used (col J) and Source (col I)
  s.getRange(2, 7).setValue('By Resume Used').setFontWeight('bold');
  s.getRange(3, 7).setFormula('=IFERROR(QUERY(' + T + '!J2:J,"select J, count(J) where J is not null group by J label J \'Resume\', count(J) \'Count\'",0),"—")');
  s.getRange(2, 10).setValue('By Source').setFontWeight('bold');
  s.getRange(3, 10).setFormula('=IFERROR(QUERY(' + T + '!I2:I,"select I, count(I) where I is not null group by I label I \'Source\', count(I) \'Count\'",0),"—")');
  // Funnel chart from the status-count table
  try {
    const dataRange = s.getRange(2, 1, STATUS_OPTIONS.length + 1, 2);
    s.getCharts().forEach(function (ch) { s.removeChart(ch); });
    const chart = s.newChart().asColumnChart()
      .addRange(dataRange).setPosition(totalRow + 2, 1, 0, 0)
      .setOption('title', 'Application Pipeline').setOption('legend', { position: 'none' }).build();
    s.insertChart(chart);
  } catch (err) { /* charts are best-effort — the tables above still build */ }
}

// ===================== Hourly sync =====================
/**
 * Ingest every unsynced `Job Inbox - <timestamp>` sheet in the Drive folder,
 * de-duplicating on "Link to Job Req", then mark each consumed sheet
 * `[synced]` so the next run skips it.
 */
function syncFromBot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(DATA_SHEET_NAME) || ss.getSheets()[0];
  const cfg = getConfig_();
  if (!cfg.folderId) {
    ss.toast('Set "Job Applications folder ID" on the Config tab first.', 'Job Finder', 10);
    return;
  }

  let folder;
  try {
    folder = DriveApp.getFolderById(cfg.folderId);
  } catch (err) {
    ss.toast('Cannot open Drive folder ' + cfg.folderId + ' — check the ID.', 'Job Finder', 10);
    return;
  }

  const have = collectUrls_(sh);
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const toAppend = [];
  const processed = [];
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (name.indexOf(INBOX_PREFIX) !== 0 || name.indexOf(SYNCED_TAG) !== -1) continue;
    const data = SpreadsheetApp.openById(f.getId()).getSheets()[0].getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var url = String(data[i][COL.URL - 1] || '').trim();
      if (!url || have[url]) continue;
      have[url] = true;
      var out = [];
      for (var c = 0; c < HEADERS.length; c++) out.push(data[i][c] !== undefined ? data[i][c] : '');
      toAppend.push(out);
    }
    processed.push(f);
  }

  if (toAppend.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAppend.length, HEADERS.length).setValues(toAppend);
  }
  applyFormats_(sh);
  processed.forEach(function (f) {
    if (f.getName().indexOf(SYNCED_TAG) === -1) f.setName(SYNCED_TAG + ' ' + f.getName());
  });

  if (toAppend.length && cfg.digestEnabled) sendDigest_(toAppend, cfg);
  processOutreach_(sh, cfg);
}

function collectUrls_(sh) {
  const have = {};
  const lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    sh.getRange(2, COL.URL, lastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0]) have[String(r[0]).trim()] = true;
    });
  }
  return have;
}

// ===================== Digest email =====================
function sendDigest_(rows, cfg) {
  const subject = 'Job Finder: ' + rows.length + ' new ' + (rows.length === 1 ? 'job' : 'jobs');
  let html = '<h3>' + rows.length + ' new job' + (rows.length === 1 ? '' : 's') + ' added</h3><ul>';
  rows.forEach(function (r) {
    const company = r[COL.COMPANY - 1], role = r[COL.ROLE - 1], loc = r[COL.LOCATION - 1];
    const url = r[COL.URL - 1], resume = r[COL.RESUME - 1], cover = r[COL.COVER - 1];
    html += '<li><b>' + esc_(company) + '</b> — ' + esc_(role) + (loc ? ' (' + esc_(loc) + ')' : '') +
      '<br>Resume: ' + esc_(resume) +
      (url ? ' · <a href="' + url + '">Job posting</a>' : '') +
      (cover ? ' · <a href="' + cover + '">Cover letter</a>' : '') + '</li>';
  });
  html += '</ul><p>Tracker: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '</p>';
  GmailApp.sendEmail(cfg.digestRecipient, subject, '', { htmlBody: html, name: 'Job Finder' });
}

function esc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===================== Recruiter outreach =====================
/**
 * Walks rows whose Outreach Status is "Pending".
 *
 * Guardrails, in order: auto-send must be explicitly enabled in Config, the
 * recruiter address must parse as an email, and the per-run send cap must not
 * be exhausted. Anything that fails one of those becomes a Gmail draft you
 * review by hand — the script never silently emails a stranger.
 */
function processOutreach_(sh, cfg) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const rows = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const signer = cfg.ownerName;
  let sent = 0;
  for (var i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[COL.OUTREACH_STATUS - 1]).trim() !== 'Pending') continue;
    const rowNum = i + 2;
    const email = String(r[COL.REC_EMAIL - 1] || '').trim();
    const company = r[COL.COMPANY - 1], role = r[COL.ROLE - 1];
    const body = readDocBody_(r[COL.OUTREACH_DOC - 1]) ||
      ('Hello,\n\nI am very interested in the ' + role + ' role at ' + company +
       '. My application and tailored resume are attached/linked. I would welcome the chance to connect.\n\nBest,\n' + signer);
    const subject = role + ' — Application' + (signer ? ' from ' + signer : '');
    const opts = signer ? { name: signer } : {};
    if (cfg.recruiterAutoSend && isEmail_(email) && sent < cfg.maxSends) {
      try {
        GmailApp.sendEmail(email, subject, body, opts);
        sh.getRange(rowNum, COL.OUTREACH_STATUS).setValue('Sent');
        sh.getRange(rowNum, COL.OUTREACH_DATE).setValue(new Date());
        sent++;
      } catch (err) {
        // A failed send is terminal: retrying risks double-sending.
        sh.getRange(rowNum, COL.OUTREACH_STATUS).setValue('Skipped');
      }
    } else {
      // No verified address, auto-send off, or cap reached -> leave a Gmail draft to review.
      try {
        const to = isEmail_(email) ? email : cfg.digestRecipient;
        const subj = isEmail_(email) ? subject : '[DRAFT - add recruiter] ' + subject;
        GmailApp.createDraft(to, subj, body, opts);
        sh.getRange(rowNum, COL.OUTREACH_STATUS).setValue('Drafted');
      } catch (err) { /* leave Pending so the next run retries */ }
    }
  }
}

function readDocBody_(url) {
  const id = docIdFromUrl_(url);
  if (!id) return '';
  try {
    return DocumentApp.openById(id).getBody().getText();
  } catch (err) {
    return ''; // unreadable doc -> fall back to the generated body
  }
}
function docIdFromUrl_(url) {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}
function isEmail_(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim()); }

// ===================== Status automation (onEdit) =====================
function handleEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== DATA_SHEET_NAME) return;
  const row = e.range.getRow(), col = e.range.getColumn();
  if (row < 2) return;
  // Status -> Applied stamps Date Submitted
  if (col === COL.STATUS && String(e.value).trim() === 'Applied') {
    const cell = sh.getRange(row, COL.DATE_SUBMITTED);
    if (!cell.getValue()) cell.setValue(new Date());
  }
  // Interview Date filled -> Calendar event
  if (col === COL.INTERVIEW && e.value) {
    const when = new Date(e.value);
    if (!isNaN(when.getTime())) {
      const company = sh.getRange(row, COL.COMPANY).getValue();
      const role = sh.getRange(row, COL.ROLE).getValue();
      addEventOnce_('interview', sh.getRange(row, COL.URL).getValue() + '|' + when.toDateString(),
        'Interview: ' + company + ' — ' + role, when);
    }
  }
}

// ===================== Daily maintenance (deadlines + follow-ups) =====================
function dailyMaintenance() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(DATA_SHEET_NAME);
  const cfg = getConfig_();
  if (!sh || sh.getLastRow() < 2) return;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  rows.forEach(function (r) {
    const url = String(r[COL.URL - 1] || '').trim();
    const company = r[COL.COMPANY - 1], role = r[COL.ROLE - 1];
    // Deadline reminder
    const dl = r[COL.DEADLINE - 1];
    if (dl) {
      const d = new Date(dl);
      if (!isNaN(d.getTime()) && d >= today) {
        addEventOnce_('deadline', url, 'Deadline: ' + company + ' — ' + role, d);
      }
    }
    // Follow-up reminder
    const ds = r[COL.DATE_SUBMITTED - 1];
    if (String(r[COL.STATUS - 1]) === 'Applied' && ds) {
      const submitted = new Date(ds);
      const days = (today - submitted) / 86400000;
      if (days >= cfg.followUpDays) {
        addEventOnce_('followup', url, 'Follow up: ' + company + ' — ' + role, today);
      }
    }
  });
}

/** Creates a Calendar event at most once per (kind, key) for this document. */
function addEventOnce_(kind, key, title, date) {
  const props = PropertiesService.getDocumentProperties();
  const pk = 'evt_' + kind + '_' + key;
  if (props.getProperty(pk)) return;
  try {
    CalendarApp.getDefaultCalendar().createAllDayEvent(title, date)
      .addPopupReminder(12 * 60);
    props.setProperty(pk, '1');
  } catch (err) { /* best-effort — the property stays unset, so it retries */ }
}

// ===================== Triggers =====================
function ensureTriggers_(ss) {
  const handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (handlers.indexOf('syncFromBot') === -1)
    ScriptApp.newTrigger('syncFromBot').timeBased().everyHours(1).create();
  if (handlers.indexOf('handleEdit') === -1)
    ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  if (handlers.indexOf('dailyMaintenance') === -1)
    ScriptApp.newTrigger('dailyMaintenance').timeBased().atHour(7).everyDays(1).create();
}
