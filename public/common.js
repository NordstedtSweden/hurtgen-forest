/* Västfronten – gemensamt för alla spel: topplista med offlinekö och offlinestöd */
(function () {
  "use strict";
  const QKEY = "vf_queue";
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function queue() { try { return JSON.parse(lsGet(QKEY) || "[]"); } catch (e) { return []; } }
  function saveQueue(q) { lsSet(QKEY, JSON.stringify(q.slice(-30))); }
  const url = game => "/api/highscores?game=" + encodeURIComponent(game);

  async function post(game, payload) {
    const r = await fetch(url(game), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(j.error || "HTTP " + r.status); err.status = r.status; throw err; }
    return j;
  }
  // Ett nätfel eller serverfel köas; ett avvisat resultat (t.ex. "Orimlig poäng") köas inte
  const retryable = e => !e.status || e.status >= 500 || e.status === 429;

  let flushing = false;
  async function flush() {
    if (flushing || navigator.onLine === false) return;
    const q = queue(); if (!q.length) return;
    flushing = true;
    const rest = [];
    for (const it of q) { try { await post(it.game, it.payload); } catch (e) { if (retryable(e)) rest.push(it); } }
    saveQueue(rest.concat(queue().slice(q.length)));
    flushing = false;
  }

  window.VF = {
    lsGet, lsSet,
    pending: () => queue().length,
    flush,
    async submit(game, payload) {
      try { const j = await post(game, payload); flush(); return Object.assign({ ok: true }, j); }
      catch (e) {
        if (!retryable(e)) return { ok: false, error: e.message };
        const q = queue(); q.push({ game, payload, at: Date.now() }); saveQueue(q);
        return { ok: false, queued: true };
      }
    },
    async load(game) {
      const r = await fetch(url(game), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
    best(game) { return +(lsGet("vf_best_" + game) || 0); },
    setBest(game, v) { if (v > this.best(game)) lsSet("vf_best_" + game, String(v)); },
  };

  addEventListener("online", flush);
  setTimeout(flush, 1500);
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();
