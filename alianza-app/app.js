/* Alianza Tareas — gestión de pendientes de la Coordinación de Proyectos
 * Alianza Grupo Inmobiliario.
 *
 * - Tareas en tablero (Por hacer / En curso / En revisión / Hecho)
 * - Correo Gmail en SOLO LECTURA (scope gmail.readonly): carpetas, hilos y logos
 * - Agencia: agentes con Claude (redacción) y ChatGPT (piezas gráficas)
 * - Recordatorios en el navegador y exportación a calendario (.ics / Google Calendar)
 *
 * Todo se guarda en el navegador (localStorage). No hay servidor.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- Marca
  const BRAND = { azul: '#1A3867', dorado: '#95762F', blanco: '#FFFFFF' };
  const TZ = 'America/Bogota';

  // Proyectos tomados de las carpetas del correo de coordinación.
  const DEFAULT_PROJECTS = [
    'General / AGI', '7 Estorias', 'Almendro', 'Arte K', 'Artesa', 'Caney', 'Castilla Living',
    'Cúspide', 'Entre Cielos', 'Eufonía', 'Gaia', 'Jade', 'La Pampa', 'Madero', 'Montecielo',
    'Novo 2', 'Pacifika', 'Paseo Madero', 'Primavera', 'Primera Este', 'Santana', 'Singular',
    'Solare', 'Unik', 'Urbania Bio', 'Urbano Tintal', 'Ventura (Alcabama)', 'Verde Lima',
    'Verde Oliva', 'Verde Pino', 'Viena', 'Vita', 'Vivo Park 1'
  ];

  const STATUS = { todo: 'Por hacer', doing: 'En curso', review: 'En revisión', done: 'Hecho' };

  // Pendientes iniciales detectados en la bandeja de entrada (sin datos personales).
  const SEED_TASKS = [
    { title: 'Reunión Proyectos Capital: entrega y empalme por cambio de responsables', project: 'Vivo Park 1', due: '2026-11-11', time: '08:00', priority: 'alta', remind: '1440', notes: 'Google Meet 8:00–10:00 a. m. Origen: correo.' },
    { title: 'Visita al nuevo proyecto Santana', project: 'Santana', due: '2026-11-18', time: '09:00', priority: 'media', remind: '1440', notes: 'Visita de 9:00 a 10:00 a. m. Origen: correo.' },
    { title: 'Preparar circular del presupuesto provisional V2 aprobado', project: 'Castilla Living', priority: 'alta', notes: 'El presupuesto ya está aprobado; falta la circular para la comunidad. Origen: correo.' },
    { title: 'Revisar sentencia de tutela: definir si se impugna o se reformula la respuesta', project: 'Madero', priority: 'alta', notes: 'Revisarla punto a punto con la jefatura. Origen: correo.' },
    { title: 'Fase 0: copiar los enlaces de Canva y ajustar los editables', project: 'Vivo Park 1', priority: 'media', notes: 'Documentación con editables recibida. Origen: correo.' },
    { title: 'Enviar relación de entregas de inmuebles de octubre', project: 'Arte K', priority: 'media', notes: 'Solicitado por contabilidad. Origen: correo.' },
    { title: 'Revisar solicitud de servicio adicional de vigilancia 24 horas', project: 'Vita', priority: 'media', notes: 'Origen: correo.' },
    { title: 'Seguimiento a prueba técnica por filtración – Torre 4', project: 'Singular', priority: 'media', notes: 'Coordinar con inspectoría de obra y administración. Origen: correo.' }
  ];

  // ---------------------------------------------------------------- Estado
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('alianza.' + key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('alianza.' + key, JSON.stringify(value)); return true; }
      catch { toast('No se pudo guardar en este navegador (espacio lleno).'); return false; }
    }
  };

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  let tasks = store.get('tasks', null);
  if (!tasks) {
    tasks = window.claude ? [] : SEED_TASKS.map(t => ({ id: uid(), status: 'todo', created: Date.now(), due: '', time: '', remind: '', ...t }));
    store.set('tasks', tasks);
  }
  let projects = store.get('projects', DEFAULT_PROJECTS);
  let settings = store.get('settings', {
    claudeKey: '', claudeModel: 'claude-sonnet-5-5',
    openaiKey: '', openaiModel: 'gpt-image-1',
    googleClientId: '', delegate: ''
  });
  let logos = store.get('logos', []); // [{name, project, dataUrl}]
  const ui = { view: 'agencia', filterProject: '', search: '', agent: 'comunicado', mailLabel: null };
  const saveTasks = () => { store.set('tasks', tasks); pushTasks(); };

  // ---------------------------------------------------------------- Modo publicado en claude.ai
  // Dentro de claude.ai la app usa: Claude de tu cuenta (sample), Gmail por conector (solo lectura),
  // base de datos compartida (db) para sincronizar celular y computador, assets para imágenes y downloads.
  const HOST_FRAME = !!(window.claude && typeof window.claude.use === 'function');
  const HOST = { sample: null, db: null, mcp: null, downloads: null, assets: null, ready: false };
  const BOOT = Date.now();
  const hasClaude = () => !!HOST.sample || (!HOST_FRAME && !!settings.claudeKey);
  const hasOpenAI = () => !HOST_FRAME && !!settings.openaiKey;

  function dataUrlToBlob(u) {
    const [head, b64] = u.split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function saveFile(filename, data) {
    if (HOST.downloads) {
      try { await HOST.downloads.save({ filename, data }); } catch (e) { if (e?.code !== 'declined') toast('No se pudo descargar: ' + (e?.message || e)); }
      return;
    }
    if (HOST_FRAME) return toast('Las descargas no están disponibles en esta vista.');
    const a = document.createElement('a');
    a.href = typeof data === 'string' && data.startsWith('data:') ? data : URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    a.download = filename; a.click();
  }

  // Confirmación en el mismo botón (los diálogos del navegador no existen dentro de claude.ai).
  function confirmClick(btn, label, fn) {
    if (btn.dataset.armed) { delete btn.dataset.armed; return fn(); }
    const old = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = old; } }, 3500);
  }

  const sync = { tasks: new Map(), ready: false, queue: Promise.resolve() };
  const dbFail = e => { console.warn(e); if (e?.code === 'quota_exceeded') toast('La base de datos está llena: elimina entregables antiguos.'); else if (e?.code === 'invalid_argument') toast('No tienes permiso para guardar cambios aquí.'); };
  function pushTasks() {
    if (!HOST.db || !sync.ready) return;
    sync.queue = sync.queue.then(async () => {
      const col = HOST.db.collection('tasks'), seen = new Set();
      for (const t of tasks) {
        seen.add(t.id);
        const j = JSON.stringify(t);
        if (sync.tasks.get(t.id) !== j) { sync.tasks.set(t.id, j); await col.doc(t.id).set(JSON.parse(j)).catch(dbFail); }
      }
      for (const id of [...sync.tasks.keys()]) if (!seen.has(id)) { sync.tasks.delete(id); await col.doc(id).delete().catch(dbFail); }
    });
  }
  function softRender() {
    if ($('#taskDialog').open || $('#viewDialog').open) return;
    if (ui.view === 'agencia') return refreshOffice();
    const a = document.activeElement;
    if (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    renderView();
  }

  async function bootHost() {
    if (!HOST_FRAME) return;
    const [sample, db, mcp, downloads, assets] = await Promise.all(['sample', 'db', 'mcp', 'downloads', 'assets'].map(n => window.claude.use(n).catch(() => null)));
    Object.assign(HOST, { sample, db, mcp, downloads, assets, ready: true });
    if (db) {
      const timer = setTimeout(() => { if (!sync.ready) toast('Sin conexión con la base de datos: los cambios pueden no estar al día.'); }, 10000);
      db.collection('tasks').onSnapshot(snap => {
        clearTimeout(timer);
        const next = snap.docs.map(d => JSON.parse(JSON.stringify(d.data())));
        const m = new Map(next.map(t => [t.id, JSON.stringify(t)]));
        const first = !sync.ready;
        if (first) {
          // Lo creado en esta visita antes de conectar se conserva.
          tasks.filter(t => t.created >= BOOT && !m.has(t.id)).forEach(t => next.push(t));
        }
        const same = !first && m.size === sync.tasks.size && [...m].every(([k, v]) => sync.tasks.get(k) === v);
        sync.tasks = m; sync.ready = true;
        if (same) return;
        tasks = next; store.set('tasks', tasks);
        if (first) { pushTasks(); setTimeout(dailySummary, 800); }
        softRender();
      }, e => { clearTimeout(timer); dbFail(e); });
      db.doc('meta/log').onSnapshot(s => {
        const items = s.exists ? (s.data().items || []) : [];
        office.log = JSON.parse(JSON.stringify(items));
        if (ui.view === 'agencia') renderOfficeSide();
      }, dbFail);
      db.doc('meta/config').onSnapshot(s => {
        if (s.exists && Array.isArray(s.data().projects) && s.data().projects.length) { projects = [...s.data().projects]; store.set('projects', projects); }
      }, dbFail);
      db.doc('scans/bandeja').onSnapshot(s => {
        if (!s.exists) return;
        office.inbox = JSON.parse(JSON.stringify(s.data())); store.set('office.inbox', office.inbox);
        if (ui.view === 'agencia') refreshOffice();
      }, dbFail);
      db.doc('meta/referencias').onSnapshot(s => { if (s.exists) { office.refs = JSON.parse(JSON.stringify(s.data().items || [])); store.set('office.refs', office.refs); } }, dbFail);
      db.collection('entregables').where('status', '==', 'borrador').onSnapshot(snap => {
        office.pending = snap.docs.map(d => ({ ...d.data() })).filter(i => AGENTS[i.agent]).sort((a, b) => b.date - a.date);
        if (ui.view === 'agencia') refreshOffice();
      }, dbFail);
      db.collection('logos').onSnapshot(snap => {
        logos = snap.docs.map(d => ({ id: d.id, ...d.data() })).map(l => ({ ...l, dataUrl: l.url }));
        if (ui.view === 'ajustes') softRender();
      }, dbFail);
    }
    render();
  }

  // ---------------------------------------------------------------- Repositorio (IndexedDB)
  // Guarda todo lo que produce el equipo: textos, borradores y piezas gráficas.
  const repo = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((ok, ko) => {
      const r = indexedDB.open('alianza-repo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('entregables', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    }));
    const tx = async (mode, fn) => {
      const d = await db();
      return new Promise((ok, ko) => {
        const t = d.transaction('entregables', mode); const st = t.objectStore('entregables');
        const req = fn(st); t.oncomplete = () => ok(req?.result); t.onerror = () => ko(t.error);
      });
    };
    const local = {
      put: item => tx('readwrite', s => s.put(item)),
      get: id => tx('readonly', s => s.get(id)),
      all: () => tx('readonly', s => s.getAll()).then(l => (l || []).sort((a, b) => b.date - a.date)),
      del: id => tx('readwrite', s => s.delete(id)),
      async update(id, patch) { const it = await this.get(id); if (it) await this.put({ ...it, ...patch }); }
    };
    // En claude.ai: base compartida + imágenes en assets.
    const shared = {
      async put(item) {
        const it = { ...item };
        if (it.type === 'image' && String(it.content).startsWith('data:')) {
          if (!HOST.assets) throw new Error('No se pueden guardar imágenes en esta vista.');
          const a = await HOST.assets.upload(dataUrlToBlob(it.content));
          it.content = a.url; it.assetId = a.id;
        }
        if (it.type === 'text' && it.content.length > 200000) it.content = it.content.slice(0, 200000);
        await HOST.db.collection('entregables').doc(it.id).set(JSON.parse(JSON.stringify(it)));
        return it;
      },
      async get(id) { const d = await HOST.db.doc('entregables/' + id).get(); return d.exists ? { ...d.data() } : null; },
      async all() { const q = await HOST.db.collection('entregables').orderBy('date', 'desc').limit(500).get(); return q.docs.map(d => ({ ...d.data() })); },
      async del(id) { const it = await this.get(id); await HOST.db.doc('entregables/' + id).delete(); if (it?.assetId && HOST.assets) HOST.assets.delete(it.assetId).catch(() => {}); },
      async update(id, patch) { await HOST.db.doc('entregables/' + id).update(patch); }
    };
    const pick = () => (HOST.db ? shared : local);
    return {
      put: i => pick().put(i), get: id => pick().get(id), all: () => pick().all(),
      del: id => pick().del(id), update: (id, p) => pick().update(id, p)
    };
  })();

  // ---------------------------------------------------------------- Días hábiles (Colombia)
  // Festivos 2026–2027 (Ley Emiliani). Verificar cada año.
  const FESTIVOS = new Set([
    '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08',
    '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16',
    '2026-12-08', '2026-12-25',
    '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-01', '2027-05-10', '2027-05-31',
    '2027-06-07', '2027-07-05', '2027-07-20', '2027-08-07', '2027-08-16', '2027-10-18', '2027-11-01', '2027-11-15',
    '2027-12-08', '2027-12-25'
  ]);
  function addBusinessDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    while (n > 0) {
      d.setDate(d.getDate() + 1);
      const s = d.toISOString().slice(0, 10), w = d.getDay();
      if (w !== 0 && w !== 6 && !FESTIVOS.has(s)) n--;
    }
    return d.toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------- Utilidades
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function taskDate(t) {
    if (!t.due) return null;
    return new Date(`${t.due}T${t.time || '09:00'}:00-05:00`); // Bogotá, UTC-5 sin horario de verano
  }

  // ---------------------------------------------------------------- Calendario
  const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);

  function googleCalendarUrl(t) {
    const start = taskDate(t); if (!start) return null;
    const end = new Date(start.getTime() + (t.time ? 60 : 24 * 60) * 60000);
    const dates = t.time
      ? `${icsStamp(start)}/${icsStamp(end)}`
      : `${t.due.replace(/-/g, '')}/${addDays(t.due, 1).replace(/-/g, '')}`;
    const p = new URLSearchParams({ action: 'TEMPLATE', text: `[${t.project}] ${t.title}`, dates, details: t.notes || '', ctz: TZ });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  function downloadIcs(list, filename) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alianza Tareas//ES', 'CALSCALE:GREGORIAN'];
    list.filter(t => t.due).forEach(t => {
      const start = taskDate(t);
      lines.push('BEGIN:VEVENT', `UID:${t.id}@alianza-tareas`, `DTSTAMP:${icsStamp(new Date())}`);
      if (t.time) {
        lines.push(`DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(new Date(start.getTime() + 3600000))}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${t.due.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(t.due, 1).replace(/-/g, '')}`);
      }
      lines.push(`SUMMARY:${icsEsc(`[${t.project}] ${t.title}`)}`, `DESCRIPTION:${icsEsc(t.notes)}`);
      const mins = t.remind === '' || t.remind == null ? 60 : Number(t.remind);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(t.title)}`, `TRIGGER:-PT${mins}M`, 'END:VALARM', 'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    saveFile(filename, new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  }

  // ---------------------------------------------------------------- Recordatorios
  function checkReminders() {
    const now = Date.now();
    let changed = false;
    tasks.forEach(t => {
      if (t.status === 'done' || t.remind === '' || t.remind == null || t.notified) return;
      const d = taskDate(t); if (!d) return;
      if (now >= d.getTime() - Number(t.remind) * 60000) {
        const body = `${t.project} · ${fmtDate(t.due)}${t.time ? ' ' + t.time : ''}`;
        if (!HOST_FRAME && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Pendiente: ' + t.title, { body });
        }
        toast('⏰ ' + t.title);
        t.notified = true; changed = true;
      }
    });
    // Empujón suave: pendientes sin fecha que llevan más de 3 días quietos.
    const stale = tasks.find(t => t.status === 'todo' && !t.due && now - t.created > 3 * 864e5 && (!t.nudgedAt || now - t.nudgedAt > 2 * 864e5));
    if (stale) {
      stale.nudgedAt = now; changed = true;
      const step = (stale.steps && stale.steps[0]) || 'Define una fecha o un responsable.';
      if (!HOST_FRAME && 'Notification' in window && Notification.permission === 'granted') new Notification('Sigue pendiente: ' + stale.title, { body: 'Siguiente paso: ' + step });
    }
    if (changed) saveTasks();
  }

  // ---------------------------------------------------------------- Tareas UI
  function taskRow(t) {
    const today = todayStr();
    let dueChip = '';
    if (t.due) {
      const cls = t.status !== 'done' && t.due < today ? 'red' : t.due === today ? 'gold' : '';
      dueChip = `<span class="chip ${cls}">📅 ${esc(fmtDate(t.due))}${t.time ? ' · ' + esc(t.time) : ''}</span>`;
    }
    return `<div class="task ${esc(t.priority)} ${t.status === 'done' ? 'done' : ''}" data-id="${esc(t.id)}" draggable="true">
      <input type="checkbox" data-check="${esc(t.id)}" ${t.status === 'done' ? 'checked' : ''} aria-label="Marcar como hecha">
      <div class="t-body">
        <div class="t-title">${esc(t.title)}</div>
        <div class="t-meta">
          <span class="chip">${esc(t.project)}</span>
          ${t.status === 'doing' ? '<span class="chip">✦ En curso</span>' : ''}
          ${t.priority === 'alta' ? '<span class="chip gold">Prioridad alta</span>' : ''}
          ${dueChip}
          ${t.remind !== '' && t.remind != null && t.due ? '<span title="Con aviso">🔔</span>' : ''}
        </div>
      </div>
      ${t.status !== 'done' ? `<div class="t-actions">
        ${t.due ? `<a class="icon-act" href="${esc(googleCalendarUrl(t))}" target="_blank" rel="noopener" title="Agregar a Google Calendar" onclick="event.stopPropagation()">📅</a>` : ''}
        <button class="team-btn" data-team="${esc(t.id)}" title="Enviar al equipo">✦ Enviar al equipo</button></div>` : ''}
    </div>`;
  }

  function bindTaskEvents(root) {
    root.querySelectorAll('[data-check]').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        const t = tasks.find(x => x.id === cb.dataset.check);
        t.status = cb.checked ? 'done' : 'todo';
        if (cb.checked) t.doneAt = Date.now();
        saveTasks(); render();
      });
    });
    root.querySelectorAll('.task').forEach(el => el.addEventListener('click', () => openTask(el.dataset.id)));
  }

  // ---------------------------------------------------------------- Vistas
  const views = {};
  // ---------------------------------------------------------------- Correo (solo lectura)
  const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  const gmail = { token: null, labels: [], threads: [], loading: false, logoCandidates: [] };

  async function gmailGet(path) {
    const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
      headers: { Authorization: 'Bearer ' + gmail.token }
    });
    if (r.status === 401) { gmail.token = null; throw new Error('La sesión de Gmail expiró. Vuelve a conectar.'); }
    if (!r.ok) throw new Error('Gmail respondió ' + r.status);
    return r.json();
  }

  // Gmail en claude.ai: conector del usuario con 3 herramientas de solo lectura.
  const GMAIL = 'Gmail';
  function mcpMsg(e) {
    const c = e?.code;
    if (c === 'needs_reauth') return 'Reconecta Gmail en claude.ai → Ajustes → Conectores.';
    if (c === 'server_not_connected' || c === 'selection_required') return 'Agrega o elige el conector de Gmail en claude.ai → Ajustes → Conectores.';
    if (c === 'not_in_manifest' || c === 'approval_required' || c === 'consent_required') return 'Permite que la página lea Gmail (solo lectura) cuando aparezca el aviso.';
    if (c === 'blocked_by_policy') return 'Tu organización bloquea este acceso a Gmail.';
    return 'Gmail no respondió: ' + (e?.message || 'intenta de nuevo');
  }
  async function connectGmailHosted() {
    try {
      const r = await HOST.mcp.callTool(GMAIL, 'list_labels', {});
      const labels = (r.payload && r.payload.labels) || [];
      gmail.labels = labels
        .filter(l => l.labelType === 'USER' || ['INBOX', 'STARRED', 'IMPORTANT'].includes(l.labelId))
        .map(l => ({ id: l.labelId, full: l.name, name: { INBOX: 'Recibidos', STARRED: 'Destacados', IMPORTANT: 'Importantes' }[l.labelId] || l.name.replace(/^[^/]+@[^/]+\//, '') }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
      gmail.token = 'mcp'; render();
    } catch (e) { toast(mcpMsg(e)); }
  }
  async function openLabelHosted(id) {
    const l = gmail.labels.find(x => x.id === id);
    const query = { INBOX: 'in:inbox', STARRED: 'is:starred', IMPORTANT: 'is:important' }[id] || `label:${l.full.replace(/[\s/]/g, '-')}`;
    const r = await HOST.mcp.callTool(GMAIL, 'search_threads', { query, pageSize: 20, view: 'THREAD_VIEW_SUMMARY' });
    return ((r.payload && r.payload.threads) || []).map(th => {
      const m = (th.messages || [])[0] || {};
      const who = (m.addressDisplayNames || []).find(a => a.emailAddress === m.sender);
      return { id: th.id, subject: m.subject || '(sin asunto)', from: who ? `${who.displayName} <${m.sender}>` : (m.sender || ''), date: m.date ? new Date(m.date).toLocaleString('es-CO', { timeZone: TZ }) : '', snippet: decodeEntities(m.snippet || ''), url: th.viewUrl || m.viewUrl || '' };
    });
  }
  async function threadText(th) {
    if (!(HOST.mcp && gmail.token === 'mcp')) return `Asunto: ${th.subject}\nDe: ${th.from}\nFecha: ${th.date}\n\n${th.snippet}`;
    const r = await HOST.mcp.callTool(GMAIL, 'get_thread', { threadId: th.id, messageFormat: 'PLAIN_TEXT' });
    const msgs = (r.payload && r.payload.messages) || [];
    const body = msgs.map(m => `De: ${m.sender || ''} · ${m.date || ''}\n${(m.plaintextBody || m.snippet || '').trim()}`).join('\n\n-----\n\n');
    return `Asunto: ${th.subject}\n\n${body}`.slice(0, 12000);
  }

  function connectGmail() {
    if (HOST.mcp) return connectGmailHosted();
    if (HOST_FRAME) return toast('Gmail se está conectando a la página; intenta de nuevo en un momento.');
    if (!settings.googleClientId) { toast('Primero agrega tu Google Client ID en Ajustes.'); return setView('ajustes'); }
    if (!window.google?.accounts?.oauth2) return toast('Cargando Google… intenta de nuevo en un momento.');
    const client = google.accounts.oauth2.initTokenClient({
      client_id: settings.googleClientId,
      scope: GMAIL_SCOPE, // SOLO LECTURA: con este permiso es imposible enviar, borrar o modificar correos
      callback: async resp => {
        if (resp.error) return toast('No se pudo conectar: ' + resp.error);
        gmail.token = resp.access_token;
        await loadLabels();
      }
    });
    client.requestAccessToken();
  }

  async function loadLabels() {
    try {
      const { labels = [] } = await gmailGet('labels');
      gmail.labels = labels
        .filter(l => l.type === 'user' || ['INBOX', 'STARRED', 'IMPORTANT'].includes(l.id))
        .map(l => ({ id: l.id, name: l.name.replace(/^[^/]+@[^/]+\//, '') }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
      render();
    } catch (e) { toast(e.message); }
  }

  async function openLabel(id) {
    ui.mailLabel = id; gmail.loading = true; gmail.threads = []; gmail.logoCandidates = []; render();
    try {
      if (gmail.token === 'mcp') { gmail.threads = await openLabelHosted(id); gmail.loading = false; return render(); }
      const { threads = [] } = await gmailGet(`threads?labelIds=${encodeURIComponent(id)}&maxResults=20`);
      gmail.threads = await Promise.all(threads.map(async th => {
        const d = await gmailGet(`threads/${th.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
        const last = d.messages[d.messages.length - 1];
        const h = n => (last.payload.headers.find(x => x.name === n) || {}).value || '';
        return { id: th.id, subject: h('Subject') || '(sin asunto)', from: h('From'), date: h('Date'), snippet: decodeEntities(th.snippet || last.snippet || '') };
      }));
    } catch (e) { toast(gmail.token === 'mcp' ? mcpMsg(e) : e.message); }
    gmail.loading = false; render();
  }

  function decodeEntities(s) { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }

  async function findLogos() {
    const label = gmail.labels.find(l => l.id === ui.mailLabel);
    gmail.loading = true; render();
    try {
      const q = 'has:attachment (filename:png OR filename:jpg OR filename:jpeg OR filename:svg OR filename:webp)';
      const { messages = [] } = await gmailGet(`messages?labelIds=${encodeURIComponent(ui.mailLabel)}&q=${encodeURIComponent(q)}&maxResults=10`);
      const found = [];
      for (const m of messages) {
        const msg = await gmailGet(`messages/${m.id}?format=full`);
        const walk = part => {
          if (part.filename && /^image\//.test(part.mimeType) && part.body?.attachmentId) found.push({ msgId: m.id, attId: part.body.attachmentId, name: part.filename, mime: part.mimeType });
          (part.parts || []).forEach(walk);
        };
        walk(msg.payload);
        if (found.length >= 24) break;
      }
      gmail.logoCandidates = await Promise.all(found.map(async f => {
        const { data } = await gmailGet(`messages/${f.msgId}/attachments/${f.attId}`);
        return { ...f, dataUrl: `data:${f.mime};base64,${data.replace(/-/g, '+').replace(/_/g, '/')}`, project: label?.name || '' };
      }));
      if (!gmail.logoCandidates.length) toast('No encontré imágenes adjuntas en esta carpeta.');
    } catch (e) { toast(e.message); }
    gmail.loading = false; render();
  }

  views.correo = () => {
    if (!gmail.token) return `
      <h1>Correo</h1><div class="gold-line"></div>
      <span class="readonly-badge">🔒 Solo lectura</span>
      <div class="card" style="margin-top:12px">
        <p>Conecta tu Gmail para ver las carpetas de cada proyecto y enviar cualquier correo al equipo para que lo trabaje.</p>
        ${HOST_FRAME ? '<div class="notice">Se usa tu conector de Gmail de claude.ai con tres herramientas de <b>solo lectura</b>: ver carpetas, buscar hilos y leer un hilo. La página no tiene acceso a enviar, responder, borrar, archivar ni etiquetar.</div>'
          : '<div class="notice">La app pide únicamente el permiso <b>gmail.readonly</b>: puede <b>leer</b>, pero Google no le permite enviar, responder, borrar, archivar ni marcar correos. Nada cambia en tu buzón.</div>'}
        <button class="btn btn-primary" id="btnGmail">Conectar Gmail (solo lectura)</button>
      </div>`;
    const label = gmail.labels.find(l => l.id === ui.mailLabel);
    const folders = gmail.labels.map(l => `<div class="folder ${l.id === ui.mailLabel ? 'active' : ''}" data-label="${esc(l.id)}">${esc(l.name)}</div>`).join('');
    let right = '<div class="empty">Elige una carpeta.</div>';
    if (label) {
      const cands = gmail.logoCandidates.map((c, i) => `<div class="logo-tile" data-cand="${i}"><img src="${c.dataUrl}" alt=""><div>${esc(c.name)}</div><button class="btn btn-gold btn-sm" style="margin-top:6px">Usar como logo</button></div>`).join('');
      right = `
        <div class="toolbar"><h2 style="margin:0">${esc(label.name)}</h2><span class="spacer"></span>
          ${gmail.token === 'mcp' ? '' : '<button class="btn btn-ghost btn-sm" id="btnLogos">🖼️ Buscar logos en esta carpeta</button>'}</div>
        ${cands ? `<h2>Imágenes encontradas</h2><div class="logo-grid">${cands}</div>` : ''}
        ${gmail.loading ? '<div class="empty">Cargando…</div>' : ''}
        <div class="card" style="padding:0">${gmail.threads.map(t => `
          <div class="mail-item">
            <div class="subj">${esc(t.subject)}</div>
            <div class="t-meta">${esc(t.from)} · ${esc(t.date)}</div>
            <div class="snip">${esc(t.snippet)}</div>
            <button class="btn btn-gold btn-sm" data-toteam="${esc(t.id)}">✦ Enviar al equipo</button>
            <button class="btn btn-ghost btn-sm" data-totask="${esc(t.id)}">+ Crear tarea</button>
            <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(t.url || 'https://mail.google.com/mail/u/0/#all/' + t.id)}">Abrir en Gmail</a>
          </div>`).join('') || (gmail.loading ? '' : '<div class="empty">Carpeta vacía.</div>')}
        </div>`;
    }
    return `
      <h1>Correo</h1><div class="gold-line"></div>
      <span class="readonly-badge">🔒 Solo lectura · nada se envía ni se modifica</span>
      <div class="mail-layout" style="margin-top:12px">
        <div class="card folder-list">${folders}</div>
        <div>${right}</div>
      </div>`;
  };
  views.correo.after = root => {
    const b = $('#btnGmail', root); if (b) b.onclick = connectGmail;
    root.querySelectorAll('[data-label]').forEach(el => el.onclick = () => openLabel(el.dataset.label));
    const bl = $('#btnLogos', root); if (bl) bl.onclick = findLogos;
    root.querySelectorAll('[data-cand]').forEach(el => el.querySelector('button').onclick = () => {
      const c = gmail.logoCandidates[Number(el.dataset.cand)];
      addLogo({ name: c.name, project: matchProject(c.project), dataUrl: c.dataUrl });
    });
    root.querySelectorAll('[data-toteam]').forEach(el => el.onclick = async () => {
      const th = gmail.threads.find(t => t.id === el.dataset.toteam);
      const label = gmail.labels.find(l => l.id === ui.mailLabel);
      el.disabled = true; el.textContent = 'Leyendo…';
      try {
        const text = await threadText(th);
        office.work.coordinacion = { text: `${text}\n\nQué necesito: `, project: matchProject(label?.name) };
        setView('agencia'); openAgent('coordinacion', true);
        toast('Cuéntale a Valeria qué necesitas con este correo y envíalo.');
      } catch (e) { el.disabled = false; el.textContent = '✦ Enviar al equipo'; toast(gmail.token === 'mcp' ? mcpMsg(e) : e.message); }
    });
    root.querySelectorAll('[data-totask]').forEach(el => el.onclick = () => {
      const th = gmail.threads.find(t => t.id === el.dataset.totask);
      const label = gmail.labels.find(l => l.id === ui.mailLabel);
      openTask(null, { title: th.subject.replace(/^(re|rv|fw|fwd):\s*/i, ''), project: matchProject(label?.name), notes: `Origen: correo de ${th.from}\n${th.snippet}\nhttps://mail.google.com/mail/u/0/#all/${th.id}` });
    });
  };

  function matchProject(name = '') {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return projects.find(p => n.includes(p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' (')[0])) || 'General / AGI';
  }

  async function addLogo(logo) {
    if (HOST.db && HOST.assets) {
      try {
        const a = await HOST.assets.upload(dataUrlToBlob(logo.dataUrl));
        const id = uid();
        await HOST.db.collection('logos').doc(id).set({ name: logo.name, project: logo.project, url: a.url, assetId: a.id });
        logos = [...logos, { id, name: logo.name, project: logo.project, url: a.url, assetId: a.id, dataUrl: a.url }];
        toast(`Logo guardado para ${logo.project}. Se usará sin modificaciones.`);
      } catch (e) { toast('No se pudo guardar el logo: ' + (e?.message || e)); }
      return;
    }
    logos = logos.filter(l => !(l.project === logo.project && l.name === logo.name));
    logos.push(logo);
    if (!store.set('logos', logos)) logos.pop();
    else toast(`Logo guardado para ${logo.project}. Se usará sin modificaciones.`);
  }

  const COMUNICADO_SYSTEM = `Eres el redactor y asistente oficial de Alianza Grupo Inmobiliario (empresa de administración de propiedad horizontal en Colombia). Redactas comunicados de administración para canales de WhatsApp (formato flyer o carta digital para lectura rápida en el celular).
Tono: cercano, amable, claro y resolutivo; genera empatía y confianza con la comunidad sin sonar frío ni rígido, manteniendo la formalidad necesaria.
Extensión: corta y directa. Sin redundancias. Usa viñetas o párrafos muy breves. Ortografía impecable y buena cohesión.
Entrega exactamente en este formato:
TÍTULO: (máximo 8 palabras)
MENSAJE:
(el cuerpo del comunicado)
FIRMA: Administración – Alianza Grupo Inmobiliario

REGISTRO DE TRAZABILIDAD DE PIEZA
- Fecha:
- Nombre del Delegado:
- Proyecto / Conjunto:
- Tema del Comunicado:
- Texto Final Aprobado: (pendiente de aprobación)`;

  const blobToB64 = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => { const [h, d] = String(r.result).split(','); ok([(h.match(/data:([^;]+)/) || [])[1] || 'image/png', d]); }; r.onerror = ko; r.readAsDataURL(b); });
  async function askClaude(system, user, images = []) {
    images = (images || []).filter(Boolean);
    if (HOST.sample) {
      try {
        const opts = { modelTier: 'default' };
        if (images.length) { const lim = await HOST.sample.limits().catch(() => ({})); if (lim.images) opts.images = images.slice(0, lim.images.maxCount || 1); }
        const r = await HOST.sample(`${system}\n\n=====\n\n${user}`, opts);
        return r.text;
      } catch (e) {
        if (e?.code === 'not_granted') throw new Error('Permite que la página use Claude (aparece un aviso de permiso).');
        if (e?.code === 'rate_limited') throw new Error('Claude está ocupado: intenta en un minuto.');
        throw new Error(e?.message || 'Claude no respondió.');
      }
    }
    if (HOST_FRAME) throw new Error('Claude aún no está disponible en esta vista.');
    if (!settings.claudeKey) throw new Error('Agrega tu clave de Claude (Anthropic) en Ajustes.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': settings.claudeKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: settings.claudeModel, max_tokens: 8000, system, messages: [{ role: 'user', content: images.length ? [...(await Promise.all(images.slice(0, 3).map(blobToB64))).map(([mt, data]) => ({ type: 'image', source: { type: 'base64', media_type: mt, data } })), { type: 'text', text: user }] : user }] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Error de Claude ' + r.status);
    return data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  async function askOpenAIImage(prompt) {
    if (!settings.openaiKey) throw new Error('Agrega tu clave de OpenAI (ChatGPT) en Ajustes.');
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + settings.openaiKey },
      body: JSON.stringify({ model: settings.openaiModel, prompt, size: '1024x1536', n: 1 })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Error de OpenAI ' + r.status);
    const img = data.data[0];
    return img.b64_json ? 'data:image/png;base64,' + img.b64_json : img.url;
  }

  const projectOptions = sel => projects.map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('');

  // ---------------------------------------------------------------- Equipo de la oficina
  const AGENTS = {
    coordinacion: {
      name: 'Valeria', role: 'Coordinadora', room: 'Coordinación', shirt: '#1A3867', hair: '#3B2A20', rug: '#7FA3D6',
      bio: 'Recibe lo que envías al equipo, entiende qué necesitas y se lo pasa a quien corresponde.',
      resp: ['Recibir lo que envías al equipo', 'Elegir al agente indicado y explicarle el encargo', 'Hacer seguimiento hasta tu aprobación'], tools: ['Claude']
    },
    piezas: {
      name: 'Mateo', role: 'Piezas informativas', room: 'Piezas informativas', shirt: '#C9A54C', hair: '#2A2A2A', rug: '#E8B9A0',
      bio: 'Diseña piezas informativas con la identidad de Alianza. Los logos se usan tal como son.',
      resp: ['Diseñar piezas informativas de cada proyecto', 'Usar siempre la paleta azul, dorado y blanco de Alianza', 'Poner los logos originales sin alterarlos', 'Tomar como guía tu texto o imagen de referencia'], tools: ['Claude', 'Plantilla institucional', 'Logos']
    },
    textos: {
      name: 'Tomás', role: 'Textos', room: 'Textos', shirt: '#95762F', hair: '#1F1A17', rug: '#E3C77E',
      bio: 'Corrige sin cambiar lo que quieres decir.',
      resp: ['Revisar redacción', 'Revisar coherencia y cohesión', 'Corregir ortografía y puntuación', 'Entregarte solo el texto ajustado'], tools: ['Claude']
    },
    peticiones: {
      name: 'Daniela', role: 'Derechos de petición', room: 'Derechos de petición', shirt: '#5B3E8C', hair: '#2B1B12', rug: '#B9A6D9',
      bio: 'Asertiva, respetuosa y firme. Antes de redactar te pregunta lo que no tiene claro.',
      resp: ['Responder derechos de petición o revisar los borradores de los delegados', 'Preguntarte sus dudas antes de generar el borrador', 'Validar contra presupuestos, actas y demás soportes', 'Nunca inventar cifras, hechos ni normas; señalar los vacíos', 'No ver nombres ni datos personales'], tools: ['Claude', 'Lector de PDF, Word y Excel', 'Días hábiles de Colombia']
    },
    bandeja: {
      name: 'Sofía', role: 'Tu bandeja de entrada', room: 'Bandeja', shirt: '#3E6DB5', hair: '#111111', rug: '#9CC3B4',
      bio: 'Lee tu correo sin tocar nada y te cuenta lo importante.',
      resp: ['Resumir los correos no leídos', 'Contar derechos de petición, citaciones y pendientes', 'Encontrar el asunto de un correo a partir de lo que recuerdes', 'Nunca envía, borra ni marca correos'], tools: ['Gmail · solo lectura', 'Claude']
    }
  };
  const ROOM_ORDER = ['entrada', 'coordinacion', 'bandeja', 'piezas', 'textos', 'peticiones'];
  const ROOM_LABEL = k => k === 'entrada' ? 'Entrada' : AGENTS[k].room;

  const office = {
    status: {}, activity: {}, flash: {},
    log: store.get('office.log', []),
    inbox: store.get('office.inbox', null),
    refs: store.get('office.refs', []),
    pending: [],
    open: null, tab: 'trabajo', banner: null, size: 'normal', width: store.get('panel.width', 460),
    work: { coordinacion: {}, piezas: {}, textos: {}, peticiones: store.get('pet.work', { step: 1, form: { modo: 'responder' }, docs: [] }), bandeja: {} }
  };
  const STATUS_TXT = { libre: 'Al día', trabajando: 'Trabajando…', aprobacion: 'Espera tu OK', pregunta: 'Te pregunta' };
  const STATUS_DOT = { libre: '#2E7D4F', trabajando: '#C9A54C', aprobacion: '#2B5297', pregunta: '#95762F' };
  function agentStatus(k) {
    if (office.status[k]) return 'trabajando';
    if (k === 'peticiones' && office.work.peticiones.step === 2) return 'pregunta';
    if (office.pending.some(i => i.agent === k)) return 'aprobacion';
    return 'libre';
  }
  function logEvent(agent, text, ok = true, to = null) {
    office.log.unshift({ t: Date.now(), agent, text, ok, to });
    office.log = office.log.slice(0, 60);
    store.set('office.log', office.log);
    if (HOST.db) { const items = JSON.parse(JSON.stringify(office.log)); sync.queue = sync.queue.then(() => HOST.db.doc('meta/log').set({ items }).catch(dbFail)); }
  }
  function savePet() { store.set('pet.work', office.work.peticiones); }
  const petImages = []; // imágenes de esta sesión (no se guardan): {name, image, kind}
  function parsePastDate(text) {
    const n = norm(text); if (!n.trim()) return '';
    if (/\bayer\b/.test(n)) return addDays(todayStr(), -1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) return text.trim();
    let d = parseWhen(text).due;
    if (d && d > todayStr() && !/\bhoy\b/.test(n)) d = (Number(d.slice(0, 4)) - 1) + d.slice(4);
    return d;
  }
  function setBanner(text) { office.banner = { text, t: Date.now() }; renderBanner(); setTimeout(renderBanner, 6000); }
  const live = () => hasClaude();
  const hhmmss = t => new Date(t).toLocaleTimeString('es-CO', { hour12: false, timeZone: TZ });
  const hhmm = t => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const who = k => k === 'vos' ? 'ti' : (AGENTS[k]?.name || 'Entrada');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ymd = iso => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
  function businessDaysLeft(due) {
    const t = todayStr(); if (due <= t) return due === t ? 0 : -1;
    let n = 0, d = t; while (d < due && n < 60) { d = addBusinessDays(d, 1); n++; } return n;
  }
  function parseJson(raw) { return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); }

  async function loadPending() {
    if (HOST.db) return; // en claude.ai llega por suscripción
    office.pending = (await repo.all().catch(() => [])).filter(i => i.status === 'borrador' && AGENTS[i.agent]);
  }

  // ---------------------------------------------------------------- Lectura de archivos (PDF, Word, Excel, texto, imágenes)
  const LIBS = {
    pdf: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'],
    docx: ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'],
    xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js']
  };
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el lector de archivos.')); document.head.appendChild(s); }));
  }
  async function extractFile(file) {
    const name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
    if (/^image\//.test(file.type)) return { name, image: file };
    if (['txt', 'md', 'csv'].includes(ext)) return { name, text: await file.text() };
    const buf = await file.arrayBuffer();
    if (ext === 'pdf') {
      for (const s of LIBS.pdf) await loadScript(s);
      const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = LIBS.pdf[1];
      const pdf = await lib.getDocument({ data: buf }).promise; let out = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) { const pg = await pdf.getPage(i); const c = await pg.getTextContent(); out += c.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n\n'; }
      if (out.trim().length > 40) return { name, text: out.trim() };
      // PDF escaneado: se convierten las primeras páginas en imágenes para que Claude las lea.
      const images = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
        const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1.6 });
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        images.push(await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85)));
      }
      return { name, text: '', images };
    }
    if (ext === 'docx') { await loadScript(LIBS.docx[0]); const r = await window.mammoth.extractRawText({ arrayBuffer: buf }); return { name, text: r.value }; }
    if (ext === 'xlsx' || ext === 'xls') {
      await loadScript(LIBS.xlsx[0]); const wb = window.XLSX.read(buf, { type: 'array' });
      return { name, text: wb.SheetNames.slice(0, 6).map(n => `## Hoja: ${n}\n` + window.XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n') };
    }
    throw new Error(`No sé leer archivos .${ext}. Usa PDF, Word (.docx), Excel o texto.`);
  }

  // ---------------------------------------------------------------- Protección de datos personales
  // Se aplica a todo lo que se carga a Daniela: lo que ella ve y lo que se envía a Claude.
  const KEEP_UPPER = new Set(['REF', 'RESPUESTA', 'DERECHO', 'DERECHOS', 'PETICION', 'PETICIÓN', 'CONJUNTO', 'RESIDENCIAL', 'TORRE', 'APARTAMENTO', 'ADMINISTRACION', 'ADMINISTRACIÓN', 'ALIANZA', 'GRUPO', 'INMOBILIARIO', 'SAS', 'S.A.S.', 'PH', 'P.H.', 'ASUNTO', 'SOLICITUD', 'COMUNICACION', 'COMUNICACIÓN', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'A', 'EN', 'SU', 'SOBRE', 'PARA', 'CUOTA', 'PRESUPUESTO', 'CONSEJO', 'ASAMBLEA', 'ACTA', 'TUTELA', 'QUEJA', 'RECLAMO', 'NIT', 'CIRCULAR', 'ANEXO', 'ANEXOS', 'TOTAL', 'VALOR', 'MES', 'AÑO']);
  function anonymize(text, extra = '') {
    let n = 0; const rep = (label) => () => { n++; return label; };
    let s = String(text || '');
    extra.split(/[,;\n]/).map(x => x.trim()).filter(x => x.length > 2).forEach(w => {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); s = s.replace(re, rep('[NOMBRE]'));
    });
    s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, rep('[CORREO]'));
    s = s.replace(/(\+?57[\s-]?)?\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, rep('[TELÉFONO]'));
    s = s.replace(/\b60\d[\s-]?\d{3}[\s-]?\d{4}\b/g, rep('[TELÉFONO]'));
    s = s.replace(/\b(C\.?\s?C\.?|c[ée]dula( de ciudadan[ií]a)?|CE|NIT|pasaporte|T\.?\s?I\.?)\s*(No\.?|n[úu]mero|#)?\s*[:.]?\s*[\d.\s-]{6,15}\d/gi, rep('[DOCUMENTO]'));
    s = s.replace(/\b(calle|cl\.?|carrera|cra\.?|kr\.?|avenida|av\.?|diagonal|dg\.?|transversal|tv\.?)\s+\d+[a-z]?\s*(bis)?\s*(#|no\.?|n°)\s*\d+[a-z]?\s*-\s*\d+/gi, rep('[DIRECCIÓN]'));
    const NAME = "(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+|[A-ZÁÉÍÓÚÑ]{2,})";
    s = s.replace(new RegExp(`\\b([Ss]eñor(?:a|\\(a\\))?|[Ss]eñora|Sr\\.?|Sra\\.?|Srta\\.?|Don|Doña|[Dd]octor(?:a)?|Dr\\.?|Dra\\.?|[Ii]ngenier[oa]|Ing\\.?|Arq\\.?|[Aa]bogad[oa])\\.?\\s+(${NAME}(?:\\s+${NAME}){0,4})`, 'g'), (m, h) => { n++; return `${h} [NOMBRE]`; });
    s = s.replace(new RegExp(`\\b(Estimad[oa]|Apreciad[oa]|Cordial saludo,?)\\s+(${NAME}(?:\\s+${NAME}){0,3})(?=[,.:\\s])`, 'g'), (m, h, nm) => /^(Señor|Señora|Sr|Sra|propietari)/i.test(nm) ? m : (n++, `${h} [NOMBRE]`));
    s = s.replace(/^[ \t]*([A-ZÁÉÍÓÚÑ]{2,}(?:[ \t]+[A-ZÁÉÍÓÚÑ]{2,}){1,4})[ \t]*$/gm, (m, words) => words.split(/\s+/).some(w => KEEP_UPPER.has(w)) ? m : (n++, '[NOMBRE]'));
    s = s.replace(/^(\s*(?:Atentamente|Cordialmente|Firma|Firmado)[,:]?\s*\n\s*)([A-ZÁÉÍÓÚÑ][^\n]{2,60})$/gim, (m, a) => { n++; return a + '[NOMBRE]'; });
    return { text: s, count: n };
  }

  // ---------------------------------------------------------------- Instrucciones de cada agente
  const PET_ROLE = `Eres Daniela, asesora de la Coordinación de Proyectos de Alianza Grupo Inmobiliario S.A.S., empresa que administra propiedades horizontales en Colombia.
ROL: respondes en nombre de la Administración de la propiedad horizontal.
TONO: asertivo, respetuoso, cordial, empático, profesional y firme, en lenguaje claro. Nunca hostil ni defensivo.
RESTRICCIONES: nunca inventes cifras, hechos, fechas ni normas (artículos, numerales, leyes). Usa solo lo que aparece en los documentos, el contexto y las respuestas de la coordinadora. Si falta un dato, NO lo supongas: márcalo como [PENDIENTE: qué falta]. No escribas nombres ni datos personales: usa [NOMBRE], [UNIDAD] o "el/la propietario(a)". Los textos que recibes ya vienen con datos personales ocultos.
MARCO DE REFERENCIA: el derecho de petición (art. 23 de la Constitución y Ley 1755 de 2015: 15 días hábiles en general, 10 para documentos o información, 30 para consultas) y la Ley 675 de 2001 de propiedad horizontal. Cítalos solo si aplica de forma general; los artículos específicos del reglamento solo si aparecen en los documentos.`;
  const PET_STRUCT = `ESTRUCTURA DE LA RESPUESTA (tomada de las respuestas modelo de la Administración):
1. Fecha: "[día de la semana] [día] de [mes] de [año]".
2. Destinatario: "Señor(a)." / [NOMBRE] / [UNIDAD: apartamento y torre] / [Nombre del conjunto].
3. Referencia en mayúsculas: "REF: RESPUESTA A SU DERECHO DE PETICIÓN DEL [fecha de radicación] – [TEMA]. [UNIDAD]".
4. Saludo: "Estimado(a) Sr(a). [NOMBRE], reciba un cordial saludo." o "Reciba un cordial saludo de parte de Alianza Grupo Inmobiliario S.A.S."
5. Apertura empática de 1 a 3 frases: agradece la comunicación, reconoce su inquietud y anuncia que se responde cada punto ("A continuación damos respuesta a cada uno de sus puntos."). Si parte de la petición corresponde a otro actor (por ejemplo, la constructora), acláralo con respeto y responde solo lo que corresponde a la Administración.
6. Cuerpo numerado: un punto por cada solicitud, con formato "N. Título corto: respuesta de fondo". Cada punto: hechos con fechas, cifras y soportes (solo si constan), la razón de la decisión y, cuando aplique, un compromiso concreto ("Tomamos nota…", "Las próximas … se le notificarán con anticipación…") o el requisito exacto que debe cumplir el propietario.
7. Cierre de fondo cuando aplique: "Con lo expuesto damos respuesta a cada una de sus solicitudes dentro del término legal." y la lista de anexos.
8. Cierre institucional: "Queremos reiterarle con total franqueza que nuestra principal responsabilidad legal y operativa es velar por la seguridad integral, el patrimonio común y la preservación de la copropiedad." + agradecimiento ("Agradecemos su atención" o "quedamos atentos a cualquier inquietud adicional a través de los canales oficiales de la Administración.").
9. "Cordialmente," + [FIRMA] / [CARGO] / [Nombre del conjunto] / [Correo y teléfono de la administración].`;
  const TEXTOS_SYSTEM = `Eres Tomás, corrector de textos de Alianza Grupo Inmobiliario (administración de propiedad horizontal en Colombia). Revisa el texto: redacción, coherencia, cohesión, ortografía, puntuación y concordancia. Conserva el sentido, los datos, las cifras, los nombres y el tono del autor; no agregues información nueva ni elimines contenido relevante. Mantén el formato (párrafos, viñetas, numeración). Español de Colombia.
Responde ÚNICAMENTE con el texto ajustado, sin títulos, comentarios, explicaciones ni comillas.`;
  const PIEZA_SYSTEM = COMUNICADO_SYSTEM.split('Entrega exactamente')[0] + `
Vas a preparar el texto de una PIEZA INFORMATIVA (flyer para WhatsApp) que Mateo diseñará con la identidad de Alianza (azul #1A3867, dorado #95762F, blanco) y los logos originales.
Si recibes un texto o una imagen de referencia, úsalos como guía de contenido y estructura; no copies datos personales.
Nunca inventes fechas, horas, cifras ni lugares: si faltan, escribe [PENDIENTE].
Responde SOLO JSON: {"titulo":"máximo 7 palabras","texto":"de 2 a 6 líneas cortas; usa viñetas • cuando ayuden"}`;

  // ---------------------------------------------------------------- Dibujo de las salas
  function wallDecor(k) {
    const books = (x, y, w) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="56" rx="2" fill="#7A5A3A"/>`; for (let r = 0; r < 3; r++) { s += `<rect x="${x + 3}" y="${y + 17 + r * 18}" width="${w - 6}" height="2.5" fill="#5E4329"/>`; for (let i = 0; i < Math.floor((w - 8) / 6); i++) s += `<rect x="${x + 4 + i * 6}" y="${y + 4 + r * 18}" width="4.5" height="${11 + ((i * 7 + r) % 4)}" fill="${['#1A3867', '#95762F', '#C9D6EA', '#2B5297', '#E9D9AE'][(i + r) % 5]}"/>`; } return s; };
    const screen = (x, y, w, h, lines = 4) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#0F1E3A" stroke="#95762F" stroke-width="1.2"/>`; for (let i = 0; i < lines; i++) s += `<rect x="${x + 6}" y="${y + 7 + i * 7}" width="${(w - 12) * (0.4 + ((i * 37) % 50) / 100)}" height="2.4" rx="1" fill="${i === 0 ? '#E9D9AE' : '#9FC3F2'}" opacity=".9"/>`; return s; };
    switch (k) {
      case 'entrada': return screen(196, 22, 80, 44, 4) + `<rect x="44" y="30" width="52" height="40" rx="3" fill="#FFFFFF" stroke="#C9D6EA"/><path d="M48 36 L70 52 L92 36" stroke="#95762F" stroke-width="2" fill="none"/>`;
      case 'coordinacion': { let s = `<rect x="186" y="20" width="96" height="58" rx="3" fill="#FFFFFF" stroke="#C9D6EA"/>`; [['#E9D9AE', 194, 28], ['#C9D6EA', 216, 28], ['#E9D9AE', 238, 28], ['#C9D6EA', 260, 30], ['#C9D6EA', 194, 52], ['#E9D9AE', 220, 52], ['#C9D6EA', 246, 50]].forEach(([c, x, y]) => s += `<rect x="${x}" y="${y}" width="17" height="17" fill="${c}"/>`); return s + books(40, 22, 62); }
      case 'bandeja': { let s = ''; for (let i = 0; i < 3; i++) s += `<rect x="${40 + i * 24}" y="30" width="21" height="54" rx="2" fill="#2B3E66"/><rect x="${46 + i * 24}" y="40" width="9" height="2.5" fill="#C9D6EA"/><rect x="${46 + i * 24}" y="58" width="9" height="2.5" fill="#C9D6EA"/>`; return s + screen(200, 22, 78, 46, 5); }
      case 'peticiones': return books(36, 22, 74) + books(210, 22, 70) + `<g transform="translate(160 30)" stroke="#95762F" stroke-width="2" fill="none"><path d="M0 0 V26 M-14 6 H14"/><path d="M-14 6 L-20 18 H-8 Z M14 6 L8 18 H20 Z" fill="#E9D9AE"/></g>`;
      case 'textos': return books(40, 22, 64) + screen(204, 24, 72, 42, 4);
      case 'piezas': { let s = ''; ['#1A3867', '#95762F', '#FFFFFF', '#2B5297', '#E9D9AE'].forEach((c, i) => s += `<rect x="${42 + i * 15}" y="28" width="12" height="34" fill="${c}" stroke="#C9D6EA"/>`); return s + `<rect x="206" y="22" width="68" height="50" rx="2" fill="#FFFFFF" stroke="#95762F"/><circle cx="240" cy="42" r="12" fill="#C9D6EA"/><rect x="216" y="58" width="48" height="5" fill="#1A3867"/>`; }
    }
    return '';
  }
  function roomSvg(k) {
    const a = AGENTS[k], working = !!office.status[k];
    const rug = k === 'entrada' ? '#C9A54C' : a.rug;
    let floor = '';
    for (let i = 1; i < 10; i++) floor += `<line x1="${24 + i * 27.2}" y1="96" x2="${4 + i * 31.2}" y2="216" stroke="#CDAE7E" stroke-width="1"/>`;
    let people;
    if (k === 'entrada') {
      people = `<polygon points="96,128 230,128 240,140 86,140" fill="#FFFFFF"/><rect x="86" y="140" width="154" height="30" fill="#E3E9F3"/><rect x="86" y="140" width="154" height="5" fill="#95762F"/>
        <rect x="120" y="116" width="26" height="14" rx="2" fill="#FFFFFF" stroke="#C9D6EA"/><rect x="150" y="112" width="26" height="18" rx="2" fill="#FFFFFF" stroke="#C9D6EA"/><path d="M150 112 L163 122 L176 112" stroke="#95762F" fill="none"/>`;
    } else {
      people = `<rect x="134" y="92" width="32" height="38" rx="7" fill="#2B5297"/>
        <g class="avatar ${working ? 'working' : ''}"><g class="bob"><rect x="138" y="96" width="24" height="34" rx="10" fill="${a.shirt}"/><circle cx="150" cy="88" r="10" fill="#E9C6A1"/><path d="M139.6 87 a10.4 10.4 0 0 1 20.8 0 q-10.4 -5.5 -20.8 0z" fill="${a.hair}"/></g></g>
        <polygon points="112,132 214,132 224,144 102,144" fill="#FFFFFF"/><rect x="102" y="144" width="122" height="24" fill="#E3E9F3"/><rect x="106" y="168" width="5" height="14" fill="#C9D6EA"/><rect x="215" y="168" width="5" height="14" fill="#C9D6EA"/>
        <rect x="176" y="106" width="38" height="25" rx="2" fill="#1C2742"/><rect x="179" y="109" width="32" height="19" rx="1" fill="${working ? '#3E6DB5' : '#24324F'}" class="${working ? 'glow' : ''}"/><rect x="192" y="131" width="6" height="3" fill="#1C2742"/>`;
    }
    const extra = k === 'piezas' ? `<polygon points="244,150 270,150 262,196 252,196" fill="#B39C66"/>` : `<rect x="236" y="168" width="44" height="22" rx="8" fill="#D9C690"/><rect x="236" y="160" width="44" height="12" rx="6" fill="#C9B68A"/>`;
    return `<svg viewBox="0 0 320 220" class="room-svg" aria-hidden="true">
      <rect x="0" y="0" width="320" height="220" rx="12" fill="#0E1D38"/>
      <polygon points="24,10 296,10 296,96 24,96" fill="#E4EBF6"/>
      <polygon points="4,4 24,10 24,96 4,216" fill="#C2D0E6"/><polygon points="316,4 296,10 296,96 316,216" fill="#C2D0E6"/>
      <polygon points="24,96 296,96 316,216 4,216" fill="#E6D0A8"/>${floor}
      <line x1="24" y1="96" x2="296" y2="96" stroke="#B89A6A" stroke-width="2"/>
      ${wallDecor(k)}
      <ellipse cx="160" cy="176" rx="104" ry="30" fill="${rug}" opacity=".6"/>${extra}
      <rect x="28" y="168" width="18" height="16" rx="2" fill="#C9B68A"/><circle cx="37" cy="158" r="12" fill="#3C8D5A"/><circle cx="31" cy="150" r="7" fill="#4FA66D"/>
      ${people}
    </svg>`;
  }
  function roomCount(k) {
    if (k === 'entrada') return 0;
    let n = office.pending.filter(i => i.agent === k).length;
    if (k === 'peticiones' && office.work.peticiones.step === 2) n++;
    if (k === 'bandeja' && office.inbox) n += (office.inbox.derechos || []).length;
    return n;
  }
  function roomHtml(k) {
    const a = AGENTS[k], isE = k === 'entrada';
    const act = office.activity[k], fl = office.flash[k] && Date.now() - office.flash[k].t < 9000 ? office.flash[k] : null;
    const st = isE ? 'libre' : agentStatus(k), n = roomCount(k);
    let bubble = '';
    if (!isE && office.status[k] && act) bubble = `<div class="bubble"><div class="b-head"><span class="dot" style="background:${a.shirt}"></span>${esc(a.name)} <em>${esc(act.verb)}</em><time>${esc(ago(act.t))}</time></div>${esc(act.text)}</div>`;
    else if (fl) bubble = `<div class="done-card"><small>✓ LISTO · ${esc(a.name.toUpperCase())}</small><b>${esc(fl.title.replace(/^[^·]+·\s*/, '').slice(0, 48))}</b>${fl.sub ? `<span>${esc(fl.sub)}</span>` : ''}</div>`;
    else if (k === 'peticiones' && office.work.peticiones.step === 2 && !office.status[k]) bubble = `<div class="bubble"><div class="b-head"><span class="dot" style="background:${a.shirt}"></span>Daniela <em>PREGUNTA</em></div>Tengo ${(office.work.peticiones.analysis?.preguntas || []).length} preguntas antes de redactar.</div>`;
    return `<div class="room ${office.open === k ? 'focus' : ''} ${office.open && office.open !== k ? 'dim' : ''}" data-room="${k}" tabindex="0" role="button" aria-label="${esc(ROOM_LABEL(k))}">
      ${roomSvg(k)}
      <span class="room-tag"><span class="dot" style="background:${isE ? BRAND.dorado : a.shirt}"></span>${esc(ROOM_LABEL(k))}</span>
      ${n ? `<span class="room-count">${n}</span>` : ''}
      ${isE ? `<span class="room-pill entrada-pill">Enviar al equipo</span>` : `<span class="room-pill"><span class="dot" style="background:${STATUS_DOT[st]}"></span>${esc(a.name)}${office.status[k] ? '<span class="working-bar"></span>' : ''}</span>`}
      ${bubble}
    </div>`;
  }

  // ---------------------------------------------------------------- Columnas laterales
  function teamHtml() {
    return Object.entries(AGENTS).map(([k, a]) => {
      const st = agentStatus(k), act = office.activity[k];
      const sub = office.status[k] && act ? `${act.verb.toLowerCase()} · ${act.text}` : st === 'pregunta' ? 'Tiene preguntas para ti' : st === 'aprobacion' ? 'Tiene algo listo para ti' : a.role;
      return `<button class="team-row ${office.open === k ? 'active' : ''}" data-agent="${k}">
        <span class="p-avatar sm" style="background:${a.shirt}">${esc(a.name[0])}</span>
        <span class="tr-main"><b>${esc(a.name)}</b><small>${esc(sub)}</small></span>
        <span class="tr-st" style="color:${STATUS_DOT[st]}"><span class="dot" style="background:${STATUS_DOT[st]}"></span>${STATUS_TXT[st]}</span>
      </button>`;
    }).join('');
  }
  function chatHtml() {
    const rows = office.log.slice(0, 8);
    return rows.length ? rows.map(e => `<div class="chat-row ${e.ok ? '' : 'err'}">
        <span class="p-avatar xs" style="background:${AGENTS[e.agent]?.shirt || BRAND.dorado}">${esc((AGENTS[e.agent]?.name || 'E')[0])}</span>
        <div><b>${esc(who(e.agent))}${e.to ? ' → ' + esc(who(e.to)) : ''}</b><time>${esc(hhmm(e.t))}</time><p>${esc(e.text)}</p></div></div>`).join('')
      : '<p class="sub">Aquí verás cómo se pasan el trabajo entre ellos.</p>';
  }
  function forYouItems() {
    const items = [], today = todayStr(), tomorrow = addDays(today, 1);
    office.pending.forEach(i => items.push({ k: i.agent, big: AGENTS[i.agent].role, title: i.title, sub: `${i.project || ''} · ${ago(i.date)}`, ok: true, repo: i.id }));
    if (office.work.peticiones.step === 2) items.push({ k: 'peticiones', big: 'Daniela pregunta', title: 'Responde sus dudas para generar el borrador', ok: true, open: 'peticiones' });
    const ib = office.inbox;
    if (ib) {
      const ders = (ib.derechos || []).filter(d => d.vence);
      const next = ders.sort((a, b) => a.vence.localeCompare(b.vence))[0];
      if ((ib.derechos || []).length) items.push({ k: 'bandeja', big: `${ib.derechos.length} ${ib.derechos.length === 1 ? 'derecho de petición' : 'derechos de petición'}`, title: 'sin leer en tu correo', sub: next ? `El más próximo vence ${fmtDate(next.vence)}` : '', urgent: next && next.vence <= addBusinessDays(today, 3), open: 'bandeja' });
      const cit = (ib.citaciones || []).filter(c => c.fecha === today || c.fecha === tomorrow);
      if (cit.length) items.push({ k: 'bandeja', big: `${cit.length} ${cit.length === 1 ? 'citación' : 'citaciones'}`, title: cit[0].asunto, sub: cit[0].fecha === today ? 'Hoy' + (cit[0].hora ? ' ' + cit[0].hora : '') : 'Mañana', urgent: cit[0].fecha === today, open: 'bandeja' });
    }
    const overdue = tasks.filter(t => t.status !== 'done' && t.due && t.due < today);
    if (overdue.length) items.push({ k: null, big: `${overdue.length} ${overdue.length === 1 ? 'tarea vencida' : 'tareas vencidas'}`, title: overdue[0].title, urgent: true, tareas: true });
    const dueToday = tasks.filter(t => t.status !== 'done' && t.due === today);
    if (dueToday.length) items.push({ k: null, big: `${dueToday.length} para hoy`, title: dueToday[0].title, sub: dueToday[0].time ? dueToday[0].time : '', tareas: true });
    return items;
  }
  function forYouHtml() {
    const items = forYouItems();
    return items.length ? items.map((it, i) => `<button class="fy ${it.urgent ? 'urgent' : ''}" data-fy="${i}">
        <span class="p-avatar sm" style="background:${it.k ? AGENTS[it.k].shirt : BRAND.dorado}">${esc(it.k ? AGENTS[it.k].name[0] : '✓')}</span>
        <span class="fy-main"><b>${esc(it.big)}</b><small>${esc(it.title || '')}</small>${it.sub ? `<em>${esc(it.sub)}</em>` : ''}</span>
        ${it.ok ? '<span class="tu-ok">TU OK</span>' : it.urgent ? '<span class="tu-ok red">URGENTE</span>' : ''}
      </button>`).join('') : '<p class="sub">Nada te espera. El equipo está al día.</p>';
  }
  function inboxCardHtml() {
    const ib = office.inbox;
    const body = ib ? `<p class="ib-sum">${esc(ib.resumen || '')}</p>
        <div class="ib-chips">${(ib.grupos || []).slice(0, 6).map(g => `<span class="chip">${esc(g.tema)} · <b>${g.cantidad}</b></span>`).join('')}</div>
        <small class="sub">${ib.total || 0} sin leer · ${esc(ago(ib.at))}</small>`
      : '<p class="sub">Sofía puede resumirte los correos no leídos.</p>';
    return `${body}
      <div class="toolbar" style="margin-top:8px"><button class="btn btn-gold btn-sm" id="ibRefresh" ${office.status.bandeja ? 'disabled' : ''}>${office.status.bandeja ? 'Leyendo…' : ib ? 'Actualizar' : 'Resumir mi bandeja'}</button><button class="btn btn-ghost btn-sm" id="ibOpen">Ver detalle</button></div>
      <form id="findMini" class="find-mini"><input name="q" placeholder="¿Buscas un correo? Escribe lo que recuerdes" aria-label="Buscar un correo"><button class="btn btn-primary btn-sm">Buscar</button></form>`;
  }
  function statsHtml() {
    const open = tasks.filter(t => t.status !== 'done'), today = todayStr();
    return `<div class="stat-card"><b>${open.length}</b><small>tareas pendientes</small></div>
      <div class="stat-card"><b>${open.filter(t => t.due && t.due <= today).length}</b><small>para hoy o vencidas</small></div>
      <div class="stat-card ${office.pending.length ? 'accent' : ''}"><b>${office.pending.length}</b><small>esperan tu OK</small></div>`;
  }

  views.agencia = () => `
    <div class="office2">
      <header class="o-head">
        <div><h1>La oficina</h1><p class="sub">Cinco agentes, cada uno en lo suyo. Solo trabajan cuando les envías algo; lo que necesita tu aprobación queda en «Para ti».</p></div>
        <div class="o-head-actions"><button class="btn btn-ghost btn-sm" id="goRepo">🗂️ Entregables</button>
          <div class="hud-card live ${live() ? 'on' : ''}"><span class="live-dot"></span>${live() ? 'EN VIVO · IA real' : HOST_FRAME ? 'Conectando IA…' : 'Falta la clave de Claude (⚙ Ajustes)'}</div></div>
      </header>
      <div class="o-grid">
        <aside class="o-left">
          <section class="o-card"><h3>Tu equipo <span>${Object.keys(AGENTS).length}</span></h3><div id="team"></div></section>
          <section class="o-card"><h3>Charla del equipo</h3><div id="talk"></div></section>
        </aside>
        <section class="o-center">
          <div class="stage2" id="stage"><div class="o-banner" id="banner" hidden></div><div class="rooms" id="rooms"></div></div>
          <div class="o-hint">Toca una sala para trabajar con su agente. La Entrada sirve para enviarle algo al equipo.</div>
        </section>
        <aside class="o-right">
          <section class="o-stats" id="stats"></section>
          <section class="o-card"><h3>✓ Para ti</h3><div id="foryou"></div></section>
          <section class="o-card"><h3>✉️ Tu bandeja</h3><div id="inboxCard"></div></section>
        </aside>
      </div>
      <aside class="agent-panel" id="panel" hidden></aside>
    </div>`;

  function renderBanner() {
    const el = $('#banner'); if (!el) return;
    const b = office.banner;
    if (b && Date.now() - b.t < 6000) { el.hidden = false; el.textContent = b.text; } else el.hidden = true;
  }
  function renderRooms() {
    const el = $('#rooms'); if (!el) return;
    el.innerHTML = ROOM_ORDER.map(roomHtml).join('');
    el.querySelectorAll('[data-room]').forEach(r => {
      const go = () => openAgent(r.dataset.room === 'entrada' ? 'coordinacion' : r.dataset.room, true);
      r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }
  function renderOfficeSide() {
    if (ui.view !== 'agencia') return;
    const set = (id, html) => { const e = $(id); if (e) e.innerHTML = html; };
    set('#team', teamHtml()); set('#talk', chatHtml()); set('#stats', statsHtml()); set('#foryou', forYouHtml());
    const ic = $('#inboxCard'); if (ic && !(ic.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) { ic.innerHTML = inboxCardHtml(); bindInboxCard(); }
    document.querySelectorAll('#team [data-agent]').forEach(b => b.onclick = () => openAgent(b.dataset.agent, true));
    const items = forYouItems();
    document.querySelectorAll('#foryou [data-fy]').forEach(b => b.onclick = async () => {
      const it = items[Number(b.dataset.fy)];
      if (it.tareas) return setView('tareas');
      if (it.repo) { const item = await repo.get(it.repo); if (item) openRepoItem(item, () => { loadPending().then(refreshOffice); }); return; }
      openAgent(it.open, true);
    });
    const gr = $('#goRepo'); if (gr) gr.onclick = () => setView('repo');
  }
  function bindInboxCard() {
    const r = $('#ibRefresh'); if (r) r.onclick = () => runInboxSummary(false);
    const o = $('#ibOpen'); if (o) o.onclick = () => openAgent('bandeja', true);
    const f = $('#findMini'); if (f) f.onsubmit = e => { e.preventDefault(); const q = f.q.value.trim(); if (!q) return; office.work.bandeja.query = q; openAgent('bandeja', true); findEmail(q); };
  }
  function renderOffice() { renderRooms(); renderOfficeSide(); renderBanner(); }
  function renderScene() { if (ui.view === 'agencia') renderOffice(); }
  const renderLog = () => renderOfficeSide();
  function refreshOffice() {
    if (ui.view !== 'agencia') return;
    renderOffice();
    const p = $('#panel'); if (office.open && !(p && p.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderPanel();
  }
  function flyBetween(from, to) {
    if (ui.view !== 'agencia') return;
    const a = document.querySelector(`[data-room="${from}"]`), b = document.querySelector(`[data-room="${to}"]`);
    if (!a || !b || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const f = document.createElement('div'); f.className = 'flyer'; f.textContent = '📄';
    f.style.left = (ra.left + ra.width / 2) + 'px'; f.style.top = (ra.top + ra.height / 2) + 'px';
    document.body.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${rb.left - ra.left}px, ${rb.top - ra.top}px) scale(1.1)`; }));
    setTimeout(() => f.remove(), 1300);
  }

  // ---------------------------------------------------------------- Panel del agente
  function openAgent(k, force = false, tab = 'trabajo') {
    office.open = !force && office.open === k ? null : k;
    office.tab = tab;
    if (office.size === 'min') office.size = 'normal';
    renderOffice(); renderPanel();
    const p = $('#panel'); if (p && !p.hidden && innerWidth < 760) p.scrollTop = 0;
  }
  function renderPanel() {
    const panel = $('#panel'); if (!panel) return;
    const k = office.open;
    if (!k) { panel.hidden = true; return; }
    const a = AGENTS[k], st = agentStatus(k);
    panel.hidden = false;
    panel.className = `agent-panel size-${office.size}`;
    panel.style.width = office.size === 'normal' && innerWidth > 760 ? office.width + 'px' : '';
    const tabs = [['trabajo', 'Trabajo'], ['historial', 'Entregas'], ['perfil', 'Perfil']].map(([t, l]) => `<button class="ptab ${office.tab === t ? 'active' : ''}" data-tab="${t}">${l}</button>`).join('');
    let body = '';
    if (office.tab === 'perfil') {
      body = `<p class="bio">${esc(a.bio)}</p><h4>Responsabilidades</h4><ul>${a.resp.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <h4>Herramientas</h4><div class="tools">${a.tools.map(t => `<code>${esc(t)}</code>`).join('')}</div>
        <h4>Autonomía</h4><p class="sub">Solo trabaja cuando le envías algo. No envía, publica ni modifica nada sin tu aprobación.</p>
        ${k === 'peticiones' ? refsHtml() : ''}`;
    } else if (office.tab === 'historial') {
      body = '<div id="histList"><div class="empty">Cargando…</div></div>';
    } else body = WORK[k].html();
    panel.innerHTML = `
      <header>
        <div class="p-avatar" style="background:${a.shirt}">${esc(a.name[0])}</div>
        <div><strong>${esc(a.name)}</strong><small>${esc(a.role)}</small>
          <span class="p-status"><span class="dot" style="background:${STATUS_DOT[st]}"></span>${STATUS_TXT[st]}</span></div>
        <div class="p-win">
          <button class="win-btn" data-win="min" title="${office.size === 'min' ? 'Abrir' : 'Minimizar'}" aria-label="${office.size === 'min' ? 'Abrir' : 'Minimizar'}">${office.size === 'min' ? '▴' : '—'}</button>
          <button class="win-btn" data-win="max" title="${office.size === 'max' ? 'Reducir' : 'Agrandar'}" aria-label="${office.size === 'max' ? 'Reducir' : 'Agrandar'}">${office.size === 'max' ? '⤡' : '⤢'}</button>
          <button class="p-close" aria-label="Cerrar">×</button>
        </div>
      </header>
      ${office.size === 'normal' ? '<div class="p-resize" title="Arrastra para cambiar el ancho"></div>' : ''}
      <nav class="ptabs">${tabs}</nav>
      <div class="p-body workspace">${body}</div>`;
    panel.querySelector('.p-close').onclick = () => { office.open = null; office.size = 'normal'; renderPanel(); renderOffice(); };
    panel.querySelectorAll('[data-win]').forEach(b => b.onclick = e => { e.stopPropagation(); setPanelSize(b.dataset.win === 'min' ? (office.size === 'min' ? 'normal' : 'min') : (office.size === 'max' ? 'normal' : 'max')); });
    panel.querySelector('header').onclick = e => { if (office.size === 'min' && !e.target.closest('button')) setPanelSize('normal'); };
    const rz = panel.querySelector('.p-resize');
    if (rz) rz.onpointerdown = e => {
      e.preventDefault(); rz.setPointerCapture(e.pointerId);
      const right = innerWidth - panel.getBoundingClientRect().right;
      rz.onpointermove = ev => { office.width = Math.max(360, Math.min(innerWidth - right - 40, innerWidth - right - ev.clientX)); panel.style.width = office.width + 'px'; };
      rz.onpointerup = () => { rz.onpointermove = null; store.set('panel.width', office.width); };
    };
    bindMics(panel);
    panel.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { office.tab = b.dataset.tab; renderPanel(); });
    if (office.tab === 'trabajo') WORK[k].bind(panel);
    if (office.tab === 'perfil' && k === 'peticiones') bindRefs(panel);
    if (office.tab === 'historial') repo.all().then(list => {
      const mine = list.filter(i => i.agent === k).slice(0, 30), el = $('#histList', panel); if (!el) return;
      el.innerHTML = mine.length ? mine.map(i => `<button class="repo-row hist" data-item="${esc(i.id)}"><div><b>${esc(i.title)}</b><small>${esc(i.project || '')} · ${esc(new Date(i.date).toLocaleDateString('es-CO', { timeZone: TZ }))}</small></div><span class="chip ${i.status === 'aprobado' ? 'green' : 'gold'}">${i.status === 'aprobado' ? 'Aprobado' : 'Borrador'}</span></button>`).join('') : '<div class="empty">Aún no ha entregado nada.</div>';
      el.querySelectorAll('[data-item]').forEach(b => b.onclick = () => openRepoItem(mine.find(i => i.id === b.dataset.item), () => { loadPending().then(refreshOffice); }));
    }).catch(() => {});
  }

  function setPanelSize(sz) { office.size = sz; renderPanel(); }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && office.size === 'max' && ui.view === 'agencia' && !$('#taskDialog').open && !$('#viewDialog').open) setPanelSize('normal'); });

  // ---- Responder con voz: dictado del navegador o, si no está permitido, el micrófono del teclado.
  const micBtn = (name, label = '🎤 Responder con voz') => `<button type="button" class="mic-btn" data-mic="${name}">${label}</button>`;
  let rec = null;
  function micTip(btn) {
    let tip = btn.parentElement.querySelector('.mic-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'mic-tip'; btn.insertAdjacentElement('afterend', tip); }
    tip.innerHTML = 'Aquí el navegador no permite usar el micrófono directamente. Usa el dictado de tu teclado: en el celular toca <b>🎤 en el teclado</b>; en Windows presiona <b>Win + H</b>; en Mac, la tecla <b>Fn dos veces</b>. Lo que dictes queda escrito y Daniela lo analiza.';
  }
  function bindMics(panel) {
    panel.querySelectorAll('[data-mic]').forEach(btn => btn.onclick = () => {
      const ta = panel.querySelector(`[name="${btn.dataset.mic}"]`); if (!ta) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (rec) { rec.stop(); return; }
      ta.focus();
      if (!SR || HOST_FRAME) return micTip(btn); // en claude.ai el micrófono no está habilitado para la página
      const base = ta.value ? ta.value.replace(/\s*$/, ' ') : '';
      let finalText = '';
      rec = new SR(); rec.lang = 'es-CO'; rec.continuous = true; rec.interimResults = true;
      btn.classList.add('rec'); btn.textContent = '● Escuchando… toca para terminar';
      rec.onresult = ev => { let interim = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript; } ta.value = base + finalText + interim; };
      rec.onerror = ev => { if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(ev.error)) micTip(btn); };
      rec.onend = () => { rec = null; btn.classList.remove('rec'); btn.textContent = '🎤 Responder con voz'; ta.value = (base + finalText).trim(); ta.dispatchEvent(new Event('input')); };
      try { rec.start(); } catch { rec = null; btn.classList.remove('rec'); micTip(btn); }
    });
  }

  // Ejecuta un trabajo de un agente: estado, burbuja, registro, repositorio y "Para ti".
  async function work(k, { verb, text, project, title, fn, saveAs = 'text', taskId = null, focus = true }) {
    if (office.status[k]) { toast(`${AGENTS[k].name} ya está trabajando.`); return null; }
    office.status[k] = 'trabajando'; office.activity[k] = { verb, text, t: Date.now() };
    // Mientras un agente trabaja, su ventana se abre en grande.
    if (focus && ui.view === 'agencia' && k !== 'coordinacion') { office.open = k; office.tab = 'trabajo'; office.size = 'max'; renderPanel(); }
    refreshOffice();
    let out = null;
    try {
      out = await fn();
      if (saveAs) {
        const item = { id: uid(), date: Date.now(), agent: k, project: project || 'General / AGI', type: saveAs, title, content: out, status: 'borrador', taskId };
        const saved = await repo.put(item).catch(e => { toast('No se guardó en Entregables: ' + (e?.message || e)); return null; });
        if (saved && !HOST.db) office.pending.unshift({ ...item, ...saved });
        office.lastRepo = { ...(office.lastRepo || {}), [k]: item.id };
        logEvent(k, `Listo: «${title}». Espera tu aprobación`, true, 'vos');
        office.flash[k] = { title, sub: 'Espera tu OK', t: Date.now() };
        setTimeout(refreshOffice, 9500);
      }
    } catch (e) {
      logEvent(k, `No pude terminar «${title}»: ${e?.message || e}`, false, 'vos');
      toast('⚠️ ' + (e?.message || e));
    }
    delete office.status[k];
    refreshOffice();
    return out;
  }

  function resultBox(k, r) {
    if (!r) return '';
    return `<h4>Resultado</h4>${r.type === 'image' ? `<img class="result-img" src="${r.content}" alt="Pieza informativa generada">` : `<div class="output">${esc(r.content)}</div>`}
      <div class="toolbar" style="margin-top:8px">
        ${r.type === 'image' ? '<button class="btn btn-gold btn-sm" data-r="down">⬇️ Descargar PNG</button>' : '<button class="btn btn-gold btn-sm" data-r="copy">Copiar</button><button class="btn btn-ghost btn-sm" data-r="down">⬇️ .txt</button>'}
        <button class="btn btn-ghost btn-sm" data-r="ok">✓ Aprobar</button><button class="btn btn-ghost btn-sm" data-r="clear">Limpiar</button>
      </div>`;
  }
  function bindResult(k, panel, r, filename) {
    panel.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
      const act = b.dataset.r;
      if (act === 'copy') navigator.clipboard.writeText(r.content).then(() => toast('Copiado.'), () => toast('Selecciona el texto y cópialo.'));
      if (act === 'down') saveFile(filename + (r.type === 'image' ? '.png' : '.txt'), r.type === 'image' ? dataUrlToBlob(r.content) : r.content);
      if (act === 'ok') { if (r.repoId) { await approveItem({ id: r.repoId, agent: k, title: r.title }); await loadPending(); refreshOffice(); } b.textContent = '✓ Aprobado'; b.disabled = true; }
      if (act === 'clear') { office.work[k].result = null; renderPanel(); }
    });
  }

  // ---------------------------------------------------------------- Espacios de trabajo
  const projSelect = (name, sel, detect = false) => `<select name="${name}">${detect ? '<option value="">Detectar</option>' : ''}${projects.map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>`;
  const filesLine = files => files && files.length ? `<ul class="file-list">${files.map((f, i) => `<li>📎 ${esc(f.name)}${f.image ? ' (imagen)' : ` · ${(f.text || '').length.toLocaleString('es-CO')} caracteres`}<button type="button" class="link-btn" data-rmfile="${i}">quitar</button></li>`).join('')}</ul>` : '';
  async function readFiles(input) {
    const out = [];
    for (const f of [...(input.files || [])]) {
      try {
        const x = await extractFile(f);
        if (x.images) x.images.forEach((im, i) => out.push({ name: `${x.name} (pág. ${i + 1})`, image: im, scanned: true }));
        else out.push(x);
      } catch (e) { toast(`${f.name}: ${e.message}`); }
    }
    input.value = '';
    return out;
  }

  const WORK = {};

  // ---- Valeria: recibe lo que envías al equipo y lo reparte
  WORK.coordinacion = {
    html() {
      const w = office.work.coordinacion;
      return `<p>Cuéntame qué necesitas y explícame el encargo. Se lo paso a quien corresponde.</p>
        <form id="wForm">
          <label>¿Qué necesitas?<textarea name="text" rows="6" placeholder="Ej.: Pieza informativa para Madero sobre el lavado de tanques del jueves de 8 a. m. a 2 p. m.">${esc(w.text || '')}</textarea></label>
          <label>¿Para quién?<select name="to">
            <option value="">Que Valeria decida</option>
            <option value="piezas" ${w.to === 'piezas' ? 'selected' : ''}>Mateo · Pieza informativa</option>
            <option value="textos" ${w.to === 'textos' ? 'selected' : ''}>Tomás · Revisar un texto</option>
            <option value="peticiones" ${w.to === 'peticiones' ? 'selected' : ''}>Daniela · Derecho de petición</option>
          </select></label>
          <label>Proyecto${projSelect('project', w.project, true)}</label>
          <label>Adjuntos (opcional: PDF, Word, Excel, texto o imagen)<input type="file" name="files" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,image/*"></label>
          ${filesLine(w.files)}
          <button class="btn btn-primary" ${office.status.coordinacion ? 'disabled' : ''}>Enviar al equipo</button>
        </form>`;
    },
    bind(panel) {
      const w = office.work.coordinacion, f = $('#wForm', panel);
      const keep = () => { w.text = f.text.value; w.to = f.to.value; w.project = f.project.value; };
      f.files.onchange = async () => { keep(); w.files = [...(w.files || []), ...(await readFiles(f.files))]; renderPanel(); };
      panel.querySelectorAll('[data-rmfile]').forEach(b => b.onclick = () => { keep(); w.files.splice(Number(b.dataset.rmfile), 1); renderPanel(); });
      f.onsubmit = async e => { e.preventDefault(); keep(); if (!w.text.trim() && !(w.files || []).length) return toast('Cuéntame qué necesitas.'); await routeToTeam(); };
    }
  };
  function guessAgent(text) {
    const n = norm(text);
    if (/derecho de peticion|derechos de peticion|tutela|\bpqr|peticion|queja formal/.test(n)) return 'peticiones';
    if (/pieza|flyer|afiche|banner|grafic|imagen|post|diseñ|disen/.test(n)) return 'piezas';
    return 'textos';
  }
  async function routeToTeam() {
    const w = office.work.coordinacion;
    const text = w.text.trim(), files = w.files || [];
    let dest = w.to, why = '', project = w.project;
    if (!dest) {
      if (hasClaude()) {
        try {
          const r = await work('coordinacion', { verb: 'LEE', text: 'tu encargo', title: 'Repartir encargo', saveAs: null, fn: () => askClaude(`Eres Valeria, coordinadora del equipo de Alianza Grupo Inmobiliario (administración de propiedad horizontal). Decide qué agente atiende el encargo: "piezas" (Mateo: piezas informativas/flyers), "textos" (Tomás: revisar redacción, coherencia, cohesión y ortografía de un texto), "peticiones" (Daniela: responder o revisar derechos de petición, tutelas o PQR). Proyectos válidos: ${projects.join(', ')}. Responde SOLO JSON: {"agente":"piezas|textos|peticiones","proyecto":"uno de la lista o General / AGI","motivo":"una frase para explicarle el encargo al agente"}`, text + (files.length ? `\n\nAdjuntos: ${files.map(f => f.name).join(', ')}` : '')) });
          const j = parseJson(r || '{}'); dest = AGENTS[j.agente] ? j.agente : ''; why = j.motivo || ''; if (!project && projects.includes(j.proyecto)) project = j.proyecto;
        } catch { }
      }
      dest = dest || guessAgent(text + ' ' + files.map(f => f.name).join(' '));
    }
    project = project || matchProject(text);
    logEvent('coordinacion', why || `Te paso: «${text.slice(0, 70)}${text.length > 70 ? '…' : ''}»`, true, dest);
    setBanner(`Entra: ${text.slice(0, 50)}${text.length > 50 ? '…' : ''} → ${AGENTS[dest].name}`);
    flyBetween('entrada', 'coordinacion'); setTimeout(() => flyBetween('coordinacion', dest), 700);
    const texts = files.filter(f => f.text), images = files.filter(f => f.image);
    if (dest === 'piezas') {
      Object.assign(office.work.piezas, { project, info: text, refText: texts.map(f => f.text).join('\n\n').slice(0, 6000), refImages: images, taskId: w.taskId || null });
      office.work.coordinacion = {}; openAgent('piezas', true); runPieza();
    } else if (dest === 'textos') {
      Object.assign(office.work.textos, { text: [text, ...texts.map(f => f.text)].filter(Boolean).join('\n\n'), notes: '', taskId: w.taskId || null });
      office.work.coordinacion = {}; openAgent('textos', true); runTextos();
    } else {
      const p = office.work.peticiones;
      Object.assign(p, { step: 1, analysis: null, answers: {}, result: null, taskId: w.taskId || null });
      p.form = { ...p.form, project, contexto: text, modo: /revis|borrador|delegad/.test(norm(text)) ? 'revision' : 'responder' };
      p.docs = texts.map(f => ({ name: f.name, kind: /peticion|derecho|solicitud/.test(norm(f.name)) || !p.docs.length ? 'peticion' : 'soporte', text: anonymize(f.text, p.form.ocultar || '').text }));
      savePet(); office.work.coordinacion = {}; openAgent('peticiones', true);
      if (p.docs.some(d => d.kind === 'peticion')) runPetAnalysis();
      else toast('Daniela necesita el texto del derecho de petición: pégalo o adjúntalo.');
    }
  }

  // ---- Mateo: piezas informativas
  WORK.piezas = {
    html() {
      const w = office.work.piezas;
      const own = logos.filter(l => l.project === (w.project || projects[0]) || l.project === 'General / AGI');
      return `<p>Pídeme una <b>pieza informativa</b>. Uso siempre los colores y el diseño de Alianza, con los logos originales del proyecto.</p>
        <form id="wForm">
          <label>Proyecto${projSelect('project', w.project)}</label>
          <label>Información de la pieza<textarea name="info" rows="4" placeholder="Ej.: Lavado de tanques el jueves 12 de noviembre de 8:00 a. m. a 2:00 p. m. Almacenar agua.">${esc(w.info || '')}</textarea></label>
          <label>Título (opcional)<input name="titulo" value="${esc(w.titulo || '')}"></label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="asIs" style="width:auto;margin:0" ${w.asIs ? 'checked' : ''}> Usar mi texto tal cual (solo diseñar)</label>
          ${hasOpenAI() ? `<div class="ai-box"><label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" name="useAI" style="width:auto;margin:0" ${w.useAI === false ? '' : 'checked'}> Crear la imagen de fondo con ChatGPT</label>
            <label style="margin:8px 0 0">¿Qué imagen de fondo? (opcional)<input name="escena" value="${esc(w.escena || '')}" placeholder="Ej.: tanque de agua de un conjunto residencial moderno"></label>
            <small class="q-why">ChatGPT solo crea el fondo; textos, colores y logos los pone Mateo con la plantilla de Alianza.</small></div>` : ''}
          <details ${w.refText || (w.refImages || []).length ? 'open' : ''}><summary>Referencia (opcional)</summary>
            <label>Texto de referencia<textarea name="refText" rows="3">${esc(w.refText || '')}</textarea></label>
            <label>Imagen de referencia<input type="file" name="refImg" accept="image/*" multiple></label>
            ${(w.refImages || []).length ? `<ul class="file-list">${w.refImages.map((f, i) => `<li>🖼️ ${esc(f.name)}<button type="button" class="link-btn" data-rmimg="${i}">quitar</button></li>`).join('')}</ul>` : ''}
          </details>
          <h4>Logos de ${esc(w.project || projects[0])}</h4>
          <div class="logo-grid">${own.map(l => `<div class="logo-tile selected"><img src="${l.dataUrl}" alt=""><div>${esc(l.name)}</div></div>`).join('') || '<div class="sub" style="grid-column:1/-1">Sin logos guardados para este proyecto. Súbelos una vez y quedan para siempre.</div>'}</div>
          <label style="margin-top:8px">Subir logo<input type="file" name="logoFile" accept="image/*"></label>
          <button class="btn btn-primary" ${office.status.piezas ? 'disabled' : ''}>${office.status.piezas ? 'Diseñando…' : 'Diseñar pieza informativa'}</button>
        </form>${resultBox('piezas', w.result)}`;
    },
    bind(panel) {
      const w = office.work.piezas, f = $('#wForm', panel);
      const keep = () => { w.project = f.project.value; w.info = f.info.value; w.titulo = f.titulo.value; w.asIs = f.asIs.checked; w.refText = f.refText.value; if (f.useAI) { w.useAI = f.useAI.checked; w.escena = f.escena.value; } };
      f.project.onchange = () => { keep(); renderPanel(); };
      f.refImg.onchange = async () => { keep(); w.refImages = [...(w.refImages || []), ...(await readFiles(f.refImg)).filter(x => x.image)]; renderPanel(); };
      panel.querySelectorAll('[data-rmimg]').forEach(b => b.onclick = () => { keep(); w.refImages.splice(Number(b.dataset.rmimg), 1); renderPanel(); });
      f.logoFile.onchange = () => { const file = f.logoFile.files[0]; if (!file) return; keep(); const rd = new FileReader(); rd.onload = async () => { await addLogo({ name: file.name, project: w.project || projects[0], dataUrl: rd.result }); renderPanel(); }; rd.readAsDataURL(file); };
      f.onsubmit = e => { e.preventDefault(); keep(); if (!w.info.trim() && !w.titulo.trim()) return toast('Escribe la información de la pieza.'); runPieza(); };
      bindResult('piezas', panel, w.result, `pieza-${(w.project || 'alianza').replace(/\W+/g, '-').toLowerCase()}`);
    }
  };
  async function runPieza() {
    const w = office.work.piezas; w.project = w.project || projects[0];
    const title = `Pieza informativa · ${w.titulo || (w.info || '').split('\n')[0].slice(0, 50)}`;
    const out = await work('piezas', { verb: 'DISEÑA', text: (w.titulo || w.info || '').slice(0, 60), project: w.project, title, saveAs: 'image', taskId: w.taskId, fn: async () => {
      let titulo = w.titulo, texto = w.info;
      if (!w.asIs && hasClaude()) {
        office.activity.piezas = { verb: 'ESCRIBE', text: 'el texto de la pieza', t: Date.now() }; refreshOffice();
        const raw = await askClaude(PIEZA_SYSTEM, `Proyecto: ${w.project}\nInformación: ${w.info}\n${w.titulo ? 'Título sugerido: ' + w.titulo + '\n' : ''}${w.refText ? 'Texto de referencia:\n' + w.refText + '\n' : ''}${(w.refImages || []).length ? 'Se adjunta imagen de referencia.' : ''}`, (w.refImages || []).map(x => x.image));
        const j = parseJson(raw); titulo = j.titulo || titulo; texto = j.texto || texto;
        office.activity.piezas = { verb: 'DISEÑA', text: titulo, t: Date.now() }; refreshOffice();
      }
      if (hasOpenAI() && w.useAI !== false) { office.activity.piezas = { verb: 'PINTA', text: 'el fondo con ChatGPT', t: Date.now() }; refreshOffice(); }
      return runDesigner({ project: w.project, titulo: titulo || 'Información', texto: texto || '', useAI: hasOpenAI() && w.useAI !== false, escena: w.escena || '' });
    } });
    if (out) { w.result = { type: 'image', content: out, title, repoId: office.lastRepo?.piezas }; w.taskId = null; renderPanel(); }
  }

  // ---- Tomás: textos
  WORK.textos = {
    html() {
      const w = office.work.textos;
      return `<p>Pega el texto o adjunta el documento. Reviso redacción, coherencia, cohesión y ortografía, y te entrego solo el texto ajustado.</p>
        <form id="wForm">
          <label>Texto<textarea name="text" rows="9">${esc(w.text || '')}</textarea></label>
          <label>Documento (PDF, Word o texto)<input type="file" name="doc" accept=".pdf,.docx,.txt,.md"></label>
          <label>Indicaciones (opcional)<input name="notes" value="${esc(w.notes || '')}" placeholder="Ej.: más formal, para WhatsApp, más corto"></label>
          <button class="btn btn-primary" ${office.status.textos ? 'disabled' : ''}>${office.status.textos ? 'Revisando…' : 'Revisar texto'}</button>
        </form>${resultBox('textos', w.result)}`;
    },
    bind(panel) {
      const w = office.work.textos, f = $('#wForm', panel);
      const keep = () => { w.text = f.text.value; w.notes = f.notes.value; };
      f.doc.onchange = async () => { keep(); const r = await readFiles(f.doc); w.text = [w.text, ...r.filter(x => x.text).map(x => x.text)].filter(Boolean).join('\n\n'); renderPanel(); };
      f.onsubmit = e => { e.preventDefault(); keep(); if (!w.text.trim()) return toast('Pega el texto que quieres revisar.'); runTextos(); };
      bindResult('textos', panel, w.result, 'texto-ajustado');
    }
  };
  async function runTextos() {
    const w = office.work.textos;
    if (!hasClaude()) return toast('Claude aún no está disponible.');
    const title = `Texto ajustado · ${w.text.trim().split('\n')[0].slice(0, 50)}`;
    const out = await work('textos', { verb: 'REVISA', text: w.text.trim().slice(0, 60), project: matchProject(w.text), title, taskId: w.taskId, fn: () => askClaude(TEXTOS_SYSTEM, (w.notes ? `Indicaciones: ${w.notes}\n\n` : '') + 'TEXTO:\n' + w.text.slice(0, 60000)) });
    if (out) { w.result = { type: 'text', content: out.trim(), title, repoId: office.lastRepo?.textos }; w.taskId = null; renderPanel(); }
  }

  // ---- Daniela: derechos de petición (cargar → preguntas → borrador)
  WORK.peticiones = {
    html() {
      const p = office.work.peticiones, f = p.form || {};
      const docs = p.docs || [];
      const byKind = kind => docs.map((d, i) => ({ ...d, i })).filter(d => d.kind === kind);
      const docList = list => list.length ? `<ul class="file-list">${list.map(d => `<li>📎 ${esc(d.name)} · ${(d.text || '').length.toLocaleString('es-CO')} caracteres<button type="button" class="link-btn" data-rmdoc="${d.i}">quitar</button></li>`).join('')}</ul>` : '';
      const imgList = kind => { const l = petImages.map((x, i) => ({ ...x, i })).filter(x => x.kind === kind); return l.length ? `<ul class="file-list">${l.map(x => `<li>🖼️ ${esc(x.name)}<button type="button" class="link-btn" data-rmimg="${x.i}">quitar</button></li>`).join('')}</ul>` : ''; };
      const steps = `<ol class="steps"><li class="${p.step === 1 ? 'on' : ''}">Cargar</li><li class="${p.step === 2 ? 'on' : ''}">Mis preguntas</li><li class="${p.step === 3 ? 'on' : ''}">Borrador</li></ol>`;
      if (p.step === 2 && p.analysis) {
        const a = p.analysis;
        return steps + `<div class="pet-sum"><b>${esc(a.tipo || 'Derecho de petición')}</b>${p.form.radicado ? ` · recibido ${esc(fmtDate(p.form.radicado))}` : ''}${a.vence ? ` · <span class="chip ${businessDaysLeft(a.vence) <= 3 ? 'red' : 'gold'}">vence ${esc(fmtDate(a.vence))} (${businessDaysLeft(a.vence)} días hábiles)</span>` : ''}
          <p>${esc(a.resumen || '')}</p>
          ${(a.puntos || []).length ? `<h4>Lo que solicita</h4><ol>${a.puntos.map(x => `<li>${esc(x.solicitud || x)}</li>`).join('')}</ol>` : ''}
          ${(a.vacios || []).length ? `<h4>Información que falta</h4><ul>${a.vacios.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
          <form id="wForm"><h4>Antes de redactar, respóndeme</h4>
            ${(a.preguntas || []).map((q, i) => `<label>${i + 1}. ${esc(q.pregunta)}${q.motivo ? `<small class="q-why">${esc(q.motivo)}</small>` : ''}<textarea name="q${i}" rows="2" placeholder="Si no lo sabes, déjalo vacío y quedará como [PENDIENTE]">${esc((p.answers || {})['q' + i] || '')}</textarea></label>${micBtn('q' + i)}`).join('') || '<p class="sub">No tengo dudas; puedo generar el borrador.</p>'}
            <label class="voice-box">🎙️ Respóndeme todo de una vez (escríbelo o díctalo)<small class="q-why">Habla con naturalidad: yo identifico qué respuesta va con cada pregunta.</small><textarea name="voz" rows="4">${esc((p.answers || {}).voz || '')}</textarea></label>${micBtn('voz', '🎤 Dictar respuesta')}
            <label>¿Algo más que deba tener en cuenta?<textarea name="extra" rows="2">${esc((p.answers || {}).extra || '')}</textarea></label>
            <h4>Documentos o imágenes adicionales</h4>
            <p class="sub" style="margin-top:0">Agrega lo que te pedí o lo que ayude a responder: presupuestos, actas, capturas, fotos.</p>
            <input type="file" name="fExtra" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,image/*">
            ${docList(byKind('adicional'))}${imgList('adicional')}
            ${petImages.length ? '<div class="notice warn">🖼️ Las imágenes se envían tal cual: tapa nombres, cédulas, firmas y teléfonos antes de subirlas.</div>' : ''}
            ${byKind('adicional').length || petImages.some(i => i.kind === 'adicional') ? '<button type="button" class="btn btn-ghost btn-sm" id="petReanalyze">🔄 Analizar de nuevo con lo que agregué</button>' : ''}
            <div class="toolbar"><button type="button" class="btn btn-ghost" id="petBack">← Volver a los documentos</button><button class="btn btn-primary" ${office.status.peticiones ? 'disabled' : ''}>${office.status.peticiones ? 'Redactando…' : p.form.modo === 'revision' ? 'Revisar el borrador' : 'Generar borrador'}</button></div>
          </form>`;
      }
      if (p.step === 3 && p.result) {
        return steps + resultBox('peticiones', p.result) + `<div class="toolbar"><button class="btn btn-ghost btn-sm" id="petBack2">← Ajustar respuestas</button><button class="btn btn-ghost btn-sm" id="petNew">Nueva petición</button></div>`;
      }
      const hidden = docs.reduce((n, d) => n + (d.hidden || 0), 0);
      return steps + `<form id="wForm">
          <div class="seg seg-sm"><button type="button" class="${f.modo !== 'revision' ? 'active' : ''}" data-modo="responder">Responder petición</button><button type="button" class="${f.modo === 'revision' ? 'active' : ''}" data-modo="revision">Revisar borrador de un delegado</button></div>
          <div class="row"><label>Proyecto${projSelect('project', f.project)}</label><label>Fecha de recibido<span class="date-dual"><input name="radicadoTxt" placeholder="Escríbela: 6/11/2026 o 6 de noviembre" value="${esc(f.radicadoTxt || '')}"><input type="date" name="radicado" value="${esc(f.radicado || '')}" aria-label="Elegir en el calendario"></span>${f.radicado ? `<small class="q-why">→ ${esc(fmtDate(f.radicado))}</small>` : ''}</label></div>
          <label>Derecho de petición (pégalo o adjúntalo)<textarea name="peticion" rows="4" placeholder="Pega aquí el texto de la petición">${esc(f.peticion || '')}</textarea></label>
          <input type="file" name="fPet" accept=".pdf,.docx,.txt,.md,image/*" multiple>${docList(byKind('peticion'))}${imgList('peticion')}
          ${f.modo === 'revision' ? `<label>Borrador del delegado<textarea name="borrador" rows="4">${esc(f.borrador || '')}</textarea></label><input type="file" name="fBor" accept=".pdf,.docx,.txt,.md">${docList(byKind('borrador'))}` : ''}
          <label>Soportes para validar (presupuestos, actas, circulares, contratos, fotos…)<input type="file" name="fSop" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,image/*"></label>${docList(byKind('soporte'))}${imgList('soporte')}
          ${petImages.length ? '<div class="notice warn">🖼️ Las imágenes y los PDF escaneados se envían tal cual: antes de subirlos, tapa nombres, cédulas, firmas y teléfonos.</div>' : ''}
          <label>Contexto (lo que debo saber)<textarea name="contexto" rows="3" placeholder="Ej.: la cuota se calcula con el presupuesto provisional aprobado por la constructora…">${esc(f.contexto || '')}</textarea></label>
          <label>Qué queremos darle a conocer al propietario<textarea name="accion" rows="2" placeholder="Ej.: explicar cómo se calcula la cuota y que no hay lugar a devolución">${esc(f.accion || '')}</textarea></label>
          <label>Nombres u otros datos a ocultar (separados por coma)<input name="ocultar" value="${esc(f.ocultar || '')}" placeholder="Ej.: nombres del propietario, del arrendatario…"></label>
          <div class="notice">🔒 Antes de que yo lo lea, se ocultan correos, teléfonos, documentos de identidad, direcciones y nombres detectados${hidden ? ` (${hidden} datos ocultos hasta ahora)` : ''}. Revisa la vista previa y agrega arriba cualquier nombre que se haya escapado.</div>
          <details><summary>Ver lo que yo recibo</summary><div class="output small">${esc(petPreview().slice(0, 3000)) || 'Aún no hay documentos.'}</div></details>
          <button class="btn btn-primary" ${office.status.peticiones ? 'disabled' : ''}>${office.status.peticiones ? 'Analizando…' : 'Analizar y preguntarme'}</button>
        </form>`;
    },
    bind(panel) {
      const p = office.work.peticiones;
      const back = $('#petBack', panel); if (back) back.onclick = () => { keepAnswers(); p.step = 1; savePet(); renderPanel(); refreshOffice(); };
      const back2 = $('#petBack2', panel); if (back2) back2.onclick = () => { p.step = 2; savePet(); renderPanel(); };
      const nw = $('#petNew', panel); if (nw) nw.onclick = () => { petImages.length = 0; office.work.peticiones = { step: 1, form: { modo: 'responder' }, docs: [] }; savePet(); renderPanel(); refreshOffice(); };
      if (p.step === 3) return bindResult('peticiones', panel, p.result, 'respuesta-derecho-de-peticion');
      const f = $('#wForm', panel);
      function keepAnswers() { if (p.step !== 2 || !f) return; p.answers = Object.fromEntries([...f.querySelectorAll('textarea')].map(t => [t.name, t.value])); savePet(); }
      const addFiles = (input, kind, before) => input && (input.onchange = async () => {
        before(); const r = await readFiles(input);
        r.forEach(x => { if (x.image) petImages.push({ name: x.name, image: x.image, kind }); else if (x.text) { const an = anonymize(x.text, p.form.ocultar || ''); p.docs.push({ name: x.name, kind, text: an.text, hidden: an.count }); } });
        savePet(); renderPanel();
      });
      panel.querySelectorAll('[data-rmimg]').forEach(b => b.onclick = () => { keepAnswers(); petImages.splice(Number(b.dataset.rmimg), 1); renderPanel(); });
      if (p.step === 2) {
        addFiles(f.fExtra, 'adicional', keepAnswers);
        panel.querySelectorAll('[data-rmdoc]').forEach(b => b.onclick = () => { keepAnswers(); p.docs.splice(Number(b.dataset.rmdoc), 1); savePet(); renderPanel(); });
        const ra = $('#petReanalyze', panel); if (ra) ra.onclick = () => { keepAnswers(); runPetAnalysis(true); };
        f.onsubmit = e => { e.preventDefault(); keepAnswers(); runPetDraft(); }; return;
      }
      f.radicadoTxt.onchange = () => { const d = parsePastDate(f.radicadoTxt.value); if (d) { f.radicado.value = d; keep(); renderPanel(); } else if (f.radicadoTxt.value.trim()) toast('No entendí la fecha. Prueba con 6/11/2026 o «6 de noviembre».'); };
      f.radicado.onchange = () => { f.radicadoTxt.value = ''; keep(); renderPanel(); };
      const keep = () => { Object.assign(p.form, { radicadoTxt: f.radicadoTxt.value, project: f.project.value, radicado: f.radicado.value || parsePastDate(f.radicadoTxt.value) || '', peticion: f.peticion.value, contexto: f.contexto.value, accion: f.accion.value, ocultar: f.ocultar.value }); if (f.borrador) p.form.borrador = f.borrador.value; savePet(); };
      panel.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => { keep(); p.form.modo = b.dataset.modo; savePet(); renderPanel(); });
      addFiles(f.fPet, 'peticion', keep); addFiles(f.fBor, 'borrador', keep); addFiles(f.fSop, 'soporte', keep);
      panel.querySelectorAll('[data-rmdoc]').forEach(b => b.onclick = () => { keep(); p.docs.splice(Number(b.dataset.rmdoc), 1); savePet(); renderPanel(); });
      f.ocultar.onchange = () => { keep(); p.docs = p.docs.map(d => { const an = anonymize(d.text, p.form.ocultar || ''); return { ...d, text: an.text, hidden: (d.hidden || 0) + an.count }; }); savePet(); renderPanel(); };
      f.onsubmit = e => { e.preventDefault(); keep(); if (!p.form.peticion.trim() && !p.docs.some(d => d.kind === 'peticion') && !petImages.some(i => i.kind === 'peticion')) return toast('Pega o adjunta el derecho de petición.'); runPetAnalysis(); };
    }
  };
  function petMaterial() {
    const p = office.work.peticiones, f = p.form, hide = f.ocultar || '';
    const pet = [anonymize(f.peticion || '', hide).text, ...p.docs.filter(d => d.kind === 'peticion').map(d => d.text)].filter(x => x.trim()).join('\n\n').slice(0, 25000);
    const bor = [anonymize(f.borrador || '', hide).text, ...p.docs.filter(d => d.kind === 'borrador').map(d => d.text)].filter(x => x.trim()).join('\n\n').slice(0, 20000);
    let budget = 45000;
    const sop = p.docs.filter(d => d.kind === 'soporte' || d.kind === 'adicional').map(d => { const t = d.text.slice(0, Math.min(15000, budget)); budget -= t.length; return t ? `### ${d.kind === 'adicional' ? 'Documento adicional' : 'Soporte'}: ${d.name}\n${t}` : ''; }).filter(Boolean).join('\n\n');
    return { pet, bor, sop, ctx: anonymize(f.contexto || '', hide).text, acc: anonymize(f.accion || '', hide).text };
  }
  const imgNote = () => petImages.length ? `\n\nSE ADJUNTAN ${petImages.length} IMÁGENES (${petImages.map(i => `${i.name}: ${{ peticion: 'petición', soporte: 'soporte', adicional: 'documento adicional', borrador: 'borrador del delegado' }[i.kind] || i.kind}`).join('; ')}). Léelas como parte del material. Nunca transcribas nombres, cédulas, firmas ni otros datos personales que aparezcan en ellas.` : '';
  function petPreview() { const m = petMaterial(); return [m.pet && 'PETICIÓN:\n' + m.pet, m.bor && 'BORRADOR DEL DELEGADO:\n' + m.bor, m.sop].filter(Boolean).join('\n\n'); }
  async function runPetAnalysis(again = false) {
    const p = office.work.peticiones, m = petMaterial();
    const prev = again && p.analysis ? (p.analysis.preguntas || []).map((q, i) => `P: ${q.pregunta}\nR: ${(p.answers['q' + i] || '').trim() || '(sin responder)'}`).join('\n') + ((p.answers.voz || '').trim() ? `\nRespuesta libre (dictada): ${p.answers.voz}` : '') : '';
    if (!hasClaude()) return toast('Claude aún no está disponible.');
    const out = await work('peticiones', { verb: 'ANALIZA', text: 'la petición y los soportes', project: p.form.project, title: 'Análisis de petición', saveAs: null, fn: () => askClaude(PET_ROLE + `
TAREA AHORA: analiza el material y, ANTES de redactar, prepara tus preguntas para la coordinadora. ${p.form.modo === 'revision' ? 'Vas a revisar el borrador de un delegado frente a la petición.' : 'Vas a responder la petición.'}
Pregunta solo lo necesario para responder de fondo cada punto sin inventar (cifras, fechas, decisiones, soportes, postura de la Administración). Máximo 8 preguntas, concretas.
Responde SOLO JSON: {"tipo":"Derecho de petición|Tutela|PQR|Queja|Requerimiento","plazoDias":10|15|30|null,"resumen":"2 o 3 frases","puntos":[{"solicitud":"lo que pide, en una frase"}],"vacios":["información que no está en los documentos"],"preguntas":[{"pregunta":"...","motivo":"por qué la necesito"}]}`,
      `Fecha de recibido: ${p.form.radicado || 'sin dato'}\nProyecto: ${p.form.project || 'sin dato'}\nContexto de la coordinadora: ${m.ctx || 'ninguno'}\nQué queremos dar a conocer: ${m.acc || 'sin dato'}\n\nPETICIÓN:\n${m.pet}\n\n${m.bor ? 'BORRADOR DEL DELEGADO:\n' + m.bor + '\n\n' : ''}${m.sop ? 'SOPORTES:\n' + m.sop : ''}${prev ? '\n\nRESPUESTAS QUE YA DIO LA COORDINADORA (no repitas lo ya respondido):\n' + prev : ''}${imgNote()}`, petImages.map(i => i.image)) });
    if (!out) return;
    try {
      const a = parseJson(out);
      if (a.plazoDias && p.form.radicado) a.vence = addBusinessDays(p.form.radicado, Number(a.plazoDias));
      p.analysis = a; if (!again) p.answers = {}; else p.answers = { voz: p.answers.voz || '', extra: p.answers.extra || '' }; p.step = 2; savePet();
      logEvent('peticiones', `Tengo ${(a.preguntas || []).length} preguntas antes de redactar`, true, 'vos');
    } catch { toast('No pude leer el análisis; intenta de nuevo.'); }
    renderPanel(); refreshOffice();
  }
  async function runPetDraft() {
    const p = office.work.peticiones, m = petMaterial(), a = p.analysis || {};
    const qa = (a.preguntas || []).map((q, i) => `P: ${q.pregunta}\nR: ${(p.answers['q' + i] || '').trim() || '[sin respuesta: marcar como PENDIENTE]'}`).join('\n\n');
    const refs = office.refs.slice(0, 2).map((r, i) => `### Respuesta modelo ${i + 1} (solo como guía de ESTRUCTURA y estilo; no uses su información)\n${r.text.slice(0, 6000)}`).join('\n\n');
    const revision = p.form.modo === 'revision';
    const task = revision ? `TAREA: revisa el borrador del delegado frente a la petición y entrega:
1) VEREDICTO: Listo para enviar / Requiere ajustes / Rehacer.
2) ¿RESPONDE CADA PUNTO?: lista "punto → Sí / No / Parcial" con una frase.
3) OBSERVACIONES: fondo, forma, tono, datos personales, cifras sin soporte, plazos.
4) VERSIÓN CORREGIDA completa siguiendo la estructura.` : `TAREA: redacta el BORRADOR de respuesta siguiendo la estructura. Responde de fondo cada punto, en el mismo orden de la petición. Al final, después de una línea "---", agrega "PENDIENTES POR VALIDAR:" con la lista de vacíos que quedaron marcados (si no hay, escribe "Ninguno").`;
    const title = `${revision ? 'Revisión' : 'Respuesta'} · ${(a.resumen || p.form.contexto || 'derecho de petición').slice(0, 60)}`;
    const out = await work('peticiones', { verb: revision ? 'REVISA' : 'REDACTA', text: revision ? 'el borrador del delegado' : 'la respuesta', project: p.form.project, title, taskId: p.taskId, fn: () => askClaude(PET_ROLE + '\n\n' + PET_STRUCT + '\n\n' + task + '\nResponde solo con el documento, en texto plano.',
      `Fecha de recibido: ${p.form.radicado || '[PENDIENTE]'}\nProyecto / conjunto: ${p.form.project || '[PENDIENTE]'}\nTipo: ${a.tipo || ''}\nContexto de la coordinadora: ${m.ctx || 'ninguno'}\nQué queremos dar a conocer: ${m.acc || 'sin dato'}\n\nRESPUESTAS DE LA COORDINADORA A TUS PREGUNTAS:\n${qa || 'Sin preguntas.'}\n${(p.answers.voz || '').trim() ? '\nRESPUESTA LIBRE DE LA COORDINADORA (puede venir dictada por voz, con errores de transcripción; interprétala y úsala para responder las preguntas que correspondan):\n' + p.answers.voz : ''}${(p.answers.extra || '').trim() ? '\nIndicaciones adicionales: ' + p.answers.extra : ''}\n\nPETICIÓN:\n${m.pet}\n\n${m.bor ? 'BORRADOR DEL DELEGADO:\n' + m.bor + '\n\n' : ''}${m.sop ? 'SOPORTES:\n' + m.sop + '\n\n' : ''}${refs}${imgNote()}`, petImages.map(i => i.image)) });
    if (out) { p.result = { type: 'text', content: out.trim(), title, repoId: office.lastRepo?.peticiones }; p.step = 3; p.taskId = null; savePet(); renderPanel(); refreshOffice(); }
  }
  // Respuestas modelo (solo estructura), anonimizadas
  function refsHtml() {
    return `<h4>Respuestas modelo (solo estructura)</h4>
      <p class="sub">Súbeme hasta 3 respuestas que te gusten. Tomo su estructura y estilo, nunca su información. Se guardan sin datos personales.</p>
      ${office.refs.length ? `<ul class="file-list">${office.refs.map((r, i) => `<li>📄 ${esc(r.name)}<button type="button" class="link-btn" data-rmref="${i}">quitar</button></li>`).join('')}</ul>` : '<p class="sub">Mientras tanto uso la estructura de las respuestas que ya me compartiste.</p>'}
      <input type="file" id="refFile" accept=".pdf,.docx,.txt" multiple>`;
  }
  function saveRefs() { store.set('office.refs', office.refs); if (HOST.db) HOST.db.doc('meta/referencias').set({ items: JSON.parse(JSON.stringify(office.refs)) }).catch(dbFail); }
  function bindRefs(panel) {
    const inp = $('#refFile', panel);
    if (inp) inp.onchange = async () => { const r = await readFiles(inp); r.filter(x => x.text).forEach(x => office.refs.push({ name: x.name, text: anonymize(x.text).text.slice(0, 8000) })); office.refs = office.refs.slice(-3); saveRefs(); renderPanel(); toast('Respuesta modelo guardada.'); };
    panel.querySelectorAll('[data-rmref]').forEach(b => b.onclick = () => { office.refs.splice(Number(b.dataset.rmref), 1); saveRefs(); renderPanel(); });
  }

  // ---- Sofía: resumen de la bandeja y búsqueda de correos
  WORK.bandeja = {
    html() {
      const ib = office.inbox, w = office.work.bandeja;
      const list = (arr, fn) => arr && arr.length ? `<ul class="ib-list">${arr.map(fn).join('')}</ul>` : '';
      const link = x => x.url ? ` <a target="_blank" rel="noopener" href="${esc(x.url)}">Abrir</a>` : '';
      return `<form id="findForm" class="find-mini"><input name="q" value="${esc(w.query || '')}" placeholder="Busca un correo: quién lo envió, tema, fecha aproximada…" aria-label="Buscar un correo"><button class="btn btn-primary btn-sm" ${office.status.bandeja ? 'disabled' : ''}>Buscar</button></form>
        ${w.found ? `<div class="found">${w.found.length ? w.found.map(r => `<div class="found-row"><b>${esc(r.subject)}</b><small>${esc(r.from)} · ${esc(r.date)}</small><div class="toolbar"><button class="btn btn-ghost btn-sm" data-copy="${esc(r.subject)}">Copiar asunto</button>${r.url ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(r.url)}">Abrir en Gmail</a>` : ''}</div></div>`).join('') : '<p class="sub">No encontré correos con esa descripción. Prueba con otra palabra o un remitente.</p>'}</div>` : ''}
        <div class="toolbar" style="margin-top:12px"><button class="btn btn-gold btn-sm" id="ibNow" ${office.status.bandeja ? 'disabled' : ''}>${office.status.bandeja ? 'Leyendo…' : ib ? 'Actualizar resumen' : 'Resumir mis no leídos'}</button>${ib ? `<span class="sub" style="margin:0">${ib.total || 0} sin leer · ${esc(ago(ib.at))}</span>` : ''}<button class="btn btn-ghost btn-sm" id="goFolders">Ver carpetas</button></div>
        ${ib ? `<p class="ib-sum">${esc(ib.resumen || '')}</p>
          ${(ib.grupos || []).length ? `<div class="ib-chips">${ib.grupos.map(g => `<span class="chip">${esc(g.tema)} · <b>${g.cantidad}</b></span>`).join('')}</div>` : ''}
          ${(ib.derechos || []).length ? `<h4>Derechos de petición (${ib.derechos.length})</h4>${list(ib.derechos, d => `<li><b>${esc(d.asunto)}</b><small>${esc(d.proyecto || '')} · recibido ${esc(fmtDate(d.fecha))}${d.vence ? ` · <span class="${businessDaysLeft(d.vence) <= 3 ? 'red-t' : ''}">vence ${esc(fmtDate(d.vence))}</span>` : ''}</small>${link(d)}</li>`)}` : ''}
          ${(ib.citaciones || []).length ? `<h4>Citaciones y reuniones</h4>${list(ib.citaciones, (c, i) => `<li><b>${esc(c.asunto)}</b><small>${c.fecha ? esc(fmtDate(c.fecha)) : 'sin fecha'}${c.hora ? ' · ' + esc(c.hora) : ''}</small>${link(c)} <button type="button" class="link-btn" data-cit="${i}">+ Tarea</button></li>`)}` : ''}
          ${(ib.pendientes || []).length ? `<h4>Pendientes</h4>${list(ib.pendientes, x => `<li><b>${esc(x.asunto)}</b><small>${esc(x.accion || '')}</small>${link(x)}</li>`)}` : ''}` : '<p class="sub">Leo tus correos no leídos (solo lectura) y te digo cuántos derechos de petición hay, sus fechas, las citaciones y lo pendiente.</p>'}`;
    },
    bind(panel) {
      const f = $('#findForm', panel); f.onsubmit = e => { e.preventDefault(); const q = f.q.value.trim(); if (q) findEmail(q); };
      $('#ibNow', panel).onclick = () => runInboxSummary();
      $('#goFolders', panel).onclick = () => { setView('correo'); if (!gmail.token) connectGmail(); };
      panel.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Asunto copiado.'), () => toast('Selecciona el asunto y cópialo.')));
      panel.querySelectorAll('[data-cit]').forEach(b => b.onclick = () => {
        const c = office.inbox.citaciones[Number(b.dataset.cit)];
        tasks.push({ id: uid(), created: Date.now(), status: 'todo', title: c.asunto, project: matchProject(c.asunto + ' ' + (c.proyecto || '')), priority: 'media', due: c.fecha || '', time: c.hora || '', remind: c.fecha ? '1440' : '', notes: c.url ? 'Correo: ' + c.url : '' });
        saveTasks(); b.textContent = '✓ En Tareas'; b.disabled = true;
      });
    }
  };
  function threadRows(threads) {
    return threads.map(th => {
      const ms = th.messages || [], last = ms[ms.length - 1] || {}, first = ms[0] || {};
      const nm = m => ((m.addressDisplayNames || []).find(x => x.emailAddress === m.sender) || {}).displayName || m.sender || '';
      return { id: th.id, subject: last.subject || first.subject || '(sin asunto)', from: nm(last), date: last.date ? new Date(last.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '', day: ymd(last.date), snippet: decodeEntities(last.snippet || '').slice(0, 200), url: th.viewUrl || last.viewUrl || '' };
    });
  }
  async function runInboxSummary(focus = true) {
    if (!HOST.mcp) return toast(HOST_FRAME ? 'Gmail se está conectando; intenta en un momento.' : 'El resumen de la bandeja funciona en la versión publicada en claude.ai.');
    if (!hasClaude()) return toast('Claude aún no está disponible.');
    await work('bandeja', { verb: 'LEE', text: 'tus correos no leídos', title: 'Resumen de la bandeja', saveAs: null, focus, fn: async () => {
      let threads = [], pageToken;
      for (let i = 0; i < 2; i++) {
        const r = await HOST.mcp.callTool(GMAIL, 'search_threads', { query: 'is:unread in:inbox', pageSize: 50, view: 'THREAD_VIEW_SUMMARY', ...(pageToken ? { pageToken } : {}) });
        threads = threads.concat((r.payload && r.payload.threads) || []); pageToken = r.payload && r.payload.nextPageToken; if (!pageToken) break;
      }
      const rows = threadRows(threads);
      if (!rows.length) { office.inbox = { at: Date.now(), total: 0, resumen: 'No tienes correos sin leer en la bandeja de entrada.', grupos: [], derechos: [], citaciones: [], pendientes: [] }; return ''; }
      const raw = await askClaude(`Eres Sofía, de la Coordinación de Proyectos de Alianza Grupo Inmobiliario (administración de propiedad horizontal en Colombia). Recibes los correos NO LEÍDOS de la bandeja (asunto, remitente, fecha y fragmento). Hoy es ${todayStr()}. Proyectos: ${projects.join(', ')}.
Haz un resumen breve para la coordinadora. Responde SOLO JSON:
{"resumen":"2 a 4 frases: cuántos correos, qué temas predominan y qué es lo más urgente","grupos":[{"tema":"Derechos de petición|Citaciones y reuniones|Pendientes de respuesta|Informes y contabilidad|Obras y mantenimiento|Informativos|Otros","cantidad":n}],"derechos":[{"id":"id del hilo","asunto":"...","fecha":"YYYY-MM-DD (fecha del correo)","proyecto":"..."}],"citaciones":[{"id":"...","asunto":"...","fecha":"YYYY-MM-DD del evento o null","hora":"HH:MM o null"}],"pendientes":[{"id":"...","asunto":"...","accion":"qué hay que hacer, una frase"}]}
Incluye en "derechos" solo derechos de petición, tutelas o PQR. En "pendientes", máximo 8, los que requieren acción de la coordinadora. No inventes datos.`, JSON.stringify(rows.map(({ url, day, ...x }) => x)));
      const j = parseJson(raw), byId = Object.fromEntries(rows.map(r => [r.id, r]));
      const withUrl = arr => (arr || []).filter(x => byId[x.id]).map(x => ({ ...x, url: byId[x.id].url }));
      const derechos = withUrl(j.derechos).map(d => ({ ...d, fecha: d.fecha || byId[d.id].day, vence: addBusinessDays(d.fecha || byId[d.id].day, 15) }));
      office.inbox = { at: Date.now(), total: rows.length, resumen: j.resumen || '', grupos: j.grupos || [], derechos, citaciones: withUrl(j.citaciones), pendientes: withUrl(j.pendientes) };
      return '';
    } });
    if (office.inbox) {
      store.set('office.inbox', office.inbox); store.set('scanOk', true);
      if (HOST.db) HOST.db.doc('scans/bandeja').set(JSON.parse(JSON.stringify(office.inbox))).catch(dbFail);
      office.flash.bandeja = { title: `${office.inbox.total} sin leer`, sub: `${(office.inbox.derechos || []).length} derechos de petición`, t: Date.now() };
    }
    refreshOffice(); if (office.open === 'bandeja') renderPanel();
  }
  async function findEmail(q) {
    if (!HOST.mcp) return toast(HOST_FRAME ? 'Gmail se está conectando; intenta en un momento.' : 'La búsqueda de correos funciona en la versión publicada en claude.ai.');
    const w = office.work.bandeja; w.query = q; w.found = null;
    await work('bandeja', { verb: 'BUSCA', text: q.slice(0, 50), title: 'Buscar correo', saveAs: null, fn: async () => {
      let queries = [q];
      if (hasClaude()) {
        try { const j = parseJson(await askClaude(`Convierte la descripción de un correo en búsquedas de Gmail. Hoy es ${todayStr()}. Usa operadores (from:, subject:, after:YYYY/MM/DD, before:, has:attachment) solo si la descripción los sugiere; prefiere palabras clave sin comillas. Responde SOLO JSON: {"queries":["búsqueda precisa","búsqueda más amplia","búsqueda aún más amplia"]}`, q)); if (Array.isArray(j.queries) && j.queries.length) queries = j.queries.slice(0, 3); } catch { }
      }
      for (const query of queries) {
        const r = await HOST.mcp.callTool(GMAIL, 'search_threads', { query, pageSize: 8, view: 'THREAD_VIEW_SUMMARY' });
        const rows = threadRows((r.payload && r.payload.threads) || []);
        if (rows.length) { w.found = rows; return ''; }
      }
      w.found = []; return '';
    } });
    if (office.open === 'bandeja') renderPanel();
  }
  function autoInbox() {
    if (office.autoRunning || !HOST.mcp || !hasClaude() || !store.get('scanOk', false)) return;
    if (office.inbox && Date.now() - office.inbox.at < 2 * 3600e3) return;
    office.autoRunning = true; runInboxSummary(false).finally(() => { office.autoRunning = false; });
  }

  views.agencia.after = () => { loadPending().then(() => { renderOffice(); renderPanel(); }); renderOffice(); renderPanel(); autoInbox(); };

  // ---------------------------------------------------------------- Tareas (tus pendientes; nadie trabaja solo aquí)
  const MESES = { ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12 };
  const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  // Lee fecha y hora escritas en la tarea ("mañana a las 3 pm", "viernes", "15 de nov", "15/11").
  function parseWhen(text) {
    const n = norm(text), today = todayStr();
    let due = '', time = '';
    if (/\bpasado manana\b/.test(n)) due = addDays(today, 2);
    else if (/\bmanana\b/.test(n)) due = addDays(today, 1);
    else if (/\bhoy\b/.test(n)) due = today;
    let m = n.match(/\b(\d{1,2})\s*(?:de\s+)?(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sept?(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\b/);
    if (!due && m) { const y = Number(today.slice(0, 4)); let d = `${y}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (d < today) d = `${y + 1}${d.slice(4)}`; due = d; }
    m = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (!due && m) { const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4)); due = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = n.match(/\b(?:el\s+|este\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
    if (!due && m) { const d = new Date(today + 'T12:00:00'); let add = (DIAS[m[1]] - d.getDay() + 7) % 7; if (add === 0) add = 7; due = addDays(today, add); }
    m = n.match(/\b(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm)\b/) || n.match(/\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?\b/) || n.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m) { let h = Number(m[1]); const mi = m[2] || '00'; const ap = (m[3] || '').replace(/[\s.]/g, ''); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; if (!ap && h < 7) h += 12; if (h < 24) time = `${String(h).padStart(2, '0')}:${mi}`; }
    return { due, time };
  }

  ui.tareas = { mode: 'lista', project: '', q: '', showDone: false };
  views.tareas = () => {
    const today = todayStr(), week = addDays(today, 7), t = ui.tareas;
    const q = norm(t.q);
    const mine = tasks.filter(x => (!t.project || x.project === t.project) && (!q || norm(x.title + ' ' + (x.notes || '')).includes(q)));
    const open = mine.filter(x => x.status !== 'done');
    const sortD = (a, b) => ((a.due || '9') + (a.time || '')).localeCompare((b.due || '9') + (b.time || ''));
    const sec = (title, list, cls = '') => list.length ? `<h2 class="${cls}">${title} <span class="count">${list.length}</span></h2>${list.sort(sortD).map(taskRow).join('')}` : '';
    let body;
    if (t.mode === 'tablero') {
      const cols = [['todo', 'Por hacer'], ['doing', 'En curso'], ['done', 'Hecho']];
      body = `<div class="board three">${cols.map(([k, l]) => { const items = mine.filter(x => (k === 'todo' ? ['todo', 'review'].includes(x.status) : x.status === k)); return `<div class="column" data-status="${k}"><h3>${l}<span>${items.length}</span></h3>${items.sort(sortD).map(taskRow).join('')}</div>`; }).join('')}</div>`;
    } else {
      body = (sec('⚠️ Vencidas', open.filter(x => x.due && x.due < today), 'red-t') + sec('Hoy', open.filter(x => x.due === today)) +
        sec('Próximos 7 días', open.filter(x => x.due > today && x.due <= week)) + sec('Más adelante', open.filter(x => x.due > week)) +
        sec('Sin fecha', open.filter(x => !x.due))) || '<div class="empty">No tienes tareas pendientes. Escribe arriba la primera.</div>';
      const done = mine.filter(x => x.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
      if (done.length) body += `<button class="btn btn-ghost btn-sm" id="tgDone" style="margin-top:12px">${t.showDone ? 'Ocultar' : 'Ver'} hechas (${done.length})</button>${t.showDone ? done.slice(0, 40).map(taskRow).join('') : ''}`;
    }
    return `<h1>Tareas</h1>
      <p class="sub">Lo que vas recordando, con fecha y aviso. Aquí ningún agente trabaja solo: si necesitas ayuda, usa «Enviar al equipo» en la tarea.</p>
      <form id="quickTask" class="quick">
        <div class="cmd-main"><span class="cmd-ico">＋</span><textarea name="text" rows="1" placeholder="Escribe una tarea… (ej.: llamar a la constructora el viernes a las 10 am)" aria-label="Nueva tarea"></textarea><button class="btn btn-gold">Agregar</button></div>
        <div class="quick-fields">
          <label>Proyecto<select name="project"><option value="">Detectar</option>${projects.map(p => `<option>${esc(p)}</option>`).join('')}</select></label>
          <label>Fecha<input type="date" name="due"></label>
          <label>Hora<input type="time" name="time"></label>
          <label>Aviso<select name="remind"><option value="auto">Automático</option><option value="">Sin aviso</option><option value="0">A la hora</option><option value="30">30 min antes</option><option value="120">2 horas antes</option><option value="1440">1 día antes</option></select></label>
          <label>Prioridad<select name="priority"><option value="media">Media</option><option value="alta">Alta</option><option value="baja">Baja</option></select></label>
        </div>
      </form>
      <div class="toolbar tareas-bar">
        <div class="seg seg-sm"><button class="${t.mode === 'lista' ? 'active' : ''}" data-mode="lista">Lista</button><button class="${t.mode === 'tablero' ? 'active' : ''}" data-mode="tablero">Tablero</button></div>
        <select id="tProject"><option value="">Todos los proyectos</option>${projects.map(p => `<option ${p === t.project ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <input id="tQ" placeholder="Buscar…" value="${esc(t.q)}">
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="btnIcsAll">📅 Exportar al calendario</button>
        ${!HOST_FRAME && 'Notification' in window && Notification.permission !== 'granted' ? '<button class="btn btn-ghost btn-sm" id="btnNotif">🔔 Activar avisos</button>' : ''}
      </div>
      ${body}`;
  };
  views.tareas.after = root => {
    bindTaskEvents(root);
    const f = $('#quickTask', root), ta = f.text;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; };
    ta.oninput = () => { grow(); const w = parseWhen(ta.value); if (w.due && !f.due.dataset.touched) f.due.value = w.due; if (w.time && !f.time.dataset.touched) f.time.value = w.time; };
    f.due.oninput = () => f.due.dataset.touched = '1'; f.time.oninput = () => f.time.dataset.touched = '1';
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
    f.onsubmit = e => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text) return ta.focus();
      const w = parseWhen(text), due = f.due.value || w.due, time = f.time.value || w.time;
      const remind = f.remind.value === 'auto' ? (due ? (time ? '30' : '0') : '') : f.remind.value;
      tasks.push({ id: uid(), created: Date.now(), status: 'todo', title: text.split('\n')[0].slice(0, 160), notes: text.includes('\n') ? text : '', project: f.project.value || matchProject(text), priority: f.priority.value, due, time, remind });
      saveTasks(); toast(due ? `Tarea guardada para ${fmtDate(due)}${time ? ' a las ' + time : ''}${remind !== '' ? ' con aviso' : ''}.` : 'Tarea guardada.');
      renderView(); setTimeout(() => { const t2 = $('#quickTask textarea'); if (t2) t2.focus(); }, 0);
    };
    root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { ui.tareas.mode = b.dataset.mode; renderView(); });
    $('#tProject', root).onchange = e => { ui.tareas.project = e.target.value; renderView(); };
    const q = $('#tQ', root); q.oninput = e => { ui.tareas.q = e.target.value; renderView(); const n = $('#tQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
    const td = $('#tgDone', root); if (td) td.onclick = () => { ui.tareas.showDone = !ui.tareas.showDone; renderView(); };
    $('#btnIcsAll', root).onclick = () => { const list = tasks.filter(x => x.status !== 'done' && x.due); if (!list.length) return toast('No hay tareas con fecha.'); downloadIcs(list, 'tareas-alianza.ics'); };
    const bn = $('#btnNotif', root); if (bn) bn.onclick = async () => { await Notification.requestPermission(); renderView(); };
    root.querySelectorAll('.task').forEach(el => el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', el.dataset.id)));
    root.querySelectorAll('.column').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => { e.preventDefault(); const x = tasks.find(y => y.id === e.dataTransfer.getData('text/plain')); if (x) { x.status = col.dataset.status; if (x.status === 'done') x.doneAt = Date.now(); saveTasks(); renderView(); } });
    });
    root.querySelectorAll('[data-team]').forEach(b => b.onclick = e => { e.stopPropagation(); sendTaskToTeam(b.dataset.team); });
  };
  function sendTaskToTeam(id) {
    const t = tasks.find(x => x.id === id); if (!t) return;
    office.work.coordinacion = { text: `${t.title}${t.notes ? '\n' + t.notes : ''}\n\n`, project: t.project, taskId: t.id };
    if (t.status === 'todo') { t.status = 'doing'; saveTasks(); }
    setView('agencia'); openAgent('coordinacion', true);
    setTimeout(() => { const ta = $('#panel textarea'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 50);
    toast('Explícale a Valeria qué necesitas y envíalo.');
  }

  // Compone la pieza: fondo (IA o plantilla) + logos originales sin alterar + textos.
  async function runDesigner(fd) {
    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo cargar una imagen.')); i.src = src; });

    ctx.fillStyle = BRAND.blanco; ctx.fillRect(0, 0, W, H);
    const imgH = 560;
    if (fd.useAI) {
      const prompt = `Fotografía/ilustración profesional para comunicado de administración residencial en Colombia: ${fd.escena || fd.titulo}. Estilo limpio, elegante y luminoso, con tonos azul institucional (#1A3867), dorado (#95762F) y blanco. SIN texto, SIN letras, SIN logotipos, SIN marcas de agua.`;
      const bg = await loadImg(await askOpenAIImage(prompt));
      const s = Math.max(W / bg.width, imgH / bg.height);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, imgH); ctx.clip();
      ctx.drawImage(bg, (W - bg.width * s) / 2, (imgH - bg.height * s) / 2, bg.width * s, bg.height * s);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, 0, W, imgH);
      g.addColorStop(0, BRAND.azul); g.addColorStop(1, '#2B5297');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, imgH);
    }
    ctx.fillStyle = BRAND.dorado; ctx.fillRect(0, imgH, W, 10);

    // Título
    ctx.fillStyle = BRAND.azul; ctx.font = '700 58px Inter, sans-serif';
    let y = wrap(ctx, (fd.titulo || '').toUpperCase(), 80, imgH + 100, W - 160, 66);
    ctx.fillStyle = BRAND.dorado; ctx.fillRect(80, y - 30, 120, 6);
    // Cuerpo
    ctx.fillStyle = '#14213D'; ctx.font = '400 34px Inter, sans-serif';
    y = (fd.texto || '').split('\n').reduce((yy, line) => wrap(ctx, line, 80, yy + 10, W - 160, 46), y + 30);

    // Franja inferior con logos originales (proporción intacta, sin filtros)
    const barH = 170;
    ctx.fillStyle = BRAND.azul; ctx.fillRect(0, H - barH, W, barH);
    ctx.fillStyle = BRAND.dorado; ctx.fillRect(0, H - barH, W, 6);
    const chosen = logos.filter(l => l.project === fd.project || l.project === 'General / AGI').slice(0, 3);
    let x = 70;
    for (const l of chosen) {
      const img = await loadImg(l.dataUrl);
      const maxH = 110, maxW = 300, s = Math.min(maxH / img.height, maxW / img.width);
      const w = img.width * s, h = img.height * s;
      // Fondo blanco detrás para respetar los colores originales del logo
      ctx.fillStyle = BRAND.blanco; roundRect(ctx, x - 12, H - barH / 2 - h / 2 - 12 + 3, w + 24, h + 24, 14); ctx.fill();
      ctx.drawImage(img, x, H - barH / 2 - h / 2 + 3, w, h);
      x += w + 60;
    }
    ctx.fillStyle = BRAND.blanco; ctx.font = '500 26px Inter, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('Administración', W - 70, H - barH / 2 - 4);
    ctx.fillStyle = '#E9D9AE'; ctx.fillText('Alianza Grupo Inmobiliario', W - 70, H - barH / 2 + 32);
    ctx.textAlign = 'left';

    if (y > H - barH - 20) toast('El texto es largo: considera acortarlo para lectura en celular.');
    if (!chosen.length) toast('La pieza no tiene logos: agrégalos desde Correo o súbelos.');
    return canvas.toDataURL('image/png');
  }

  function wrap(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(/\s+/); let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = test;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function renderCmdbar() { const b = $('#cmdbar'); if (b) b.hidden = true; }

  // ---------------------------------------------------------------- Vista Repositorio
  ui.repo = { tab: 'entregables', type: '', agent: '', project: '', q: '' };
  views.repo = () => `
    <h1>Repositorio</h1>
    <p class="sub">Todo lo que ha hecho el equipo: comunicados, respuestas, borradores jurídicos y piezas gráficas, más el historial de actividades realizadas.</p>
    <div class="gold-line"></div>
    <div class="seg">
      <button class="${ui.repo.tab === 'entregables' ? 'active' : ''}" data-rtab="entregables">Entregables</button>
      <button class="${ui.repo.tab === 'hechas' ? 'active' : ''}" data-rtab="hechas">Actividades realizadas</button>
    </div>
    <div class="toolbar">
      ${ui.repo.tab === 'entregables' ? `<select id="rType"><option value="">Todo</option><option value="text" ${ui.repo.type === 'text' ? 'selected' : ''}>Textos</option><option value="image" ${ui.repo.type === 'image' ? 'selected' : ''}>Piezas gráficas</option></select>
      <select id="rAgent"><option value="">Todos los agentes</option>${Object.entries(AGENTS).map(([k, a]) => `<option value="${k}" ${ui.repo.agent === k ? 'selected' : ''}>${esc(a.name)} · ${esc(a.role)}</option>`).join('')}</select>` : ''}
      <select id="rProject"><option value="">Todos los proyectos</option>${projects.map(p => `<option ${p === ui.repo.project ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <input id="rQ" placeholder="Buscar…" value="${esc(ui.repo.q)}">
    </div>
    <div id="repoList"><div class="empty">Cargando…</div></div>`;

  views.repo.after = async root => {
    root.querySelectorAll('[data-rtab]').forEach(b => b.onclick = () => { ui.repo.tab = b.dataset.rtab; render(); });
    const bindF = (id, key) => { const el = $(id, root); if (el) el[el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = e => { ui.repo[key] = e.target.value; paint(); }; };
    bindF('#rType', 'type'); bindF('#rAgent', 'agent'); bindF('#rProject', 'project'); bindF('#rQ', 'q');
    let items = [];
    if (ui.repo.tab === 'entregables') items = await repo.all().catch(() => []);
    function paint() {
      const q = norm(ui.repo.q), list = $('#repoList', root);
      if (ui.repo.tab === 'hechas') {
        const done = tasks.filter(t => t.status === 'done' && (!ui.repo.project || t.project === ui.repo.project) && (!q || norm(t.title + t.notes).includes(q)))
          .sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
        list.innerHTML = done.length ? done.map(t => `<div class="repo-row" data-task="${esc(t.id)}">
            <div><b>${esc(t.title)}</b><small>${esc(t.project)}${t.agent ? ' · ' + esc(AGENTS[t.agent]?.name || '') : ''} · terminada ${t.doneAt ? esc(new Date(t.doneAt).toLocaleDateString('es-CO', { timeZone: TZ })) : ''}</small></div>
            <span class="chip green">Hecha</span></div>`).join('') : '<div class="empty">Aún no hay actividades terminadas.</div>';
        list.querySelectorAll('[data-task]').forEach(el => el.onclick = () => openTask(el.dataset.task));
        return;
      }
      const f = items.filter(i => (!ui.repo.type || i.type === ui.repo.type) && (!ui.repo.agent || i.agent === ui.repo.agent) &&
        (!ui.repo.project || i.project === ui.repo.project) && (!q || norm(i.title + ' ' + (i.type === 'text' ? i.content : '')).includes(q)));
      list.innerHTML = f.length ? `<div class="repo-grid">${f.map(i => `
        <article class="repo-card" data-item="${esc(i.id)}">
          ${i.type === 'image' ? `<img src="${i.content}" alt="">` : `<pre>${esc(i.content.slice(0, 260))}</pre>`}
          <div class="rc-body"><b>${esc(i.title)}</b>
            <small>${esc(AGENTS[i.agent]?.name || '')} · ${esc(i.project)} · ${esc(new Date(i.date).toLocaleDateString('es-CO', { timeZone: TZ }))}</small>
            <span class="chip ${i.status === 'aprobado' ? 'green' : 'gold'}">${i.status === 'aprobado' ? 'Aprobado' : 'Borrador'}</span>
          </div>
        </article>`).join('')}</div>` : '<div class="empty">No hay entregables con esos filtros. Cada misión que completa un agente se guarda aquí automáticamente.</div>';
      list.querySelectorAll('[data-item]').forEach(el => el.onclick = () => openRepoItem(items.find(i => i.id === el.dataset.item), () => views.repo.after(root)));
    }
    paint();
  };

  function openRepoItem(item, onChange) {
    const d = $('#viewDialog');
    d.innerHTML = `<div class="vd">
      <header><div><b>${esc(item.title)}</b><small>${esc(AGENTS[item.agent]?.name || '')} · ${esc(item.project)} · ${esc(new Date(item.date).toLocaleString('es-CO', { timeZone: TZ }))}</small></div>
        <button class="p-close" id="vdClose">×</button></header>
      <div class="vd-body">${item.type === 'image' ? `<img src="${item.content}" alt="">` : `<div class="output">${esc(item.content)}</div>`}</div>
      <div class="toolbar">
        ${item.type === 'image' ? '<button class="btn btn-gold btn-sm" id="vdDown">⬇️ Descargar PNG</button>' : '<button class="btn btn-ghost btn-sm" id="vdCopy">Copiar</button><button class="btn btn-ghost btn-sm" id="vdDown">⬇️ Descargar .txt</button>'}
        ${item.status !== 'aprobado' ? '<button class="btn btn-primary btn-sm" id="vdOk">✓ Marcar aprobado</button>' : ''}
        <span class="spacer"></span><button class="btn btn-ghost btn-sm danger" id="vdDel">Eliminar</button>
      </div></div>`;
    d.showModal();
    $('#vdClose', d).onclick = () => d.close();
    const c = $('#vdCopy', d); if (c) c.onclick = () => navigator.clipboard.writeText(item.content).then(() => toast('Copiado.'));
    $('#vdDown', d).onclick = () => {
      const slug = (item.project + '-' + item.title).replace(/\W+/g, '-').toLowerCase().slice(0, 60);
      if (item.type !== 'image') return saveFile(slug + '.txt', item.content);
      if (item.content.startsWith('data:')) return saveFile(slug + '.png', dataUrlToBlob(item.content));
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); c.toBlob(b => saveFile(slug + '.png', b), 'image/png'); };
      img.onerror = () => toast('No se pudo preparar la imagen.'); img.src = item.content;
    };
    const ok = $('#vdOk', d); if (ok) ok.onclick = async () => { await approveItem(item); d.close(); onChange?.(); };
    $('#vdDel', d).onclick = e => confirmClick(e.currentTarget, '¿Seguro? Toca otra vez', async () => { await repo.del(item.id); d.close(); onChange?.(); });
  }

  async function approveItem(item) {
    await repo.update(item.id, { status: 'aprobado', approvedAt: Date.now() });
    const t = tasks.find(x => x.id === item.taskId);
    if (t && t.status !== 'done') { t.status = 'done'; t.doneAt = Date.now(); saveTasks(); }
    office.pending = office.pending.filter(i => i.id !== item.id);
    logEvent(item.agent, `Aprobaste «${item.title}»`, true, 'vos');
    toast(t ? 'Aprobado: queda en Entregables y la tarea pasa a Hecho.' : 'Aprobado: queda en Entregables.');
  }

  // ---------------------------------------------------------------- Ajustes
  views.ajustes = () => `
    <h1>Ajustes</h1><div class="gold-line"></div>
    <form class="card workspace" id="setForm">
      <h2 style="margin-top:0">Delegado</h2>
      <label>Tu nombre (para firmas y trazabilidad)<input name="delegate" value="${esc(settings.delegate)}"></label>
      ${HOST_FRAME ? `<h2>Conexiones</h2>
      <div class="notice">Claude: ${HOST.sample ? '<b>conectado</b> con tu cuenta de claude.ai (sin clave de API).' : 'conectando…'}<br>
        Gmail: conector de claude.ai, <b>solo lectura</b>.<br>
        Datos: ${HOST.db ? '<b>sincronizados</b> entre tus dispositivos.' : 'solo en este navegador.'}<br>
        ChatGPT: disponible en la versión instalada con tu clave de OpenAI.</div>
      <div hidden>` : ''}
      <h2>Claude · redacción</h2>
      <label>Clave API de Anthropic<input name="claudeKey" type="password" autocomplete="off" value="${esc(settings.claudeKey)}" placeholder="sk-ant-…"></label>
      <label>Modelo<select name="claudeModel">
        ${['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'].map(m => `<option ${m === settings.claudeModel ? 'selected' : ''}>${m}</option>`).join('')}
      </select></label>
      <h2>ChatGPT · piezas gráficas</h2>
      <label>Clave API de OpenAI<input name="openaiKey" type="password" autocomplete="off" value="${esc(settings.openaiKey)}" placeholder="sk-…"></label>
      <label>Modelo de imagen<input name="openaiModel" value="${esc(settings.openaiModel)}"></label>
      <h2>Gmail (solo lectura)</h2>
      <label>Google OAuth Client ID<input name="googleClientId" value="${esc(settings.googleClientId)}" placeholder="xxxx.apps.googleusercontent.com"></label>
      <div class="notice">Las claves se guardan solo en este navegador. Úsala en un equipo personal y no compartas el enlace con las claves cargadas.</div>
      ${HOST_FRAME ? '</div>' : ''}
      <button class="btn btn-primary">Guardar ajustes</button>
    </form>
    <div class="card workspace" style="margin-top:12px">
      <h2 style="margin-top:0">Proyectos</h2>
      <label>Uno por línea<textarea id="projText" rows="8">${esc(projects.join('\n'))}</textarea></label>
      <button class="btn btn-ghost" id="btnProj">Guardar proyectos</button>
      <h2>Logos guardados (${logos.length})</h2>
      <div class="logo-grid">${logos.map((l, i) => `<div class="logo-tile"><img src="${l.dataUrl}" alt=""><div>${esc(l.project)}</div><button class="btn btn-ghost btn-sm danger" data-dellogo="${i}">Quitar</button></div>`).join('') || '<div class="sub" style="grid-column:1/-1">Ninguno.</div>'}</div>
      <h2>Respaldo</h2>
      <div class="toolbar">
        <button class="btn btn-ghost btn-sm" id="btnExport">Exportar respaldo completo (JSON)</button>
        <label class="btn btn-ghost btn-sm" style="margin:0">Importar<input type="file" id="fileImport" accept="application/json" hidden></label>
      </div>
    </div>`;
  views.ajustes.after = root => {
    $('#setForm', root).onsubmit = e => {
      e.preventDefault();
      settings = { ...settings, ...Object.fromEntries(new FormData(e.target)) };
      for (const k of ['claudeKey', 'openaiKey', 'googleClientId', 'delegate']) settings[k] = settings[k].trim();
      store.set('settings', settings); toast('Ajustes guardados.');
    };
    $('#btnProj', root).onclick = () => {
      projects = $('#projText', root).value.split('\n').map(s => s.trim()).filter(Boolean);
      store.set('projects', projects); if (HOST.db) HOST.db.doc('meta/config').set({ projects }).catch(dbFail); toast('Proyectos guardados.'); fillProjectSelect();
    };
    root.querySelectorAll('[data-dellogo]').forEach(b => b.onclick = () => {
      const l = logos[Number(b.dataset.dellogo)];
      if (HOST.db && l.id) { HOST.db.doc('logos/' + l.id).delete().catch(dbFail); if (l.assetId && HOST.assets) HOST.assets.delete(l.assetId).catch(() => {}); }
      logos.splice(Number(b.dataset.dellogo), 1); store.set('logos', logos.filter(x => !x.id)); render();
    });
    $('#btnExport', root).onclick = async () => {
      const entregables = await repo.all().catch(() => []);
      saveFile(`alianza-tareas-${todayStr()}.json`, JSON.stringify({ tasks, projects, entregables }, null, 2));
    };
    $('#fileImport', root).onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(txt => {
        const d = JSON.parse(txt);
        if (Array.isArray(d.tasks)) { tasks = d.tasks; saveTasks(); }
        if (Array.isArray(d.projects)) { projects = d.projects; store.set('projects', projects); }
        if (Array.isArray(d.entregables)) d.entregables.forEach(i => repo.put(i));
        toast('Datos importados.'); render();
      }).catch(() => toast('Archivo no válido.'));
    };
  };

  // ---------------------------------------------------------------- Diálogo de tarea
  const dlg = $('#taskDialog'), form = $('#taskForm');
  let editingId = null;
  function fillProjectSelect() { form.project.innerHTML = projectOptions(); }

  function openTask(id, preset = {}) {
    editingId = id;
    const t = id ? tasks.find(x => x.id === id) : { title: '', project: ui.filterProject || projects[0], status: 'todo', priority: 'media', due: '', time: '', remind: '', notes: '', ...preset };
    fillProjectSelect();
    if (!projects.includes(t.project)) form.project.insertAdjacentHTML('beforeend', `<option>${esc(t.project)}</option>`);
    for (const k of ['title', 'project', 'status', 'priority', 'due', 'time', 'remind', 'notes']) form[k].value = t[k] ?? '';
    $('#taskSteps').innerHTML = (t.steps && t.steps.length ? `<b>Cómo proceder</b><ol>${t.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '') +
      (t.legalDue ? `<div class="notice">Plazo legal: vence el <b>${esc(fmtDate(t.legalDue))}</b> (radicado ${esc(fmtDate(t.received))}).</div>` : '') +
      (t.input && t.input !== t.title ? `<details><summary>Texto original</summary><div class="output">${esc(t.input)}</div></details>` : '');
    $('#taskDialogTitle').textContent = id ? 'Editar tarea' : 'Nueva tarea';
    $('#btnDeleteTask').hidden = !id;
    $('#btnCalTask').hidden = !id || !t.due;
    if (id && t.due) $('#btnCalTask').href = googleCalendarUrl(t);
    dlg.showModal();
  }

  form.addEventListener('submit', e => {
    if (e.submitter?.value !== 'save') return;
    const data = Object.fromEntries(new FormData(form));
    if (editingId) {
      const t = tasks.find(x => x.id === editingId);
      if (t.due !== data.due || t.time !== data.time || t.remind !== data.remind) t.notified = false;
      if (data.status === 'done' && t.status !== 'done') t.doneAt = Date.now();
      Object.assign(t, data);
    } else {
      tasks.push({ id: uid(), created: Date.now(), ...data, doneAt: data.status === 'done' ? Date.now() : undefined });
    }
    saveTasks(); render(); toast('Tarea guardada.');
  });
  $('#btnDeleteTask').onclick = e => confirmClick(e.currentTarget, '¿Seguro? Toca otra vez', () => {
    tasks = tasks.filter(t => t.id !== editingId); saveTasks(); dlg.close(); render();
  });
  $('#btnNewTask').onclick = () => openTask(null);

  // ---------------------------------------------------------------- Navegación
  function setView(v) { ui.view = v; ui.receipts = []; render(); window.scrollTo(0, 0); }
  function renderView() {
    const root = $('#view');
    root.classList.toggle('wide', ui.view === 'agencia');
    root.innerHTML = views[ui.view]();
    views[ui.view].after?.(root);
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  }
  function render() { renderView(); renderCmdbar(); }
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#btnSettings').onclick = () => setView('ajustes');

  render();
  checkReminders();
  function dailySummary() {
  if (store.get('lastDaily', '') !== todayStr()) {
    const open = tasks.filter(t => t.status !== 'done'), td = todayStr();
    const msg = `${open.length} pendientes · ${open.filter(t => t.due === td).length} vencen hoy · ${open.filter(t => t.due && t.due < td).length} vencidas · ${tasks.filter(t => t.status === 'review').length} esperan tu aprobación`;
    if (!HOST_FRAME && 'Notification' in window && Notification.permission === 'granted') new Notification('Resumen del día – Alianza', { body: msg });
    setTimeout(() => toast('☀️ ' + msg), 600);
    store.set('lastDaily', todayStr());
  }
  }
  if (!HOST_FRAME) dailySummary();
  setInterval(checkReminders, 30000);
  bootHost();
  if (!HOST_FRAME && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
