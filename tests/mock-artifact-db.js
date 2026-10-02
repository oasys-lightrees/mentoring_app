// Minimal in-memory mock of the artifact `db` capability, persisted to localStorage['__mockdb'].
(function () {
  const load = () => { try { return JSON.parse(localStorage.getItem('__mockdb') || '{}'); } catch (e) { return {}; } };
  const store = load(); // path -> data
  const persist = () => localStorage.setItem('__mockdb', JSON.stringify(store));
  const listeners = []; // {coll, cb, seen:Map}
  window.__mockStats = { writes: 0, deletes: 0 };
  const parent = (p) => p.split('/').slice(0, -1).join('/');
  const snapDoc = (p) => ({ id: p.split('/').pop(), exists: p in store, data: () => store[p] && JSON.parse(JSON.stringify(store[p])), metadata: { fromCache: false, hasPendingWrites: false } });
  function notify() {
    listeners.forEach((l) => {
      const docs = Object.keys(store).filter((p) => parent(p) === l.coll).sort();
      const changes = [];
      docs.forEach((p) => { const j = JSON.stringify(store[p]); if (!l.seen.has(p)) changes.push({ type: 'added', doc: snapDoc(p) }); else if (l.seen.get(p) !== j) changes.push({ type: 'modified', doc: snapDoc(p) }); l.seen.set(p, j); });
      [...l.seen.keys()].forEach((p) => { if (!(p in store)) { changes.push({ type: 'removed', doc: { id: p.split('/').pop(), exists: true, data: () => ({}) } }); l.seen.delete(p); } });
      if (changes.length || l.first) { l.first = false; const ds = docs.map(snapDoc); setTimeout(() => l.cb({ docs: ds, size: ds.length, empty: !ds.length, docChanges: () => changes, metadata: { fromCache: false, hasPendingWrites: false } }), 5); }
    });
  }
  const doc = (p) => ({
    id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p),
    set: async (d) => { await new Promise(r => setTimeout(r, 3)); store[p] = JSON.parse(JSON.stringify(d)); window.__mockStats.writes++; persist(); notify(); },
    delete: async () => { delete store[p]; window.__mockStats.deletes++; persist(); notify(); },
    collection: (c) => coll(p + '/' + c)
  });
  const coll = (c) => ({
    path: c, doc: (id) => doc(c + '/' + id),
    get: async () => { const ds = Object.keys(store).filter((p) => parent(p) === c).sort().map(snapDoc); return { docs: ds, size: ds.length, empty: !ds.length, docChanges: () => [], metadata: {} }; },
    onSnapshot: (cb) => { const l = { coll: c, cb, seen: new Map(), first: true }; listeners.push(l); notify(); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); }; }
  });
  const db = Object.freeze({ doc, collection: coll });
  window.claude = { use: async (n) => (n === 'db' ? db : null) };
  // simulate another user writing directly
  window.__mockExternalWrite = (p, d) => { store[p] = d; persist(); notify(); };
  window.__mockStore = store;
})();
