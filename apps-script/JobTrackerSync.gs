/**
 * ICE (Intelligent Career Engine) — Job Tracker sync & automation
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

const VERSION = '1.1.0';

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
  'Deadline', 'Interview Date', 'Company Domain', 'Resume Link', 'Application Method',
  'Auto-Apply Status', 'Recruiter Email Source'
];

// 1-based column indices. Keep in sync with HEADERS and docs/SCHEMA.md.
const COL = {
  COMPANY: 1, ROLE: 2, LOCATION: 3, STATUS: 4, SALARY: 5, DATE_FOUND: 6, DATE_SUBMITTED: 7,
  URL: 8, SOURCE: 9, RESUME: 10, COVER: 11, MATCH: 12, REJECTION: 13, NOTES: 14,
  REC_NAME: 15, REC_EMAIL: 16, OUTREACH_STATUS: 17, OUTREACH_DATE: 18,
  OUTREACH_DOC: 19, DEADLINE: 20, INTERVIEW: 21, COMPANY_DOMAIN: 22, RESUME_LINK: 23,
  APPLICATION_METHOD: 24, AUTO_APPLY_STATUS: 25, REC_EMAIL_SOURCE: 26
};

const STATUS_OPTIONS = ['Not Applied', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'On Hold'];
const STATUS_COLORS = {
  'Not Applied': '#fff2cc', 'Applied': '#d9ead3', 'Interviewing': '#cfe2f3',
  'Offer': '#b6d7a8', 'Rejected': '#f4cccc', 'On Hold': '#ead1dc'
};
const OUTREACH_OPTIONS = ['Pending', 'Sent', 'Drafted', 'Skipped', 'Replied'];
/** Auto-apply is opt-in; see docs/CONFIGURATION.md#auto-apply and SECURITY.md#guardrails-on-auto-apply. */
const AUTO_APPLY_OPTIONS = ['Not Applicable', 'Pending', 'Submitted', 'Needs Manual Questions', 'Failed'];
/** Exact hostnames this script will ever POST an application to. No subdomains, no wildcards. */
const ATS_HOSTS = {
  'boards.greenhouse.io': 'Greenhouse',
  'job-boards.greenhouse.io': 'Greenhouse',
  'jobs.lever.co': 'Lever'
};

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
  ['Email guessing enabled', 'FALSE'],  // OFF by default — see docs/CONFIGURATION.md#email-guessing-enabled
  ['Auto-apply enabled', 'FALSE'],      // kill-switch: OFF by default — see docs/CONFIGURATION.md#auto-apply
  ['Max applications per run', '3'],
  ['Applicant first name', ''],
  ['Applicant last name', ''],
  ['Applicant phone', ''],
  ['Applicant LinkedIn URL', ''],
  ['Digest enabled', 'TRUE'],
  ['Digest recipient', ''],             // blank = the account running the script
  ['Follow-up days', '7'],
  ['Stale days', '5']
];

// ===================== Menu =====================
/** Simple trigger — adds a menu so the sheet is usable without the editor. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ICE')
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
  ss.toast('Setup complete — fill in the Config tab next.', 'ICE ' + VERSION, 10);
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
  const digestRecipient = map['Digest recipient'] || Session.getActiveUser().getEmail();
  return {
    ownerName: map['Your name'] || '',
    folderId: map['Job Applications folder ID'] ||
      PropertiesService.getScriptProperties().getProperty(FOLDER_ID_PROPERTY) || '',
    recruiterAutoSend: bool(map['Recruiter auto-send'], false),
    maxSends: num(map['Max sends per run'], 5),
    emailGuessingEnabled: bool(map['Email guessing enabled'], false),
    autoApplyEnabled: bool(map['Auto-apply enabled'], false),
    maxApplications: num(map['Max applications per run'], 3),
    applicantFirstName: map['Applicant first name'] || '',
    applicantLastName: map['Applicant last name'] || '',
    applicantEmail: digestRecipient,
    applicantPhone: map['Applicant phone'] || '',
    applicantLinkedIn: map['Applicant LinkedIn URL'] || '',
    digestEnabled: bool(map['Digest enabled'], true),
    digestRecipient: digestRecipient,
    followUpDays: num(map['Follow-up days'], 7),
    staleDays: num(map['Stale days'], 5)
  };
}

/** Reports what is and isn't wired up. Surfaced via the ICE menu. */
function checkSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = getConfig_();
  const lines = ['ICE ' + VERSION];

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
  lines.push('Email guessing: ' + (cfg.emailGuessingEnabled ? 'ON — unverified guesses will be emailed if auto-send is also on' : 'off'));
  lines.push('Auto-apply: ' +
    (cfg.autoApplyEnabled ? 'ON (max ' + cfg.maxApplications + '/run, Greenhouse + Lever only)' : 'off'));

  const handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  ['syncFromBot', 'handleEdit', 'dailyMaintenance'].forEach(function (h) {
    lines.push((handlers.indexOf(h) === -1 ? 'MISSING' : 'OK') + '  trigger ' + h);
  });

  const ui = SpreadsheetApp.getUi();
  ui.alert('ICE — setup check', lines.join('\n'), ui.ButtonSet.OK);
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
  setListValidation_(sh.getRange(2, COL.AUTO_APPLY_STATUS, n, 1), AUTO_APPLY_OPTIONS);
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
    ss.toast('Set "Job Applications folder ID" on the Config tab first.', 'ICE', 10);
    return;
  }

  let folder;
  try {
    folder = DriveApp.getFolderById(cfg.folderId);
  } catch (err) {
    ss.toast('Cannot open Drive folder ' + cfg.folderId + ' — check the ID.', 'ICE', 10);
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
  guessRecruiterEmails_(sh, cfg);
  processOutreach_(sh, cfg);
  processAutoApply_(sh, cfg);
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
  const subject = 'ICE: ' + rows.length + ' new ' + (rows.length === 1 ? 'job' : 'jobs');
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
  GmailApp.sendEmail(cfg.digestRecipient, subject, '', { htmlBody: html, name: 'ICE' });
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
 *
 * The address here may be `Published` (the agent found it on the posting) or
 * `Guessed` (see guessRecruiterEmails_ below, opt-in) — this function treats
 * both the same, since `Recruiter auto-send` is the guardrail either way.
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

// ===================== Recruiter email guessing (opt-in) =====================
/**
 * For rows with a published recruiter name but no published email, build
 * exactly ONE candidate address (`first.last@domain`) and keep it only if the
 * domain resolves an MX record. This is a domain sanity check, not mailbox
 * verification — no paid finder API, no API key, matching the rest of the
 * project. See docs/CONFIGURATION.md#email-guessing-enabled and
 * SECURITY.md#guardrails-on-email-guessing for the exact guarantees.
 *
 * `Recruiter Email Source` doubles as the "already attempted" guard, so a
 * row is only ever guessed once — including when the guess doesn't pan out,
 * so a domain with no mail server isn't re-checked every hour forever.
 */
function guessRecruiterEmails_(sh, cfg) {
  if (!cfg.emailGuessingEnabled) return;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const rows = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const mxCache = {};
  for (var i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    const email = String(r[COL.REC_EMAIL - 1] || '').trim();
    const name = String(r[COL.REC_NAME - 1] || '').trim();
    const domain = String(r[COL.COMPANY_DOMAIN - 1] || '').trim().toLowerCase();
    const alreadyAttempted = String(r[COL.REC_EMAIL_SOURCE - 1] || '').trim();
    if (email || !name || !domain || alreadyAttempted) continue;
    const guess = buildEmailGuess_(name, domain);
    if (guess) {
      if (mxCache[domain] === undefined) mxCache[domain] = mxRecordExists_(domain);
      if (mxCache[domain]) sh.getRange(rowNum, COL.REC_EMAIL).setValue(guess);
    }
    // Marked "Guessed" even on a failed/undomained attempt so it isn't retried every sync.
    sh.getRange(rowNum, COL.REC_EMAIL_SOURCE).setValue('Guessed');
  }
}

/** first.last@domain — the most common corporate convention. One guess, never a spray. */
function buildEmailGuess_(fullName, domain) {
  const parts = String(fullName).trim().split(/\s+/).filter(function (p) { return /^[A-Za-z'-]+$/.test(p); });
  if (parts.length < 2) return '';
  const first = parts[0].toLowerCase();
  const last = parts[parts.length - 1].toLowerCase();
  return first + '.' + last + '@' + domain;
}

/** Free DNS-over-HTTPS MX lookup — no API key, no account. */
function mxRecordExists_(domain) {
  try {
    const res = UrlFetchApp.fetch(
      'https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX',
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return false;
    const data = JSON.parse(res.getContentText());
    return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
  } catch (err) {
    return false; // network hiccup -> treat as unverified, never guess blind
  }
}

// ===================== Auto-apply (opt-in) =====================
/**
 * Submits the public Greenhouse/Lever application form for rows still
 * `Not Applied`, up to `Max applications per run`. No login, no account, no
 * API key — this is the same anonymous form a browser submits.
 *
 * Never answers a required field it doesn't recognise: a posting with a
 * custom screening question becomes `Needs Manual Questions`, not a guess.
 * A row that fails or needs manual questions is never retried automatically
 * — same "don't repeat an irreversible action" rule as recruiter outreach.
 */
function processAutoApply_(sh, cfg) {
  if (!cfg.autoApplyEnabled) return;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const rows = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  let applied = 0;
  for (var i = 0; i < rows.length; i++) {
    if (applied >= cfg.maxApplications) break;
    const r = rows[i];
    const rowNum = i + 2;
    if (String(r[COL.STATUS - 1] || '').trim() !== 'Not Applied') continue;
    const autoStatus = String(r[COL.AUTO_APPLY_STATUS - 1] || '').trim();
    if (autoStatus && autoStatus !== 'Pending') continue; // Submitted/Failed/Needs Manual/Not Applicable are terminal

    const url = String(r[COL.URL - 1] || '').trim();
    const ats = detectAts_(url);
    if (!ats) {
      sh.getRange(rowNum, COL.AUTO_APPLY_STATUS).setValue('Not Applicable');
      continue;
    }

    applied++; // counts against the cap regardless of outcome -- it's one live request to a real employer's site either way
    const resumeUrl = String(r[COL.RESUME_LINK - 1] || '').trim();
    let result;
    try {
      result = submitApplication_(url, ats, resumeUrl, cfg);
    } catch (err) {
      result = 'failed';
    }
    if (result === 'submitted') {
      sh.getRange(rowNum, COL.AUTO_APPLY_STATUS).setValue('Submitted');
      sh.getRange(rowNum, COL.APPLICATION_METHOD).setValue('Auto — ' + ats);
      sh.getRange(rowNum, COL.STATUS).setValue('Applied');
      sh.getRange(rowNum, COL.DATE_SUBMITTED).setValue(new Date());
    } else if (result === 'needs_manual') {
      sh.getRange(rowNum, COL.AUTO_APPLY_STATUS).setValue('Needs Manual Questions');
    } else {
      sh.getRange(rowNum, COL.AUTO_APPLY_STATUS).setValue('Failed');
    }
  }
}

/** Exact-hostname match only — never a substring/wildcard match. */
function detectAts_(url) {
  const m = String(url || '').match(/^https?:\/\/([^/]+)/i);
  return m ? (ATS_HOSTS[m[1].toLowerCase()] || '') : '';
}

/**
 * Fetches the posting's live application page, fills every field it can
 * confidently map to the Applicant profile, and submits. Field names are
 * discovered from the page rather than hardcoded, since Greenhouse/Lever can
 * change markup at any time without warning.
 */
function submitApplication_(url, ats, resumeUrl, cfg) {
  // Lever's application form usually lives on a separate /apply sub-page, not
  // the job-description page itself -- unlike Greenhouse, which embeds it inline.
  const formUrl = (ats === 'Lever' && !/\/apply\/?$/i.test(url))
    ? url.replace(/\/$/, '') + '/apply' : url;
  const page = UrlFetchApp.fetch(formUrl, { muteHttpExceptions: true });
  if (page.getResponseCode() !== 200) return 'failed';
  const form = parseForm_(page.getContentText(), formUrl);
  if (!form || !form.fields.length) return 'failed'; // most likely a JS-rendered page we can't read statically

  const profile = {
    first_name: cfg.applicantFirstName, last_name: cfg.applicantLastName,
    email: cfg.applicantEmail, phone: cfg.applicantPhone, linkedin: cfg.applicantLinkedIn
  };
  let resumeBlob = null;
  if (resumeUrl) {
    try { resumeBlob = DriveApp.getFileById(docIdFromUrl_(resumeUrl)).getBlob(); } catch (err) { /* proceed without it */ }
  }

  const payload = {};
  for (var i = 0; i < form.fields.length; i++) {
    const f = form.fields[i];
    if (f.type === 'hidden') { payload[f.name] = f.value || ''; continue; } // carries whatever CSRF-style token the page issued
    const mapped = mapField_(f);
    if (mapped === 'resume') { if (resumeBlob) payload[f.name] = resumeBlob; continue; }
    if (mapped && profile[mapped]) { payload[f.name] = profile[mapped]; continue; }
    if (f.required) return 'needs_manual'; // a required field we can't confidently answer -- e.g. a custom screening question
  }

  const res = UrlFetchApp.fetch(form.action, {
    method: form.method, payload: payload, muteHttpExceptions: true, followRedirects: true
  });
  const code = res.getResponseCode();
  return (code >= 200 && code < 400) ? 'submitted' : 'failed';
}

function mapField_(f) {
  const key = (f.name + ' ' + f.id).toLowerCase();
  if (/first.?name/.test(key)) return 'first_name';
  if (/last.?name/.test(key)) return 'last_name';
  if (/e.?mail/.test(key)) return 'email';
  if (/phone/.test(key)) return 'phone';
  if (/resume|cv/.test(key)) return 'resume';
  if (/linkedin/.test(key)) return 'linkedin';
  return '';
}

/** Minimal regex-based form scraper — Apps Script has no DOM/HTML parser available. */
function parseForm_(html, pageUrl) {
  const formMatch = html.match(/<form\b([^>]*)>([\s\S]*?)<\/form>/i);
  if (!formMatch) return null;
  const attrs = formMatch[1], body = formMatch[2];

  const actionMatch = attrs.match(/action=["']([^"']+)["']/i);
  let action = actionMatch ? actionMatch[1] : pageUrl;
  if (action.indexOf('http') !== 0) {
    const base = pageUrl.match(/^https?:\/\/[^/]+/i)[0];
    action = (action.indexOf('/') === 0 ? base : base + '/') + action;
  }
  const methodMatch = attrs.match(/method=["']([^"']+)["']/i);
  const method = methodMatch ? methodMatch[1].toLowerCase() : 'post';

  const fields = [];
  const inputRe = /<input\b([^>]*?)\/?>/gi;
  let m;
  while ((m = inputRe.exec(body))) fields.push(parseFieldAttrs_(m[1], 'text'));
  const taRe = /<textarea\b([^>]*?)>/gi;
  while ((m = taRe.exec(body))) fields.push(parseFieldAttrs_(m[1], 'text'));
  const selRe = /<select\b([^>]*?)>/gi;
  while ((m = selRe.exec(body))) fields.push(parseFieldAttrs_(m[1], 'select'));

  return { action: action, method: method, fields: fields.filter(function (f) { return f.name; }) };
}

function parseFieldAttrs_(attrStr, fallbackType) {
  const get = function (attr) {
    const m = attrStr.match(new RegExp(attr + '=["\']([^"\']*)["\']', 'i'));
    return m ? m[1] : '';
  };
  return {
    type: (get('type') || fallbackType).toLowerCase(),
    name: get('name'), id: get('id'), value: get('value'),
    required: /\brequired\b/i.test(attrStr) || /aria-required=["']true["']/i.test(attrStr)
  };
}

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
