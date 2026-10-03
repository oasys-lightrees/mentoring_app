// Runs server/Code.gs in Node with in-memory stand-ins for the Apps Script services it uses.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

function createServer() {
  const sheets = {};
  const cache = new Map();
  const logs = [];
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getLastRow() { return this.data.length; }
    appendRow(r) { this.data.push(r.slice()); }
    getRange(row, col, nr, nc) {
      const sh = this;
      return {
        getValues() { const out = []; for (let i = 0; i < nr; i++) out.push((sh.data[row - 1 + i] || []).slice(col - 1, col - 1 + nc)); return out; },
        setValues(v) { for (let i = 0; i < v.length; i++) { const r = row - 1 + i; while (sh.data.length <= r) sh.data.push([]); for (let j = 0; j < v[i].length; j++) sh.data[r][col - 1 + j] = v[i][j]; } }
      };
    }
  }
  const book = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = new Sheet(n)) };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      formatDate: (d, tz, f) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10) // Asia/Jakarta, yyyy-MM-dd only
    },
    ContentService: { createTextOutput: (t) => ({ setMimeType() { return this; }, getContent: () => t }), MimeType: { JSON: 'json' } },
    Logger: { log: (m) => logs.push(String(m)) },
    Date, JSON, Math, String, Number, Array, Object, RegExp, Error
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'server', 'Code.gs'), 'utf8'), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { post, setup: () => ctx.setup(), setupAlphaLeaders: () => ctx.setupAlphaLeaders(), logs, sheets, cache };
}
module.exports = { createServer };
