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
      db.collection('scans').onSnapshot(snap => {
        snap.docs.forEach(d => { office.scans[d.id] = JSON.parse(JSON.stringify(d.data())); });
        store.set('office.scans', office.scans);
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
          ${t.agent && AGENTS[t.agent] ? `<span class="chip gold">👤 ${esc(AGENTS[t.agent].name)}</span>` : ''}
          ${t.priority === 'alta' ? '<span class="chip gold">Prioridad alta</span>' : ''}
          ${dueChip}
          ${t.remind !== '' && t.remind != null ? '<span>🔔</span>' : ''}
        </div>
      </div>
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

  views.hoy = () => {
    const today = todayStr(), week = addDays(today, 7);
    const open = tasks.filter(t => t.status !== 'done');
    const overdue = open.filter(t => t.due && t.due < today);
    const dueToday = open.filter(t => t.due === today);
    const upcoming = open.filter(t => t.due > today && t.due <= week).sort((a, b) => (a.due + a.time).localeCompare(b.due + b.time));
    const noDate = open.filter(t => !t.due).sort((a, b) => (a.priority === 'alta' ? -1 : 0) - (b.priority === 'alta' ? -1 : 0));
    const doneWeek = tasks.filter(t => t.status === 'done' && t.doneAt > Date.now() - 7 * 864e5).length;
    const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
    const section = (title, list, empty) => `<h2>${title}</h2>${list.length ? list.map(taskRow).join('') : `<div class="empty">${empty}</div>`}`;

    return `
      <h1>${greeting}${settings.delegate ? ', ' + esc(settings.delegate.split(' ')[0]) : ''}</h1>
      <p class="sub">${esc(new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }))}</p>
      <div class="gold-line"></div>
      <div class="grid stats">
        <div class="card stat"><strong>${open.length}</strong><span>Pendientes</span></div>
        <div class="card stat gold"><strong>${dueToday.length}</strong><span>Vencen hoy</span></div>
        <div class="card stat"><strong style="color:${overdue.length ? 'var(--rojo)' : ''}">${overdue.length}</strong><span>Vencidas</span></div>
        <div class="card stat"><strong>${doneWeek}</strong><span>Hechas esta semana</span></div>
      </div>
      ${advisorHtml()}
      <div class="toolbar" style="margin-top:12px">
        <button class="btn btn-ghost btn-sm" id="btnIcsAll">📅 Agregar pendientes al calendario (.ics)</button>
        ${!HOST_FRAME && 'Notification' in window && Notification.permission !== 'granted' ? '<button class="btn btn-ghost btn-sm" id="btnNotif">🔔 Activar recordatorios</button>' : ''}
      </div>
      ${overdue.length ? section('⚠️ Vencidas', overdue, '') : ''}
      ${section('Hoy', dueToday, 'Nada vence hoy.')}
      ${section('Próximos 7 días', upcoming, 'Sin pendientes con fecha esta semana.')}
      ${section('Sin fecha', noDate, 'Todo tiene fecha. ¡Bien!')}
    `;
  };
  function advisorHtml() {
    const acts = nextActions();
    const load = Object.entries(AGENTS).map(([k, a]) => {
      const n = queueOf(k).length, r = tasks.filter(t => t.agent === k && t.status === 'review').length;
      return n || r ? `<span class="chip">${esc(a.name)}: ${n ? n + ' en bandeja' : ''}${n && r ? ' · ' : ''}${r ? r + ' por aprobar' : ''}</span>` : '';
    }).join('');
    return `<div class="card advisor" style="margin-top:12px">
      <div class="adv-head"><span class="p-avatar sm" style="background:${BRAND.azul}">V</span><div><b>Valeria te recomienda</b><small>Qué hacer primero y cómo proceder</small></div></div>
      ${acts.length ? `<ol>${acts.map(t => `<li data-open="${esc(t.id)}"><b>${esc(t.title)}</b><small>${esc(t.project)} · ${esc(howTo(t))}</small></li>`).join('')}</ol>` : '<p class="sub">No tienes pendientes. ¡Buen trabajo!</p>'}
      ${load ? `<div class="team-load">${load}</div>` : ''}
    </div>`;
  }
  views.hoy.after = root => {
    bindTaskEvents(root);
    root.querySelectorAll('[data-open]').forEach(el => el.onclick = () => openTask(el.dataset.open));
    $('#btnIcsAll', root).onclick = () => {
      const list = tasks.filter(t => t.status !== 'done' && t.due);
      if (!list.length) return toast('No hay pendientes con fecha.');
      downloadIcs(list, 'pendientes-alianza.ics');
      toast('Abre el archivo .ics para añadirlo a tu calendario.');
    };
    const bn = $('#btnNotif', root);
    if (bn) bn.onclick = async () => { await Notification.requestPermission(); render(); };
  };

  views.tablero = () => {
    const q = ui.search.toLowerCase();
    const list = tasks.filter(t => (!ui.filterProject || t.project === ui.filterProject) &&
      (!q || (t.title + ' ' + t.notes).toLowerCase().includes(q)));
    const cols = Object.entries(STATUS).map(([k, label]) => {
      const items = list.filter(t => t.status === k);
      return `<div class="column" data-status="${k}"><h3>${label}<span>${items.length}</span></h3>${items.map(taskRow).join('')}</div>`;
    }).join('');
    return `
      <h1>Tablero</h1><div class="gold-line"></div>
      <div class="toolbar">
        <select id="fProject"><option value="">Todos los proyectos</option>${projects.map(p => `<option ${p === ui.filterProject ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <input id="fSearch" placeholder="Buscar…" value="${esc(ui.search)}">
      </div>
      <div class="board">${cols}</div>
      <p class="sub" style="margin-top:8px">Arrastra las tarjetas entre columnas para cambiar su estado.</p>`;
  };
  views.tablero.after = root => {
    bindTaskEvents(root);
    $('#fProject', root).onchange = e => { ui.filterProject = e.target.value; render(); };
    const fs = $('#fSearch', root);
    fs.oninput = e => { ui.search = e.target.value; render(); $('#fSearch').focus(); $('#fSearch').setSelectionRange(ui.search.length, ui.search.length); };
    root.querySelectorAll('.task').forEach(el => el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', el.dataset.id)));
    root.querySelectorAll('.column').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        const t = tasks.find(x => x.id === e.dataTransfer.getData('text/plain'));
        if (t) { t.status = col.dataset.status; if (t.status === 'done') t.doneAt = Date.now(); saveTasks(); render(); }
      });
    });
  };

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
        el.textContent = 'Asignando…';
        const created = await dispatch(text, { auto: store.get('autoRun', true), project: projects.includes(matchProject(label?.name)) && matchProject(label?.name) !== 'General / AGI' ? matchProject(label?.name) : '' });
        created.forEach(t => { t.notes = `${t.notes}\nCorreo: ${th.url || ''}`.trim(); });
        saveTasks();
        el.textContent = `✓ ${created.map(t => AGENTS[t.agent].name).join(', ')}`;
        renderCmdbar();
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

  // ---------------------------------------------------------------- Agencia (IA)
  // Equipo de la oficina virtual. Cada agente tiene escritorio, área y una sola especialidad.
  const AGENTS = {
    planificador: {
      name: 'Valeria', role: 'Coordinadora de proyectos', area: 'Dirección', engine: 'Claude',
      desk: [3.2, 3.2], shirt: '#1A3867', hair: '#3B2A20', dot: '#1A3867',
      bio: 'Meticulosa. Convierte el caos del día en pasos pequeños.',
      resp: ['Analizar tus pendientes', 'Elegir las 3 prioridades del día', 'Armar el plan por horas', 'Sugerir qué delegar', 'Alertar vencimientos'],
      tools: ['tasks.read', 'claude.messages'], risk: 0
    },
    comunicado: {
      name: 'Tomás', role: 'Redactor de comunicados', area: 'Redacción', engine: 'Claude',
      desk: [10.6, 2.6], shirt: '#95762F', hair: '#1F1A17', dot: '#95762F',
      bio: 'Escribe claro y cercano. Sigue al pie de la letra el prompt AGI.',
      resp: ['Comunicados cortos para WhatsApp', 'Tono cercano y formal', 'Ortografía impecable', 'Registro de trazabilidad'],
      tools: ['claude.messages', 'prompt.AGI'], risk: 0
    },
    correo: {
      name: 'Lucía', role: 'Redactora de respuestas', area: 'Redacción', engine: 'Claude',
      desk: [14.2, 2.6], shirt: '#2B5297', hair: '#6B3E26', dot: '#2B5297',
      bio: 'Prepara borradores; tú decides si se envían.',
      resp: ['Borradores de respuesta a correos', 'Asunto sugerido', 'Marca entre [corchetes] lo que falte', 'Nunca envía correos'],
      tools: ['claude.messages'], risk: 0
    },
    juridico: {
      name: 'Daniela', role: 'Asesora jurídica', area: 'Archivo y correo', engine: 'Claude',
      desk: [14.2, 11.4], shirt: '#5B3E8C', hair: '#2B1B12', dot: '#5B3E8C',
      bio: 'Rigurosa con los plazos. Ningún derecho de petición se vence.',
      resp: ['Buscar en el correo los derechos de petición pendientes', 'Clasificar derechos de petición, tutelas y PQR', 'Calcular el plazo legal (Ley 1755 de 2015)', 'Redactar el borrador de respuesta', 'Revisar los borradores que envían los delegados', 'Señalar soportes y anexos necesarios'],
      tools: ['claude.messages', 'calendario.habiles'], risk: 0
    },
    disenador: {
      name: 'Mateo', role: 'Diseñador gráfico', area: 'Estudio de diseño', engine: 'ChatGPT',
      desk: [3.2, 10.6], shirt: '#C9A54C', hair: '#2A2A2A', dot: '#C9A54C',
      bio: 'Respeta los logos como ley. La IA solo pinta el fondo.',
      resp: ['Atender tus pedidos de piezas desde la barra', 'Flyers 1080×1350 para WhatsApp', 'Paleta azul, dorado y blanco', 'Logos originales sin alterar', 'Exporta PNG'],
      tools: ['openai.images', 'canvas.compose', 'logos.read'], risk: 0
    },
    archivo: {
      name: 'Sofía', role: 'Lectora de correo', area: 'Archivo y correo', engine: 'Gmail · solo lectura',
      desk: [11.2, 10.6], shirt: '#3E6DB5', hair: '#111111', dot: '#3E6DB5',
      bio: 'Lo lee todo y no toca nada.',
      resp: ['Revisar la bandeja y señalar los correos importantes', 'Sugerir qué agente debe atender cada uno', 'Revisar carpetas por proyecto', 'Convertir correos en tareas', 'Nunca envía, borra ni marca correos'],
      tools: ['gmail.readonly'], risk: 0
    },
    agenda: {
      name: 'Andrés', role: 'Agenda y recordatorios', area: 'Sala de agenda', engine: 'Calendario',
      desk: [19.6, 5.6], shirt: '#7A5F22', hair: '#4A3426', dot: '#7A5F22',
      bio: 'Puntual. Nada se te pasa.',
      resp: ['Detectar reuniones e invitaciones en el correo', 'Avisos antes de cada vencimiento', 'Enviar pendientes a Google Calendar', 'Exportar .ics con alarmas'],
      tools: ['notifications', 'calendar.ics'], risk: 0
    }
  };

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

  async function askClaude(system, user) {
    if (HOST.sample) {
      try {
        const r = await HOST.sample(`${system}\n\n=====\n\n${user}`, { modelTier: 'default' });
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
      body: JSON.stringify({ model: settings.claudeModel, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] })
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

  function agentForm(key) {
    const last = store.get('agent.' + key, {});
    if (key === 'comunicado') return `
      <label>1. Proyecto o conjunto<select name="project">${projectOptions(last.project)}</select></label>
      <label>2. Tema principal<input name="tema" placeholder="Convivencia, mantenimiento, aviso general…" value="${esc(last.tema)}"></label>
      <label>3. Idea general (tus notas en bruto)<textarea name="idea" rows="5" placeholder="Ej: corte de agua el jueves de 8 a 2 por lavado de tanques…">${esc(last.idea)}</textarea></label>`;
    if (key === 'correo') return `
      <label>Proyecto<select name="project">${projectOptions(last.project)}</select></label>
      <label>Correo recibido (pégalo aquí)<textarea name="mail" rows="6">${esc(last.mail)}</textarea></label>
      <label>¿Qué quieres responder?<textarea name="idea" rows="3" placeholder="Agradecer, confirmar fecha, pedir documentos…">${esc(last.idea)}</textarea></label>`;
    if (key === 'juridico') return `
      <label>Proyecto<select name="project">${projectOptions(last.project)}</select></label>
      <label>¿Qué necesitas?<select name="modo">
        <option value="borrador" ${last.modo !== 'revision' ? 'selected' : ''}>Redactar borrador de respuesta</option>
        <option value="revision" ${last.modo === 'revision' ? 'selected' : ''}>Revisar borrador enviado por un delegado</option>
      </select></label>
      <label>Fecha de radicación<input type="date" name="radicado" value="${esc(last.radicado || todayStr())}"></label>
      <label>Texto del derecho de petición<textarea name="peticion" rows="6">${esc(last.peticion)}</textarea></label>
      <label>Borrador del delegado (solo para revisión)<textarea name="borrador" rows="5">${esc(last.borrador)}</textarea></label>`;
    if (key === 'planificador') return `
      <p class="sub">Usará tus ${tasks.filter(t => t.status !== 'done').length} pendientes abiertos.</p>
      <label>Contexto de hoy (opcional)<textarea name="idea" rows="3" placeholder="Tengo comité a las 3 p. m., visita de obra en la mañana…">${esc(last.idea)}</textarea></label>`;
    return `
      <label>Proyecto<select name="project">${projectOptions(last.project)}</select></label>
      <label>Título de la pieza<input name="titulo" value="${esc(last.titulo)}"></label>
      <label>Texto de la pieza<textarea name="texto" rows="5">${esc(last.texto)}</textarea></label>
      <label>Imagen de fondo (ChatGPT)<input name="escena" placeholder="Ej: fachada de conjunto residencial moderno al atardecer" value="${esc(last.escena)}"></label>
      ${hasOpenAI() ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="useAI" style="width:auto;margin:0" ${last.useAI === false ? '' : 'checked'}> Generar imagen con ChatGPT (sin IA se usa la plantilla institucional)</label>` : `<p class="sub">${HOST_FRAME ? 'En esta versión Mateo usa la plantilla institucional (ChatGPT se activa en la versión instalada con tu clave de OpenAI).' : 'Agrega tu clave de OpenAI en Ajustes para generar fondos con ChatGPT; mientras tanto se usa la plantilla institucional.'}</p>`}
      <div class="notice">Regla absoluta: los logos se colocan <b>tal como son</b> (sin estirar, recolorear ni recortar). La IA solo crea la imagen de fondo.</div>
      <h2>Logos de ${esc(last.project || projects[0])}</h2>
      <div class="logo-grid" id="logoPick"></div>
      <label style="margin-top:10px">Subir logo desde el equipo<input type="file" name="logoFile" accept="image/*"></label>`;
  }

  // ---------------------------------------------------------------- La oficina (vista central)
  // Cuadrícula de salas con corte frontal: cada agente en la suya, burbujas con lo que hace,
  // "Tu equipo" + "Charla del equipo" a la izquierda y "Para vos" a la derecha.
  const ROOM_ORDER = ['entrada', 'planificador', 'archivo', 'juridico', 'comunicado', 'correo', 'disenador', 'agenda'];
  const ROOM_INFO = {
    entrada: { label: 'Entrada', rug: '#C9A54C' },
    planificador: { label: 'Coordinación', rug: '#7FA3D6' },
    archivo: { label: 'Correo', rug: '#9CC3B4' },
    juridico: { label: 'Jurídica', rug: '#B9A6D9' },
    comunicado: { label: 'Comunicados', rug: '#E3C77E' },
    correo: { label: 'Respuestas', rug: '#A9C1E8' },
    disenador: { label: 'Diseño', rug: '#E8B9A0' },
    agenda: { label: 'Agenda', rug: '#B7D3A0' }
  };

  const office = {
    status: {}, // key -> 'trabajando'
    activity: {}, // key -> {verb, text, t}
    flash: {}, // key -> {title, t}: tarjeta "✓ LISTO"
    results: store.get('office.results', {}),
    log: store.get('office.log', []),
    scans: store.get('office.scans', {}),
    open: null, tab: 'trabajo', banner: null
  };
  const STATUS_TXT = { libre: 'Al día', trabajando: 'Trabajando…', aprobacion: 'Espera tu OK', bandeja: 'Pendiente' };
  const STATUS_DOT = { libre: '#2E7D4F', trabajando: '#C9A54C', aprobacion: '#2B5297', bandeja: '#95762F' };
  function agentStatus(k) {
    if (office.status[k]) return 'trabajando';
    if (office.results[k] || tasks.some(t => t.agent === k && t.status === 'review')) return 'aprobacion';
    if (queueOf(k).length) return 'bandeja';
    return 'libre';
  }
  const openFindings = k => ((office.scans[k] || {}).items || []).filter(i => !i.done && !i.dismissed && (k !== 'juridico' || i.requiereRespuesta !== false));

  function logEvent(agent, text, ok = true, to = null) {
    office.log.unshift({ t: Date.now(), agent, text, ok, to });
    office.log = office.log.slice(0, 60);
    store.set('office.log', office.log);
    if (HOST.db) { const items = JSON.parse(JSON.stringify(office.log)); sync.queue = sync.queue.then(() => HOST.db.doc('meta/log').set({ items }).catch(dbFail)); }
  }
  function saveResults() {
    const slim = Object.fromEntries(Object.entries(office.results).map(([k, r]) => [k, r.type === 'image' ? { ...r, dataUrl: null } : r]));
    store.set('office.results', slim);
  }
  function saveScan(k) {
    store.set('office.scans', office.scans);
    if (HOST.db) { const data = JSON.parse(JSON.stringify(office.scans[k])); sync.queue = sync.queue.then(() => HOST.db.doc('scans/' + k).set(data).catch(dbFail)); }
  }
  function setBanner(text) { office.banner = { text, t: Date.now() }; renderBanner(); setTimeout(renderBanner, 6000); }

  const live = () => hasClaude();
  const hhmmss = t => new Date(t).toLocaleTimeString('es-CO', { hour12: false, timeZone: TZ });
  const hhmm = t => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
  const who = k => k === 'vos' ? 'ti' : (AGENTS[k]?.name || 'Entrada');

  // ---- Dibujo de una sala (SVG, vista frontal con corte)
  function wallDecor(k) {
    const books = (x, y, w) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="56" rx="2" fill="#7A5A3A"/>`; for (let r = 0; r < 3; r++) { s += `<rect x="${x + 3}" y="${y + 17 + r * 18}" width="${w - 6}" height="2.5" fill="#5E4329"/>`; for (let i = 0; i < Math.floor((w - 8) / 6); i++) s += `<rect x="${x + 4 + i * 6}" y="${y + 4 + r * 18}" width="4.5" height="${11 + ((i * 7 + r) % 4)}" fill="${['#1A3867', '#95762F', '#C9D6EA', '#2B5297', '#E9D9AE'][(i + r) % 5]}"/>`; } return s; };
    const screen = (x, y, w, h, lines = 4, col = '#9FC3F2') => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#0F1E3A" stroke="#95762F" stroke-width="1.2"/>`; for (let i = 0; i < lines; i++) s += `<rect x="${x + 6}" y="${y + 7 + i * 7}" width="${(w - 12) * (0.4 + ((i * 37) % 50) / 100)}" height="2.4" rx="1" fill="${i === 0 ? '#E9D9AE' : col}" opacity=".9"/>`; return s; };
    switch (k) {
      case 'entrada': return screen(196, 22, 80, 44, 4) + `<rect x="44" y="30" width="52" height="40" rx="3" fill="#FFFFFF" stroke="#C9D6EA"/><path d="M48 36 L70 52 L92 36" stroke="#95762F" stroke-width="2" fill="none"/>`;
      case 'planificador': { let s = `<rect x="186" y="20" width="96" height="58" rx="3" fill="#FFFFFF" stroke="#C9D6EA"/>`; [['#E9D9AE', 194, 28], ['#C9D6EA', 216, 28], ['#E9D9AE', 238, 28], ['#C9D6EA', 260, 30], ['#C9D6EA', 194, 52], ['#E9D9AE', 220, 52], ['#C9D6EA', 246, 50]].forEach(([c, x, y]) => s += `<rect x="${x}" y="${y}" width="17" height="17" fill="${c}"/>`); return s + books(40, 22, 62); }
      case 'archivo': { let s = ''; for (let i = 0; i < 3; i++) s += `<rect x="${40 + i * 24}" y="30" width="21" height="54" rx="2" fill="#2B3E66"/><rect x="${46 + i * 24}" y="40" width="9" height="2.5" fill="#C9D6EA"/><rect x="${46 + i * 24}" y="58" width="9" height="2.5" fill="#C9D6EA"/>`; return s + screen(200, 22, 78, 46, 5); }
      case 'juridico': return books(36, 22, 74) + books(210, 22, 70) + `<g transform="translate(160 30)" stroke="#95762F" stroke-width="2" fill="none"><path d="M0 0 V26 M-14 6 H14"/><path d="M-14 6 L-20 18 H-8 Z M14 6 L8 18 H20 Z" fill="#E9D9AE"/></g>`;
      case 'comunicado': return screen(40, 22, 86, 50, 5) + `<rect x="204" y="26" width="64" height="20" rx="10" fill="#FFFFFF"/><rect x="214" y="50" width="56" height="18" rx="9" fill="#E9D9AE"/>`;
      case 'correo': return books(40, 22, 64) + screen(204, 24, 72, 42, 4);
      case 'disenador': { let s = ''; ['#1A3867', '#95762F', '#FFFFFF', '#2B5297', '#E9D9AE'].forEach((c, i) => s += `<rect x="${42 + i * 15}" y="28" width="12" height="34" fill="${c}" stroke="#C9D6EA"/>`); return s + `<rect x="206" y="22" width="68" height="50" rx="2" fill="#FFFFFF" stroke="#95762F"/><circle cx="240" cy="42" r="12" fill="#C9D6EA"/><rect x="216" y="58" width="48" height="5" fill="#1A3867"/>`; }
      case 'agenda': { let s = `<rect x="188" y="20" width="90" height="60" rx="3" fill="#FFFFFF" stroke="#C9D6EA"/><rect x="188" y="20" width="90" height="12" rx="3" fill="#1A3867"/>`; for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) s += `<rect x="${193 + c * 14}" y="${37 + r * 13}" width="11" height="10" fill="${(r * 6 + c) % 5 === 1 ? '#E9D9AE' : '#EDF2FA'}"/>`; return s + books(40, 22, 60); }
    }
    return '';
  }
  function avatarG(a, k) {
    const working = office.status[k];
    return `<g class="avatar ${working ? 'working' : ''}"><g class="bob">
      <rect x="138" y="96" width="24" height="34" rx="10" fill="${a.shirt}"/>
      <circle cx="150" cy="88" r="10" fill="#E9C6A1"/>
      <path d="M139.6 87 a10.4 10.4 0 0 1 20.8 0 q-10.4 -5.5 -20.8 0z" fill="${a.hair}"/></g></g>`;
  }
  function roomSvg(k) {
    const a = AGENTS[k], rug = ROOM_INFO[k].rug, working = !!office.status[k];
    let floor = '';
    for (let i = 1; i < 10; i++) floor += `<line x1="${24 + i * 27.2}" y1="96" x2="${4 + i * 31.2}" y2="216" stroke="#CDAE7E" stroke-width="1"/>`;
    const desk = `<polygon points="112,132 214,132 224,144 102,144" fill="#FFFFFF"/><rect x="102" y="144" width="122" height="24" fill="#E3E9F3"/><rect x="106" y="168" width="5" height="14" fill="#C9D6EA"/><rect x="215" y="168" width="5" height="14" fill="#C9D6EA"/>
      <rect x="176" y="106" width="38" height="25" rx="2" fill="#1C2742"/><rect x="179" y="109" width="32" height="19" rx="1" fill="${working ? '#3E6DB5' : '#24324F'}" class="${working ? 'glow' : ''}"/><rect x="192" y="131" width="6" height="3" fill="#1C2742"/>`;
    let people = '';
    if (k === 'entrada') {
      people = `<polygon points="96,128 230,128 240,140 86,140" fill="#FFFFFF"/><rect x="86" y="140" width="154" height="30" fill="#E3E9F3"/><rect x="86" y="140" width="154" height="5" fill="#95762F"/>
        <rect x="120" y="116" width="26" height="14" rx="2" fill="#FFFFFF" stroke="#C9D6EA"/><rect x="150" y="112" width="26" height="18" rx="2" fill="#FFFFFF" stroke="#C9D6EA"/><path d="M150 112 L163 122 L176 112" stroke="#95762F" fill="none"/>`;
    } else {
      people = `<rect x="134" y="92" width="32" height="38" rx="7" fill="#2B5297"/>` + avatarG(a, k) + desk;
    }
    const extra = k === 'agenda' ? `<ellipse cx="258" cy="178" rx="26" ry="9" fill="#FFFFFF" stroke="#C9D6EA"/>` : k === 'disenador' ? `<polygon points="244,150 270,150 262,196 252,196" fill="#B39C66"/>` : `<rect x="236" y="168" width="44" height="22" rx="8" fill="#D9C690"/><rect x="236" y="160" width="44" height="12" rx="6" fill="#C9B68A"/>`;
    return `<svg viewBox="0 0 320 220" class="room-svg" aria-hidden="true">
      <rect x="0" y="0" width="320" height="220" rx="12" fill="#0E1D38"/>
      <polygon points="24,10 296,10 296,96 24,96" fill="#E4EBF6"/>
      <polygon points="4,4 24,10 24,96 4,216" fill="#C2D0E6"/><polygon points="316,4 296,10 296,96 316,216" fill="#C2D0E6"/>
      <polygon points="24,96 296,96 316,216 4,216" fill="#E6D0A8"/>${floor}
      <line x1="24" y1="96" x2="296" y2="96" stroke="#B89A6A" stroke-width="2"/>
      ${wallDecor(k)}
      <ellipse cx="160" cy="176" rx="104" ry="30" fill="${rug}" opacity=".6"/>
      ${extra}
      <rect x="28" y="168" width="18" height="16" rx="2" fill="#C9B68A"/><circle cx="37" cy="158" r="12" fill="#3C8D5A"/><circle cx="31" cy="150" r="7" fill="#4FA66D"/>
      ${people}
    </svg>`;
  }

  function roomHtml(k) {
    const isEntrada = k === 'entrada';
    const a = AGENTS[k];
    const today = todayStr();
    const n = isEntrada ? tasks.filter(t => t.created && new Date(t.created).toLocaleDateString('en-CA', { timeZone: TZ }) === today).length
      : queueOf(k).length + tasks.filter(t => t.agent === k && t.status === 'review').length + openFindings(k).length;
    const act = office.activity[k], fl = office.flash[k] && Date.now() - office.flash[k].t < 9000 ? office.flash[k] : null;
    const st = isEntrada ? 'libre' : agentStatus(k);
    let bubble = '';
    if (!isEntrada && office.status[k] && act) bubble = `<div class="bubble"><div class="b-head"><span class="dot" style="background:${a.shirt}"></span>${esc(a.name)} <em>${esc(act.verb)}</em><time>${esc(ago(act.t))}</time></div>${esc(act.text)}</div>`;
    else if (fl) bubble = `<div class="done-card"><small>✓ LISTO · ${esc(a.name.toUpperCase())}</small><b>${esc(fl.title)}</b>${fl.sub ? `<span>${esc(fl.sub)}</span>` : ''}</div>`;
    return `<div class="room ${office.open === k ? 'focus' : ''} ${office.open && office.open !== k ? 'dim' : ''}" data-room="${k}" style="--rug:${ROOM_INFO[k].rug}">
      ${roomSvg(k)}
      <span class="room-tag"><span class="dot" style="background:${isEntrada ? BRAND.dorado : a.shirt}"></span>${esc(ROOM_INFO[k].label)}</span>
      ${n ? `<span class="room-count">${n}</span>` : ''}
      ${isEntrada ? `<span class="room-pill entrada-pill">${n ? `${n} entraron hoy` : 'Deja aquí un pendiente'}</span>` : `<span class="room-pill"><span class="dot" style="background:${STATUS_DOT[st]}"></span>${esc(a.name)}${office.status[k] ? '<span class="working-bar"></span>' : ''}</span>`}
      ${bubble}
    </div>`;
  }

  // ---- Columnas
  function teamHtml() {
    return Object.entries(AGENTS).map(([k, a]) => {
      const st = agentStatus(k), q = queueOf(k).length, f = openFindings(k).length, act = office.activity[k];
      const sub = office.status[k] && act ? `${act.verb.toLowerCase()} · ${act.text}` : st === 'aprobacion' ? 'Tiene algo listo para ti' : q ? `${q} en su bandeja` : f ? `${f} hallazgos en el correo` : a.role;
      return `<button class="team-row ${office.open === k ? 'active' : ''}" data-agent="${k}">
        <span class="p-avatar sm" style="background:${a.shirt}">${esc(a.name[0])}</span>
        <span class="tr-main"><b>${esc(a.name)}</b><small>${esc(sub)}</small></span>
        <span class="tr-st" style="color:${STATUS_DOT[st]}"><span class="dot" style="background:${STATUS_DOT[st]}"></span>${STATUS_TXT[st]}</span>
      </button>`;
    }).join('');
  }
  function chatHtml() {
    const rows = office.log.slice(0, 9);
    return rows.length ? rows.map(e => `<div class="chat-row ${e.ok ? '' : 'err'}">
        <span class="p-avatar xs" style="background:${AGENTS[e.agent]?.shirt || BRAND.dorado}">${esc((AGENTS[e.agent]?.name || 'E')[0])}</span>
        <div><b>${esc(who(e.agent))}${e.to ? ' → ' + esc(who(e.to)) : ''}</b><time>${esc(hhmm(e.t))}</time><p>${esc(e.text)}</p></div></div>`).join('')
      : '<p class="sub">Aquí verás cómo se pasan el trabajo entre ellos.</p>';
  }
  function forYouItems() {
    const items = [], today = todayStr();
    tasks.filter(t => t.status === 'review').forEach(t => items.push({ k: t.agent, big: AGENTS[t.agent]?.name || 'Revisión', title: t.title, sub: t.project, ok: true, open: t.agent, task: t.id }));
    const pet = openFindings('juridico');
    if (pet.length) {
      const next = pet.filter(p => p.vence).sort((a, b) => a.vence.localeCompare(b.vence))[0];
      items.push({ k: 'juridico', big: `${pet.length} ${pet.length === 1 ? 'petición' : 'peticiones'}`, title: 'sin responder en el correo', sub: next ? `La más próxima vence ${fmtDate(next.vence)}` : 'Daniela las revisó', urgent: next && next.vence <= addBusinessDays(today, 3), open: 'juridico', tab: 'hallazgos' });
    }
    const imp = openFindings('archivo');
    if (imp.length) items.push({ k: 'archivo', big: `${imp.length} correos`, title: 'importantes por atender', sub: imp[0].subject, open: 'archivo', tab: 'hallazgos' });
    const meet = openFindings('agenda');
    if (meet.length) items.push({ k: 'agenda', big: `${meet.length} reuniones`, title: 'detectadas en el correo', sub: meet[0].titulo || meet[0].subject, open: 'agenda', tab: 'hallazgos' });
    const overdue = tasks.filter(t => t.status !== 'done' && t.due && t.due < today);
    if (overdue.length) items.push({ k: 'planificador', big: `${overdue.length} vencidas`, title: overdue[0].title, sub: 'Valeria sugiere reprogramar o delegar', urgent: true, open: 'planificador' });
    const dueToday = tasks.filter(t => t.status !== 'done' && t.due === today);
    if (dueToday.length) items.push({ k: 'agenda', big: `${dueToday.length} para hoy`, title: dueToday[0].title, sub: dueToday[0].project, open: 'agenda' });
    return items;
  }
  function forYouHtml() {
    const items = forYouItems();
    return items.length ? items.map((it, i) => `<button class="fy ${it.urgent ? 'urgent' : ''}" data-fy="${i}">
        <span class="p-avatar sm" style="background:${AGENTS[it.k]?.shirt || BRAND.azul}">${esc((AGENTS[it.k]?.name || 'A')[0])}</span>
        <span class="fy-main"><b>${esc(it.big)}</b><small>${esc(it.title)}</small>${it.sub ? `<em>${esc(it.sub)}</em>` : ''}</span>
        ${it.ok ? '<span class="tu-ok">TU OK</span>' : it.urgent ? '<span class="tu-ok red">URGENTE</span>' : ''}
      </button>`).join('') : '<p class="sub">Nada te espera. El equipo está al día.</p>';
  }
  function statsHtml() {
    const done = tasks.filter(t => t.status === 'done' && t.doneAt > Date.now() - 7 * 864e5).length;
    const working = Object.keys(office.status).length;
    const ok = tasks.filter(t => t.status === 'review').length;
    return `<div class="stat-card"><b>${done}</b><small>resueltas esta semana</small></div>
      <div class="stat-card"><b>${tasks.filter(t => t.status !== 'done').length}</b><small>pendientes</small></div>
      <div class="stat-card ${ok ? 'accent' : ''}"><b>${ok}</b><small>esperan tu OK</small></div>
      <div class="working-now"><span class="dot" style="background:${working ? '#C9A54C' : '#2E7D4F'}"></span>${working ? `${working} trabajando` : 'Equipo disponible'}</div>`;
  }
  function chipsHtml() {
    const total = tasks.filter(t => t.status !== 'done').length;
    return `<button class="room-chip ${!office.open ? 'active' : ''}" data-chip="">Toda la oficina <b>${Object.keys(AGENTS).length}</b></button>` +
      ROOM_ORDER.filter(k => k !== 'entrada').map(k => {
        const n = queueOf(k).length + tasks.filter(t => t.agent === k && t.status === 'review').length + openFindings(k).length;
        return `<button class="room-chip ${office.open === k ? 'active' : ''}" data-chip="${k}"><span class="dot" style="background:${AGENTS[k].shirt}"></span>${esc(ROOM_INFO[k].label)} <b>${n}</b></button>`;
      }).join('') + `<span class="chip-total">${total} pendientes en total</span>`;
  }

  views.agencia = () => `
    <div class="office2">
      <header class="o-head">
        <div><h1>La oficina</h1><p class="sub">Siete agentes, cada uno en lo suyo. Lo que necesita tu aprobación te espera en «Para ti».</p></div>
        <div class="hud-card live ${live() ? 'on' : ''}"><span class="live-dot"></span>${live() ? 'EN VIVO · IA real' : 'Conectando IA…'}</div>
      </header>
      <nav class="room-chips" id="chips"></nav>
      <div class="o-grid">
        <aside class="o-left">
          <section class="o-card"><h3>Tu equipo <span>${Object.keys(AGENTS).length}</span></h3><div id="team"></div></section>
          <section class="o-card"><h3>Charla del equipo</h3><div id="talk"></div></section>
        </aside>
        <section class="o-center">
          <div class="stage2" id="stage"><div class="o-banner" id="banner" hidden></div><div class="rooms" id="rooms"></div></div>
          <div class="o-hint">Toca una sala para ver el trabajo de su agente.</div>
        </section>
        <aside class="o-right">
          <section class="o-stats" id="stats"></section>
          <section class="o-card"><h3>✓ Para ti</h3><div id="foryou"></div></section>
          <section class="o-card scans-card"><h3>Revisar el correo</h3>
            ${['archivo', 'juridico', 'agenda'].map(k => `<button class="btn btn-ghost btn-sm scan-btn" data-scan="${k}">${esc(SCANS[k].button)}</button>`).join('')}
            <p class="sub" style="margin:6px 0 0;font-size:12px">Solo lectura: nada se envía ni se marca.</p>
          </section>
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
    el.querySelectorAll('[data-room]').forEach(r => r.onclick = () => {
      const k = r.dataset.room;
      if (k === 'entrada') { const ta = $('#cmdbar textarea'); if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); } return; }
      openAgent(k);
    });
  }
  function renderOfficeSide() {
    const set = (id, html) => { const e = $(id); if (e) e.innerHTML = html; };
    set('#chips', chipsHtml()); set('#team', teamHtml()); set('#talk', chatHtml()); set('#stats', statsHtml()); set('#foryou', forYouHtml());
    document.querySelectorAll('#chips [data-chip]').forEach(b => b.onclick = () => { const k = b.dataset.chip; if (!k) { office.open = null; renderPanel(); renderOffice(); } else openAgent(k, true); });
    document.querySelectorAll('#team [data-agent]').forEach(b => b.onclick = () => openAgent(b.dataset.agent, true));
    const items = forYouItems();
    document.querySelectorAll('#foryou [data-fy]').forEach(b => b.onclick = () => { const it = items[Number(b.dataset.fy)]; openAgent(it.open, true, it.tab); });
    document.querySelectorAll('[data-scan]').forEach(b => b.onclick = () => runScan(b.dataset.scan));
  }
  function renderOffice() { renderRooms(); renderOfficeSide(); renderBanner(); }
  const renderLog = () => { if (ui.view === 'agencia') renderOfficeSide(); };
  function renderScene() { if (ui.view === 'agencia') renderOffice(); }
  function refreshOffice() {
    if (ui.view !== 'agencia') return;
    renderOffice();
    const p = $('#panel'); if (office.open && !(p && p.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderPanel();
  }

  // Papel que vuela de una sala a otra cuando un agente le pasa trabajo a otro.
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

  // ---------------------------------------------------------------- Revisiones del correo (solo lectura)
  const SCANS = {
    archivo: {
      button: '✉️ Sofía: correos importantes', verb: 'REVISA', text: 'la bandeja de entrada',
      query: 'in:inbox newer_than:4d -category:promotions -category:social', view: 'THREAD_VIEW_SUMMARY',
      prompt: () => `Eres Sofía, archivista de la Coordinación de Proyectos de Alianza Grupo Inmobiliario (administración de propiedad horizontal en Colombia). Recibes una lista de hilos recientes de la bandeja de entrada (solo metadatos). Elige los que requieren acción o atención del coordinador, máximo 8, ordenados por importancia. Ignora notificaciones automáticas, reacciones, publicidad y correos solo informativos sin acción. Proyectos válidos: ${projects.join(', ')}.
Responde SOLO JSON: {"items":[{"id":"id del hilo","importancia":"alta|media","motivo":"por qué importa, una frase","accion":"qué conviene hacer, una frase","agente":"correo|juridico|comunicado|disenador|agenda|planificador","proyecto":"uno de la lista o General / AGI"}]}`
    },
    juridico: {
      button: '⚖️ Daniela: derechos de petición', verb: 'BUSCA', text: 'derechos de petición y tutelas',
      query: '("derecho de petición" OR "derechos de petición" OR "derecho de peticion" OR tutela OR PQR OR PQRS OR petición OR label:derechos-de-petición) newer_than:120d', view: 'THREAD_VIEW_MINIMAL',
      prompt: () => `Eres Daniela, asesora jurídica de la Coordinación de Proyectos de Alianza Grupo Inmobiliario (propiedad horizontal, Colombia). Recibes hilos de correo (metadatos y un fragmento). Identifica SOLO derechos de petición, tutelas, PQR o requerimientos formales dirigidos a la administración o al conjunto; descarta lo demás. El campo "enviadoPorNosotros" indica si en el hilo hay un mensaje enviado desde esta cuenta. Proyectos válidos: ${projects.join(', ')}.
Responde SOLO JSON: {"items":[{"id":"id del hilo","tipo":"Derecho de petición|Tutela|PQR|Requerimiento","plazoDias":10|15|30|null,"peticionario":"quién lo presenta","asunto":"resumen corto","requiereRespuesta":true|false,"motivo":"estado y recomendación en una frase","proyecto":"uno de la lista o General / AGI"}]}. Plazos Ley 1755 de 2015: 15 días hábiles en general, 10 para documentos o información, 30 para consultas; tutela: null.`
    },
    agenda: {
      button: '📅 Andrés: reuniones e invitaciones', verb: 'BUSCA', text: 'reuniones e invitaciones',
      query: '(invitación OR invitation OR reunión OR visita OR comité OR asamblea OR "Google Meet") newer_than:14d', view: 'THREAD_VIEW_SUMMARY',
      prompt: () => `Eres Andrés, encargado de la agenda de la Coordinación de Proyectos de Alianza Grupo Inmobiliario. Hoy es ${todayStr()}. De estos hilos, identifica reuniones, visitas, comités o asambleas con fecha futura o de hoy. Proyectos válidos: ${projects.join(', ')}.
Responde SOLO JSON: {"items":[{"id":"id del hilo","titulo":"nombre corto del evento","fecha":"YYYY-MM-DD","hora":"HH:MM o null","lugar":"lugar o enlace, corto","proyecto":"uno de la lista o General / AGI"}]}`
    }
  };
  const ymd = iso => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
  function businessDaysLeft(due) {
    const t = todayStr(); if (due <= t) return due === t ? 0 : -1;
    let n = 0, d = t; while (d < due && n < 60) { d = addBusinessDays(d, 1); n++; } return n;
  }

  async function runScan(k) {
    const sc = SCANS[k], a = AGENTS[k];
    if (!HOST.mcp) return toast(HOST_FRAME ? 'Gmail se está conectando; intenta en un momento.' : 'La revisión automática del correo funciona en la versión publicada en claude.ai.');
    if (!hasClaude()) return toast('Claude aún no está disponible.');
    if (office.status[k]) return;
    office.status[k] = 'trabajando'; office.activity[k] = { verb: sc.verb, text: sc.text, t: Date.now() };
    logEvent(k, `Revisando ${sc.text}`);
    refreshOffice();
    try {
      const r = await HOST.mcp.callTool(GMAIL, 'search_threads', { query: sc.query, pageSize: 25, view: sc.view });
      const threads = (r.payload && r.payload.threads) || [];
      const rows = threads.map(th => {
        const ms = th.messages || [], first = ms[0] || {}, last = ms[ms.length - 1] || {};
        const nm = (m) => ((m.addressDisplayNames || []).find(x => x.emailAddress === m.sender) || {}).displayName || m.sender || '';
        return { id: th.id, asunto: last.subject || first.subject || '', de: nm(first), ultimoDe: nm(last), primerMensaje: ymd(first.date), ultimoMensaje: ymd(last.date), mensajes: th.messageCount || ms.length,
          enviadoPorNosotros: ms.some(m => (m.labelIds || []).includes('SENT')), sinLeer: ms.some(m => (m.labelIds || []).includes('UNREAD')), fragmento: decodeEntities(last.snippet || first.snippet || '').slice(0, 260), url: th.viewUrl || '' };
      });
      let found = [];
      if (rows.length) {
        const raw = await askClaude(sc.prompt(), JSON.stringify(rows.map(({ url, ...x }) => x)));
        const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        const byId = Object.fromEntries(rows.map(x => [x.id, x]));
        const prev = Object.fromEntries(((office.scans[k] || {}).items || []).map(i => [i.id, i]));
        found = (json.items || []).filter(i => byId[i.id]).map(i => {
          const row = byId[i.id], it = { ...i, subject: row.asunto, from: row.de, date: row.ultimoMensaje, url: row.url, sent: row.enviadoPorNosotros, snippet: row.fragmento };
          if (k === 'juridico') { it.radicado = row.primerMensaje; if (i.plazoDias) { it.vence = addBusinessDays(row.primerMensaje, Number(i.plazoDias)); it.dias = businessDaysLeft(it.vence); } }
          if (prev[i.id]) { it.done = prev[i.id].done; it.dismissed = prev[i.id].dismissed; }
          return it;
        });
        if (k === 'juridico') found.sort((x, y) => (x.vence || '9').localeCompare(y.vence || '9'));
      }
      office.scans[k] = { at: Date.now(), items: found };
      saveScan(k); store.set('scanOk', true);
      const pend = found.filter(i => k !== 'juridico' || i.requiereRespuesta !== false).length;
      const msg = k === 'juridico' ? `Encontré ${found.length} ${found.length === 1 ? 'petición' : 'peticiones'}; ${pend} requieren respuesta` : k === 'agenda' ? `Encontré ${found.length} reuniones o visitas` : `Encontré ${found.length} correos que requieren atención`;
      logEvent(k, msg, true, 'vos');
      office.flash[k] = { title: msg, t: Date.now() };
      if (office.open !== k) { office.open = k; }
      office.tab = 'hallazgos';
    } catch (e) {
      const m = e?.code ? mcpMsg(e) : (e?.message || 'No se pudo revisar el correo.');
      logEvent(k, 'No pude revisar el correo: ' + m, false, 'vos'); toast(m);
    }
    delete office.status[k];
    refreshOffice(); renderPanel();
  }

  async function startFromFinding(k, i) {
    const it = ((office.scans[k] || {}).items || [])[i]; if (!it) return;
    const th = { id: it.id, subject: it.subject, from: it.from, date: it.date, snippet: it.snippet, url: it.url };
    toast('Leyendo el correo…');
    let text;
    try { text = await threadText(th); } catch (e) { return toast(e?.code ? mcpMsg(e) : e.message); }
    const project = projects.includes(it.proyecto) ? it.proyecto : matchProject(text);
    if (k === 'agenda') {
      tasks.push({ id: uid(), created: Date.now(), status: 'todo', agent: 'agenda', project, title: it.titulo || it.subject, priority: 'media', due: it.fecha || '', time: it.hora || '', remind: it.fecha ? '1440' : '', notes: `${it.lugar || ''}\nCorreo: ${it.url}`.trim(), steps: DEFAULT_STEPS.agenda, input: it.subject });
      saveTasks(); logEvent('agenda', `Agendó «${it.titulo || it.subject}»`, true, 'vos');
    } else if (k === 'juridico') {
      const t = { id: uid(), created: Date.now(), status: 'todo', agent: 'juridico', project, title: `Responder ${it.tipo || 'petición'}: ${it.asunto || it.subject}`.slice(0, 110), priority: 'alta', mode: 'borrador', received: it.radicado || todayStr(),
        input: text, steps: DEFAULT_STEPS.juridico, notes: `${it.motivo || ''}\nCorreo: ${it.url}`.trim(), auto: true, due: '', time: '', remind: '2880' };
      const dias = Number(it.plazoDias) || 15;
      t.legalDue = addBusinessDays(t.received, dias); t.due = addBusinessDays(t.received, Math.max(1, dias - 2));
      tasks.push(t); saveTasks();
      logEvent('juridico', `Empiezo el borrador de «${t.title}»`, true, 'vos');
      startNext('juridico');
    } else {
      const created = await dispatch(text, { auto: true, project: it.proyecto && projects.includes(it.proyecto) ? it.proyecto : '' });
      created.forEach(t => { t.notes = `${t.notes || ''}\nCorreo: ${it.url}`.trim(); flyBetween('archivo', t.agent); });
      saveTasks();
    }
    it.done = true; saveScan(k);
    refreshOffice(); renderPanel();
  }

  function findingsHtml(k) {
    const sc = office.scans[k];
    const head = `<div class="toolbar"><button class="btn btn-gold btn-sm" id="scanNow" ${office.status[k] ? 'disabled' : ''}>${office.status[k] ? 'Revisando…' : 'Revisar ahora'}</button>
      <span class="sub" style="margin:0">${sc ? 'Última revisión ' + esc(ago(sc.at)) : 'Aún no he revisado el correo.'}</span></div>`;
    if (!sc || !sc.items.length) return head + `<p class="sub">${sc ? 'No encontré nada pendiente.' : 'Toca «Revisar ahora»: leo tu correo en solo lectura y te digo qué hay.'}</p>`;
    const cards = sc.items.map((it, i) => {
      if (it.dismissed) return '';
      let meta = '', btn = '';
      if (k === 'juridico') {
        const urg = it.dias != null && it.dias <= 3;
        meta = `<span class="chip ${it.requiereRespuesta === false ? 'green' : urg ? 'red' : 'gold'}">${esc(it.tipo || 'Petición')}${it.requiereRespuesta === false ? ' · respondida' : ''}</span>
          ${it.vence ? `<span class="chip ${urg ? 'red' : ''}">Vence ${esc(fmtDate(it.vence))}${it.dias != null ? ` · ${it.dias < 0 ? 'vencida' : it.dias + ' días hábiles'}` : ''}</span>` : ''}
          ${it.radicado ? `<span class="chip">Recibida ${esc(fmtDate(it.radicado))}</span>` : ''}`;
        btn = it.requiereRespuesta === false ? '' : `<button class="btn btn-primary btn-sm" data-start="${i}" ${it.done ? 'disabled' : ''}>${it.done ? '✓ En borrador' : 'Iniciar respuesta'}</button>`;
      } else if (k === 'agenda') {
        meta = `<span class="chip gold">${esc(it.fecha ? fmtDate(it.fecha) : 'sin fecha')}${it.hora ? ' · ' + esc(it.hora) : ''}</span>${it.lugar ? `<span class="chip">${esc(it.lugar)}</span>` : ''}`;
        btn = `<button class="btn btn-primary btn-sm" data-start="${i}" ${it.done ? 'disabled' : ''}>${it.done ? '✓ Agendada' : 'Agregar a la agenda'}</button>`;
      } else {
        meta = `<span class="chip ${it.importancia === 'alta' ? 'red' : 'gold'}">${it.importancia === 'alta' ? 'Importante' : 'Atender'}</span>${AGENTS[it.agente] ? `<span class="chip">Sugiero: ${esc(AGENTS[it.agente].name)}</span>` : ''}`;
        btn = `<button class="btn btn-primary btn-sm" data-start="${i}" ${it.done ? 'disabled' : ''}>${it.done ? '✓ Enviado al equipo' : 'Enviar al equipo'}</button>`;
      }
      return `<div class="finding ${it.done ? 'done' : ''}">
        <b>${esc(k === 'agenda' ? (it.titulo || it.subject) : k === 'juridico' ? (it.asunto || it.subject) : it.subject)}</b>
        <small>${esc(k === 'juridico' && it.peticionario ? it.peticionario : it.from)} · ${esc(it.proyecto || '')}</small>
        <div class="t-meta">${meta}</div>
        <p>${esc(it.motivo || it.accion || '')}${it.accion && it.motivo ? ' ' + esc(it.accion) : ''}</p>
        <div class="toolbar">${btn}${it.url ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(it.url)}">Abrir en Gmail</a>` : ''}<button class="btn btn-ghost btn-sm" data-dismiss="${i}">Descartar</button></div>
      </div>`;
    }).join('');
    return head + cards;
  }
  function bindFindings(k, panel) {
    const sn = $('#scanNow', panel); if (sn) sn.onclick = () => runScan(k);
    panel.querySelectorAll('[data-start]').forEach(b => b.onclick = () => { b.disabled = true; startFromFinding(k, Number(b.dataset.start)); });
    panel.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => { office.scans[k].items[Number(b.dataset.dismiss)].dismissed = true; saveScan(k); renderPanel(); renderOfficeSide(); renderRooms(); });
  }

  // Revisión automática: solo si ya diste permiso a Gmail antes y la última revisión es vieja.
  function autoScans() {
    if (office.autoRunning || !HOST.mcp || !hasClaude() || !store.get('scanOk', false)) return;
    const old = k => !office.scans[k] || Date.now() - office.scans[k].at > 3 * 3600e3;
    office.autoRunning = true;
    (async () => { for (const k of ['juridico', 'archivo', 'agenda']) if (old(k)) await runScan(k); office.autoRunning = false; })();
  }

  function openAgent(k, force = false, tab = null) {
    office.open = !force && office.open === k ? null : k;
    office.tab = tab || (SCANS[k] && openFindings(k).length && !queueOf(k).length && !office.results[k] ? 'hallazgos' : 'trabajo');
    renderOffice(); renderPanel();
  }

  function renderPanel() {
    const panel = $('#panel'); if (!panel) return;
    const k = office.open;
    if (!k) { panel.hidden = true; return; }
    const a = AGENTS[k], st = agentStatus(k);
    panel.hidden = false;
    const tabNames = { trabajo: 'Trabajo', hallazgos: 'En el correo', actividad: 'Actividad', perfil: 'Perfil' };
    const tabList = ['trabajo', ...(SCANS[k] ? ['hallazgos'] : []), 'actividad', 'perfil'];
    if (!tabList.includes(office.tab)) office.tab = 'trabajo';
    const tabs = tabList.map(t => `<button class="ptab ${office.tab === t ? 'active' : ''}" data-tab="${t}">${tabNames[t]}${t === 'hallazgos' && openFindings(k).length ? ` <b class="tab-n">${openFindings(k).length}</b>` : ''}</button>`).join('');
    let body = '';
    if (office.tab === 'perfil') {
      body = `<p class="bio">${esc(a.bio)}</p>
        <h4>Responsabilidades</h4><ul>${a.resp.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <h4>Herramientas</h4><div class="tools">${a.tools.map(t => `<code>${esc(t)}</code>`).join('')}</div>
        <h4>Autonomía</h4><p class="sub">No envía, publica ni modifica nada sin tu visto bueno.</p>
        <h4>Motor</h4><span class="chip ${a.engine === 'ChatGPT' ? 'gold' : ''}">${esc(HOST_FRAME && a.engine === 'ChatGPT' ? 'Plantilla institucional' : a.engine)}</span>`;
    } else if (office.tab === 'actividad') {
      const mine = office.log.filter(e => e.agent === k || e.to === k);
      body = mine.length ? mine.map(e => `<div class="log-row ${e.ok ? '' : 'err'}"><time>${hhmmss(e.t)}</time><span>${e.ok ? '✔' : '⚠'}</span>${e.agent !== k ? `<b>${esc(who(e.agent))}:</b> ` : ''}${esc(e.text)}</div>`).join('') : '<div class="empty">Aún no tiene actividad.</div>';
    } else if (office.tab === 'hallazgos') {
      body = findingsHtml(k);
    } else {
      body = chatBody(k);
    }
    panel.innerHTML = `
      <header>
        <div class="p-avatar" style="background:${a.shirt}">${esc(a.name[0])}</div>
        <div><strong>${esc(a.name)}</strong><small>${esc(a.role)} · ${esc(ROOM_INFO[k].label)}</small>
          <span class="p-status"><span class="dot" style="background:${STATUS_DOT[st]}"></span>${STATUS_TXT[st]}</span></div>
        <button class="p-close" aria-label="Cerrar">×</button>
      </header>
      <nav class="ptabs">${tabs}</nav>
      <div class="p-body workspace">${body}</div>`;
    panel.querySelector('.p-close').onclick = () => { office.open = null; renderPanel(); renderOffice(); };
    panel.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { office.tab = b.dataset.tab; renderPanel(); });
    if (office.tab === 'trabajo') bindChat(k, panel);
    if (office.tab === 'hallazgos') bindFindings(k, panel);
  }

  function chatBody(k) {
    if (k === 'archivo') return `
      <p>Hola, soy Sofía. Reviso tu Gmail <b>solo en lectura</b>: las carpetas de cada proyecto, los pendientes y los logos adjuntos.</p>
      <div class="notice">Permiso usado: <code>gmail.readonly</code>. Con él no puedo enviar, responder, borrar ni marcar correos.</div>
      <p class="sub">${gmail.token ? `Conectada · ${gmail.labels.length} carpetas.` : 'Aún no estoy conectada.'} Logos guardados: ${logos.length}.</p>
      <button class="btn btn-primary" id="goMail">${gmail.token ? 'Abrir carpetas' : 'Conectar Gmail (solo lectura)'}</button>`;
    if (k === 'agenda') {
      const next = tasks.filter(t => t.status !== 'done' && t.due).sort((x, y) => (x.due + x.time).localeCompare(y.due + y.time)).slice(0, 6);
      const aq = queueOf('agenda');
      return `<p>Soy Andrés. Te aviso antes de cada vencimiento y paso tus pendientes al calendario.</p>
        ${aq.length ? `<h4>Por agendar (${aq.length})</h4>${aq.map(t => `<div class="mini-task"><div><b>${esc(t.title)}</b><small>${esc(t.project)}${t.due ? ' · ' + esc(fmtDate(t.due)) + (t.time ? ' ' + esc(t.time) : '') : ' · sin fecha'}</small></div>
          <div>${t.due ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(googleCalendarUrl(t))}">📅</a>` : ''}<button class="btn btn-gold btn-sm" data-agendado="${esc(t.id)}">✓</button></div></div>`).join('')}<h4>Próximos vencimientos</h4>` : ''}
        ${next.map(t => `<div class="mini-task"><div><b>${esc(t.title)}</b><small>${esc(t.project)} · ${esc(fmtDate(t.due))}${t.time ? ' ' + esc(t.time) : ''}</small></div>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${esc(googleCalendarUrl(t))}">📅</a></div>`).join('') || '<div class="empty">No hay pendientes con fecha.</div>'}
        <div class="toolbar" style="margin-top:10px">
          <button class="btn btn-gold btn-sm" id="agIcs">Exportar todo (.ics)</button>
          ${!HOST_FRAME && 'Notification' in window && Notification.permission !== 'granted' ? '<button class="btn btn-ghost btn-sm" id="agNotif">🔔 Activar avisos</button>' : ''}
        </div>`;
    }
    const r = office.results[k];
    const working = agentStatus(k) === 'trabajando';
    const q = queueOf(k);
    const queue = q.length ? `<h4>Bandeja (${q.length})</h4>${q.map(t => `<div class="mini-task"><div><b>${esc(t.title)}</b><small>${esc(t.project)}${t.due ? ' · vence ' + esc(fmtDate(t.due)) : ''}${t.mode === 'revision' ? ' · revisión' : ''}</small></div>
        <button class="btn btn-gold btn-sm" data-run="${esc(t.id)}" ${!canRun(k) || working ? 'disabled' : ''}>Procesar</button></div>`).join('')}` : '';
    const needKey = !canRun(k) ? `<div class="notice">${HOST_FRAME ? 'Claude se está conectando a esta página…' : 'Agrega tu clave de Claude en Ajustes para que pueda trabajar.'}</div>` : '';
    let result = '';
    if (r) {
      result = `<h4>Última entrega</h4>` + (r.type === 'image'
        ? (r.dataUrl ? `<img class="result-img" src="${r.dataUrl}" alt="Pieza generada">` : '<div class="empty">La imagen no se guarda al recargar; vuelve a generarla.</div>')
        : `<div class="output">${esc(r.text || '')}</div>`) +
        `<div class="toolbar" style="margin-top:8px">
          ${r.type === 'image' && r.dataUrl ? '<button class="btn btn-gold btn-sm" id="rDown">⬇️ Descargar PNG</button>' : ''}
          ${r.type !== 'image' ? '<button class="btn btn-ghost btn-sm" id="rCopy">Copiar</button>' : ''}
          ${k === 'comunicado' && r.type !== 'image' ? '<button class="btn btn-gold btn-sm" id="rDesign">Pasar a Mateo (diseño)</button>' : ''}
          <button class="btn btn-ghost btn-sm" id="rApprove">✓ Aprobar</button>
        </div>`;
    }
    return `${needKey}${queue}${result}
      <details class="manual" ${q.length || r ? '' : 'open'}><summary>Asignar misión manual</summary>
      <form id="agentForm">${agentForm(k)}
        <button class="btn btn-primary" id="btnRun" ${working ? 'disabled' : ''}>${working ? 'Trabajando…' : 'Asignar misión'}</button>
      </form></details>`;
  }

  function bindChat(k, panel) {
    const gm = $('#goMail', panel); if (gm) gm.onclick = () => { setView('correo'); if (!gmail.token) connectGmail(); };
    const ai = $('#agIcs', panel); if (ai) ai.onclick = () => { downloadIcs(tasks.filter(t => t.status !== 'done' && t.due), 'pendientes-alianza.ics'); logEvent('agenda', 'Exportó los pendientes al calendario (.ics)'); renderLog(); };
    const an = $('#agNotif', panel); if (an) an.onclick = async () => { await Notification.requestPermission(); renderPanel(); };
    panel.querySelectorAll('[data-agendado]').forEach(b => b.onclick = () => {
      const t = tasks.find(x => x.id === b.dataset.agendado); t.status = 'done'; t.doneAt = Date.now(); saveTasks();
      logEvent('agenda', `Agendó «${t.title}»`); refreshOffice(); renderView();
    });
    panel.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
      const t = tasks.find(x => x.id === b.dataset.run); runMission(k, fdFromTask(t), t);
    });
    const form = $('#agentForm', panel); if (!form) return;
    const r = office.results[k];
    if (r) {
      const rc = $('#rCopy', panel); if (rc) rc.onclick = () => navigator.clipboard.writeText(r.text).then(() => toast('Copiado.'));
      const rd = $('#rDown', panel); if (rd) rd.onclick = () => saveFile(`pieza-${(r.project || 'alianza').replace(/\W+/g, '-').toLowerCase()}.png`, dataUrlToBlob(r.dataUrl));
      const rs = $('#rDesign', panel); if (rs) rs.onclick = () => {
        const titulo = (r.text.match(/T[ÍI]TULO:\s*(.+)/i) || [])[1] || '';
        const texto = ((r.text.match(/MENSAJE:\s*([\s\S]*?)(?:\n\s*FIRMA:|REGISTRO DE TRAZABILIDAD)/i) || [])[1] || r.text).trim();
        store.set('agent.disenador', { ...store.get('agent.disenador', {}), project: r.project, titulo, texto });
        logEvent('comunicado', `Te paso el texto para la pieza de ${r.project}`, true, 'disenador'); flyBetween('comunicado', 'disenador');
        openAgent('disenador');
      };
      $('#rApprove', panel).onclick = async () => {
        const t = tasks.find(x => x.id === r.taskId);
        await approveItem({ id: r.repoId, taskId: r.taskId, agent: k, title: t ? t.title : AGENTS[k].role });
        delete office.results[k]; saveResults(); refreshOffice();
      };
    }
    if (k === 'disenador') {
      const paintLogos = () => {
        const proj = form.project.value;
        const own = logos.filter(l => l.project === proj || l.project === 'General / AGI');
        $('#logoPick', panel).innerHTML = own.length
          ? own.map(l => `<div class="logo-tile selected" title="${esc(l.project)}"><img src="${l.dataUrl}" alt=""><div>${esc(l.name)}</div></div>`).join('')
          : '<div class="sub" style="grid-column:1/-1">Sin logos guardados. Pídeselos a Sofía (Archivo) o súbelos aquí.</div>';
      };
      form.project.onchange = paintLogos; paintLogos();
      form.logoFile.onchange = () => {
        const f = form.logoFile.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = async () => { await addLogo({ name: f.name, project: form.project.value, dataUrl: rd.result }); paintLogos(); };
        rd.readAsDataURL(f);
      };
    }
    form.onsubmit = e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      delete fd.logoFile; fd.useAI = !!form.useAI?.checked && hasOpenAI();
      store.set('agent.' + k, fd);
      runMission(k, fd);
    };
  }

  async function runMission(k, fd, task = null) {
    const a = AGENTS[k];
    const project = fd.project || task?.project || 'General / AGI';
    const brief = task ? task.title : (fd.tema || fd.titulo || (fd.idea || fd.peticion || fd.mail || '').slice(0, 50) || a.role);
    if (!task) {
      task = { id: uid(), created: Date.now(), title: brief, project, status: 'doing', priority: 'media', due: '', time: '', remind: '', agent: k,
        notes: `Misión asignada a ${a.name} (${a.role}).`, input: fd.idea || fd.peticion || fd.mail || fd.texto || '', steps: DEFAULT_STEPS[k] };
      if (k === 'juridico') {
        task.received = fd.radicado || todayStr(); task.legalDue = addBusinessDays(task.received, 15);
        task.due = addBusinessDays(task.received, 13); task.remind = '2880'; task.priority = 'alta';
      }
      tasks.push(task);
    }
    // La misión queda en el tablero: En curso → En revisión (tu aprobación) → Hecho.
    task.status = 'doing'; saveTasks();
    office.status[k] = 'trabajando';
    office.activity[k] = { verb: { comunicado: 'ESCRIBE', correo: 'ESCRIBE', juridico: fd.modo === 'revision' ? 'REVISA' : 'REDACTA', disenador: 'DISEÑA', planificador: 'PLANEA' }[k] || 'TRABAJA', text: brief, t: Date.now() };
    logEvent(k, `Empiezo «${brief}»`);
    refreshOffice();
    try {
      const type = k === 'disenador' ? 'image' : 'text';
      if (type === 'image' && fd.request && !fd.texto && hasClaude()) {
        office.activity[k] = { verb: 'PIENSA', text: 'el texto de la pieza', t: Date.now() }; refreshOffice();
        const raw = await askClaude(COMUNICADO_SYSTEM + '\nAhora solo necesito el texto de un flyer. Responde SOLO JSON: {"titulo":"máximo 6 palabras","texto":"2 a 4 líneas cortas, puede usar viñetas •"}', `Proyecto: ${project}\nPedido: ${fd.request}`);
        try { const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); fd.titulo = j.titulo; fd.texto = j.texto; } catch { fd.titulo = brief; fd.texto = fd.request; }
        office.activity[k] = { verb: 'DISEÑA', text: fd.titulo, t: Date.now() }; refreshOffice();
      }
      if (type === 'image' && !fd.texto) { fd.titulo = fd.titulo || brief; fd.texto = fd.request || ''; }
      const content = type === 'image' ? await runDesigner(fd) : await runWriter(k, fd);
      const repoId = uid();
      await repo.put({ id: repoId, date: Date.now(), agent: k, project, type, title: brief, content, taskId: task.id, status: 'borrador' })
        .catch(() => toast('No se pudo guardar en el repositorio.'));
      office.results[k] = type === 'image' ? { type, dataUrl: content, project, taskId: task.id, repoId } : { type, text: content, project, taskId: task.id, repoId };
      saveResults();
      if (type === 'text') task.notes = `${task.notes || ''}\n\n${content.slice(0, 2000)}`.trim();
      task.status = 'review'; task.auto = false; saveTasks();
      logEvent(k, `Listo: «${brief}». Espera tu aprobación`, true, 'vos');
      office.flash[k] = { title: brief, sub: 'Espera tu OK', t: Date.now() };
      setTimeout(() => refreshOffice(), 9500);
    } catch (err) {
      task.status = 'todo'; task.auto = false; task.notes = `${task.notes || ''}\n\nNo se completó: ${err.message}`; saveTasks();
      logEvent(k, `No pudo completar «${brief}»: ${err.message}`, false);
      toast('⚠️ ' + err.message);
    }
    delete office.status[k];
    refreshOffice();
    if (['hoy', 'tablero', 'repo'].includes(ui.view)) renderView();
    startNext(k);
  }

  views.agencia.after = () => { renderOffice(); renderPanel(); autoScans(); };

  function runWriter(key, fd) {
    const fecha = new Date().toLocaleDateString('es-CO', { timeZone: TZ });
    if (key === 'comunicado') {
      return askClaude(COMUNICADO_SYSTEM, `Fecha: ${fecha}\nNombre del delegado: ${settings.delegate || '(sin definir)'}\nProyecto / conjunto: ${fd.project}\nTema: ${fd.tema}\nIdea general (notas en bruto):\n${fd.idea}`);
    }
    if (key === 'correo') {
      return askClaude('Eres el asistente de la Coordinación de Proyectos de Alianza Grupo Inmobiliario. Redacta un BORRADOR de respuesta de correo en español de Colombia: cordial, profesional, breve y concreto. Comienza con "Cordial saludo," y termina con "Cordialmente," seguido de la firma del delegado. Incluye una línea "Asunto:" sugerida. No inventes datos: si falta información, déjala entre corchetes.',
        `Delegado: ${settings.delegate || '[nombre]'}\nProyecto: ${fd.project}\nCorreo recibido:\n${fd.mail}\n\nLo que quiero responder:\n${fd.idea}`);
    }
    if (key === 'juridico') {
      const rad = fd.radicado || todayStr();
      const sys = `Eres Daniela, asesora jurídica de la Coordinación de Proyectos de Alianza Grupo Inmobiliario, administradora de propiedad horizontal en Colombia. Conoces el artículo 23 de la Constitución, la Ley 1755 de 2015 (derecho de petición: 15 días hábiles en general, 10 para documentos e información, 30 para consultas), la Ley 675 de 2001 (propiedad horizontal) y la Ley 1581 de 2012 (datos personales). Lo que entregas es un BORRADOR para revisión humana, no un concepto jurídico definitivo. No inventes hechos, cifras ni artículos: si falta información, márcala entre [corchetes]. Español de Colombia, tono formal, respetuoso y claro.`;
      const plazos = `Radicado: ${rad}. Vencimientos calculados en días hábiles: 10 días → ${addBusinessDays(rad, 10)}; 15 días → ${addBusinessDays(rad, 15)}; 30 días → ${addBusinessDays(rad, 30)}.`;
      if (fd.modo === 'revision') {
        return askClaude(sys + `\nRevisa el borrador del delegado frente a la petición. Entrega:\n1) VEREDICTO: Listo para enviar / Requiere ajustes / Rehacer.\n2) ¿RESPONDE CADA PUNTO?: lista punto → Sí / No / Parcial.\n3) PLAZO: tipo de petición y fecha límite.\n4) OBSERVACIONES: fondo, forma, tono, datos personales, soportes.\n5) VERSIÓN CORREGIDA completa.`,
          `${plazos}\nProyecto: ${fd.project}\nDelegado que revisa: ${settings.delegate || '[nombre]'}\n\nPETICIÓN:\n${fd.peticion}\n\nBORRADOR DEL DELEGADO:\n${fd.borrador || '(si no viene aparte, búscalo dentro del texto de la petición)'}`);
      }
      return askClaude(sys + `\nEntrega:\n1) CLASIFICACIÓN: tipo de petición, plazo legal y fecha límite.\n2) PUNTOS SOLICITADOS (lista numerada).\n3) BORRADOR DE RESPUESTA formal: ciudad y fecha, destinatario, referencia, respuesta punto por punto, cierre, firma "Administración – ${fd.project} – Alianza Grupo Inmobiliario".\n4) SOPORTES Y ANEXOS que hay que reunir o verificar.`,
        `${plazos}\nProyecto: ${fd.project}\n\nPETICIÓN RECIBIDA:\n${fd.peticion}`);
    }
    if (fd.taskMode) {
      return askClaude('Eres Valeria, coordinadora de la Coordinación de Proyectos de Alianza Grupo Inmobiliario (propiedad horizontal, Colombia). Para la gestión indicada entrega un plan breve: 1) Objetivo en una frase. 2) Pasos concretos numerados con responsable sugerido. 3) Documentos o datos que se necesitan. 4) Riesgos o alertas. 5) Si conviene, un mensaje corto para el responsable. Usa viñetas y sé concreta.',
        `Hoy es ${fecha}. Proyecto: ${fd.project}. Gestión: ${fd.taskTitle}\nDetalle:\n${fd.idea}`);
    }
    const open = tasks.filter(t => t.status !== 'done')
      .map(t => `- [${t.project}] ${t.title} | prioridad ${t.priority} | ${t.due ? 'vence ' + t.due + (t.time ? ' ' + t.time : '') : 'sin fecha'} | estado ${STATUS[t.status]}`).join('\n');
    return askClaude('Eres el asistente de planeación de la Coordinación de Proyectos de Alianza Grupo Inmobiliario. Con la lista de pendientes, entrega: 1) Las 3 prioridades del día y por qué. 2) Un plan por bloques horarios (8:00 a 17:00). 3) Pendientes que conviene delegar o reprogramar. 4) Alertas de vencimientos. Sé breve y usa viñetas.',
      `Hoy es ${fecha}.\nContexto: ${fd.idea || 'ninguno'}\n\nPendientes:\n${open}`);
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

  // ---------------------------------------------------------------- Despacho: barra principal → agente
  const AI_AGENTS = ['comunicado', 'correo', 'juridico', 'planificador', 'disenador'];
  const DEFAULT_STEPS = {
    comunicado: ['Confirmar datos clave (fecha, hora, lugar)', 'Tomás redacta el comunicado', 'Revisar y aprobar el texto', 'Pasar a Mateo si requiere pieza gráfica', 'Publicar en el canal de WhatsApp del conjunto'],
    correo: ['Leer el correo completo y anexos', 'Lucía prepara el borrador de respuesta', 'Completar los datos entre [corchetes]', 'Aprobar y enviar desde tu Gmail'],
    juridico: ['Verificar fecha de radicación y plazo legal', 'Reunir soportes (actas, contratos, estados de cuenta)', 'Daniela redacta o revisa el borrador', 'Revisión de jefatura antes de firmar', 'Enviar y archivar la constancia de envío'],
    disenador: ['Confirmar texto aprobado', 'Verificar logos originales del proyecto', 'Mateo diseña la pieza', 'Aprobar y publicar'],
    agenda: ['Confirmar fecha, hora y asistentes', 'Agregar al calendario', 'Preparar la información previa'],
    planificador: ['Definir el responsable', 'Fijar fecha de entrega', 'Hacer seguimiento']
  };
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function heuristicClassify(text) {
    const n = norm(text);
    let agente = 'planificador', modo = null, plazoDias = null;
    if (/derecho de peticion|derechos de peticion|tutela|\bpqr|queja formal|peticion/.test(n)) {
      agente = 'juridico';
      modo = /revis|borrador (del|de la|de) delegad|delegad[oa] envi|proyect(o|ó) de respuesta/.test(n) ? 'revision' : 'borrador';
      plazoDias = /copia|documento|informacion/.test(n) ? 10 : /consulta/.test(n) ? 30 : 15;
    } else if (/comunicad|circular|aviso a la comunidad|whatsapp|informar a (los )?residentes/.test(n)) agente = 'comunicado';
    else if (/pieza|flyer|afiche|banner|diseñ|disen|grafic|imagen|post /.test(n)) agente = 'disenador';
    else if (/reunion|visita|comite|asamblea|agenda|recordar|recordatorio|cita\b|meet/.test(n)) agente = 'agenda';
    else if (/responder|dar respuesta|contestar|asunto:|^de: |^from: /m.test(n)) agente = 'correo';
    const first = String(text).split('\n').map(s => s.trim()).find(Boolean) || 'Pendiente';
    const subj = (String(text).match(/asunto:\s*(.+)/i) || [])[1];
    return {
      titulo: (subj || first).replace(/^[-*•\d.)\s]+/, '').slice(0, 90),
      agente, modo, plazoDias, proyecto: matchProject(text),
      prioridad: agente === 'juridico' || /urgente|prioridad|hoy|inmediato/.test(n) ? 'alta' : 'media',
      vence: null, hora: null, pasos: DEFAULT_STEPS[agente], resumen: ''
    };
  }

  async function claudeClassify(text) {
    const sys = `Eres Valeria, coordinadora del equipo de agentes de la Coordinación de Proyectos de Alianza Grupo Inmobiliario (administración de propiedad horizontal en Colombia). Recibes pendientes en bruto (notas, listas o correos pegados) y los asignas.
Agentes: "comunicado" (Tomás: comunicados y circulares para la comunidad), "correo" (Lucía: responder correos), "juridico" (Daniela: derechos de petición, tutelas, PQR formales; redacta la respuesta o revisa el borrador que envió un delegado), "disenador" (Mateo: piezas gráficas), "agenda" (Andrés: reuniones, visitas, citas y recordatorios), "planificador" (Valeria: gestiones generales del coordinador).
Proyectos válidos: ${projects.join(', ')}.
Si el texto trae varios pendientes distintos, sepáralos. Responde SOLO con JSON válido, sin texto adicional:
{"actividades":[{"titulo":"máx 80 caracteres, empieza con verbo","agente":"clave","proyecto":"uno de la lista o General / AGI","prioridad":"alta|media|baja","vence":"YYYY-MM-DD o null","hora":"HH:MM o null","modo":"borrador|revision|null (solo jurídico)","plazoDias":"10|15|30|null (solo jurídico, Ley 1755 de 2015)","radicado":"YYYY-MM-DD o null (fecha de recibido de la petición)","pasos":["3 a 5 pasos concretos de cómo proceder"],"resumen":"una frase","texto":"fragmento del texto original que corresponde a esta actividad"}]}
Hoy es ${todayStr()}.`;
    const raw = await askClaude(sys, text);
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return (json.actividades || []).filter(a => AGENTS[a.agente]);
  }

  function splitList(text) {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const bullets = lines.filter(l => /^([-*•]|\d+[.)])\s+/.test(l));
    return bullets.length >= 2 && bullets.length === lines.length ? bullets : [text];
  }

  async function dispatch(text, opts = {}) {
    let acts;
    let via = 'reglas';
    if (hasClaude()) {
      try { acts = await claudeClassify(text); via = 'Claude'; } catch (e) { console.warn(e); }
    }
    if (!acts || !acts.length) acts = splitList(text).map(t => ({ ...heuristicClassify(t), texto: t }));
    const created = [];
    for (const a of acts) {
      const agent = AGENTS[a.agente] ? a.agente : 'planificador';
      const project = opts.project || (projects.includes(a.proyecto) ? a.proyecto : matchProject(a.texto || text));
      const t = {
        id: uid(), created: Date.now(), status: 'todo', agent, project,
        title: a.titulo || 'Pendiente', priority: a.prioridad || 'media',
        due: opts.due || a.vence || '', time: a.hora || '', remind: '',
        steps: (a.pasos && a.pasos.length ? a.pasos : DEFAULT_STEPS[agent]).slice(0, 6),
        input: a.texto || text, notes: a.resumen || '', mode: a.modo || null, auto: !!opts.auto
      };
      if (agent === 'juridico') {
        t.received = a.radicado || todayStr();
        const dias = Number(a.plazoDias) || 15;
        t.legalDue = addBusinessDays(t.received, dias);
        // Fecha interna: 2 días hábiles antes del vencimiento legal.
        if (!t.due) t.due = addBusinessDays(t.received, Math.max(1, dias - 2));
        t.notes = `${t.notes}\nPlazo legal: ${dias} días hábiles (Ley 1755 de 2015). Vence el ${fmtDate(t.legalDue)}. Radicado: ${fmtDate(t.received)}.`.trim();
        t.priority = 'alta';
      }
      if (t.due && !t.remind) t.remind = agent === 'agenda' ? '1440' : agent === 'juridico' ? '2880' : '1440';
      tasks.push(t); created.push(t);
      logEvent('planificador', `Te asigno «${t.title}»`, true, agent);
    }
    saveTasks();
    ui.receipts = created.map(t => t.id);
    if (created.length) setBanner(`Entra: «${created[0].title}» → ${AGENTS[created[0].agent].name}${created.length > 1 ? ` y ${created.length - 1} más` : ''}`);
    created.forEach((t, i) => setTimeout(() => { flyBetween('entrada', 'planificador'); setTimeout(() => flyBetween('planificador', t.agent), 700); }, i * 400));
    toast(`Valeria repartió ${created.length} ${created.length === 1 ? 'pendiente' : 'pendientes'} (${via}).`);
    for (const t of created) if (t.auto) startNext(t.agent);
    return created;
  }

  const queueOf = k => tasks.filter(t => t.agent === k && t.status === 'todo');
  const canRun = k => k === 'disenador' || (AI_AGENTS.includes(k) && hasClaude());

  function fdFromTask(t) {
    const k = t.agent;
    if (k === 'comunicado') return { project: t.project, tema: t.title, idea: t.input };
    if (k === 'correo') return { project: t.project, mail: t.input, idea: (t.steps || []).join('; ') || 'Proponer la respuesta adecuada' };
    if (k === 'juridico') return { project: t.project, modo: t.mode || 'borrador', peticion: t.input, borrador: '', radicado: t.received || todayStr() };
    if (k === 'disenador') return { project: t.project, titulo: '', texto: '', request: t.input || t.title, escena: '', useAI: hasOpenAI() };
    return { idea: t.input, taskTitle: t.title, taskMode: true, project: t.project };
  }

  function startNext(k) {
    if (office.status[k] === 'trabajando' || !canRun(k)) return;
    const next = queueOf(k).find(t => t.auto);
    if (next) runMission(k, fdFromTask(next), next);
  }

  function cmdbarHtml() {
    const receipts = (ui.receipts || []).map(id => tasks.find(t => t.id === id)).filter(Boolean);
    return `<form id="cmdForm" class="cmd">
        <div class="cmd-main">
          <span class="cmd-ico">✦</span>
          <textarea name="text" rows="1" placeholder="${innerWidth < 600 ? 'Deja un pendiente o un correo…' : 'Deja aquí un pendiente o pega un correo… Valeria lo asigna al agente indicado'}"></textarea>
          <button class="btn btn-gold" id="cmdSend">Enviar</button>
        </div>
        <div class="cmd-extra">
          <select name="project"><option value="">Proyecto: detectar</option>${projects.map(p => `<option>${esc(p)}</option>`).join('')}</select>
          <label>Vence <input type="date" name="due"></label>
          <label class="cmd-check"><input type="checkbox" name="auto" ${store.get('autoRun', true) ? 'checked' : ''}> Que el agente empiece de inmediato</label>
        </div>
      </form>
      ${receipts.length ? `<div class="receipts">${receipts.map(t => `
        <div class="receipt">
          <div class="r-head"><span class="p-avatar sm" style="background:${AGENTS[t.agent].shirt}">${esc(AGENTS[t.agent].name[0])}</span>
            <div><b>${esc(t.title)}</b><small>${esc(AGENTS[t.agent].name)} · ${esc(AGENTS[t.agent].role)} · ${esc(t.project)}${t.due ? ' · vence ' + esc(fmtDate(t.due)) : ''}</small></div></div>
          <ol>${(t.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>`).join('')}
        <div class="toolbar"><button class="btn btn-ghost btn-sm" id="rcOffice">Ver en la oficina</button><button class="btn btn-ghost btn-sm" id="rcClose">Cerrar</button></div></div>` : ''}`;
  }

  function renderCmdbar() {
    const bar = $('#cmdbar');
    bar.hidden = ui.view === 'ajustes';
    if (bar.hidden) return;
    bar.innerHTML = cmdbarHtml();
    const f = $('#cmdForm', bar), ta = f.text;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; };
    ta.oninput = grow;
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); f.requestSubmit(); } };
    f.auto.onchange = () => store.set('autoRun', f.auto.checked);
    f.onsubmit = async e => {
      e.preventDefault();
      const text = ta.value.trim(); if (!text) return ta.focus();
      const btn = $('#cmdSend', bar); btn.disabled = true; btn.textContent = 'Asignando…';
      await dispatch(text, { project: f.project.value, due: f.due.value, auto: f.auto.checked });
      render();
    };
    const ro = $('#rcOffice', bar); if (ro) ro.onclick = () => { ui.receipts = []; setView('agencia'); };
    const rc = $('#rcClose', bar); if (rc) rc.onclick = () => { ui.receipts = []; renderCmdbar(); };
  }

  // Recomendaciones de Valeria: qué hacer primero y cómo.
  function nextActions() {
    const today = todayStr(), soon = addDays(today, 3);
    const score = t => (t.status === 'review' ? -1 : 0) + (t.due && t.due < today ? 0 : t.due === today ? 1 : t.due && t.due <= soon ? 2 : t.priority === 'alta' ? 3 : 5);
    return tasks.filter(t => t.status !== 'done').sort((a, b) => score(a) - score(b) || (a.due || '9').localeCompare(b.due || '9')).slice(0, 3);
  }
  function howTo(t) {
    if (t.status === 'review') return 'Revisar la entrega del agente y aprobarla.';
    if (t.status === 'todo' && t.agent && canRun(t.agent) && t.agent !== 'planificador') return `${AGENTS[t.agent].name} puede empezar: asígnale la misión desde la oficina.`;
    return (t.steps && t.steps[0]) || (DEFAULT_STEPS[t.agent] || DEFAULT_STEPS.planificador)[0];
  }

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
    for (const [k, r] of Object.entries(office.results)) if (r.repoId === item.id) delete office.results[k];
    saveResults();
    logEvent(item.agent, `Entrega aprobada: «${item.title}»`);
    toast('Aprobado: queda en el repositorio y la tarea pasa a Hecho.');
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
    form.agent.innerHTML = '<option value="">Yo (coordinación)</option>' + Object.entries(AGENTS).map(([k, a]) => `<option value="${k}">${esc(a.name)} · ${esc(a.role)}</option>`).join('');
    for (const k of ['title', 'project', 'status', 'priority', 'due', 'time', 'remind', 'notes', 'agent']) form[k].value = t[k] ?? '';
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

  // Las tareas creadas antes de la oficina reciben responsable y pasos sugeridos.
  if (!store.get('migr.agents', false)) {
    tasks.forEach(t => {
      if (t.agent !== undefined || t.status === 'done') return;
      const c = heuristicClassify(t.title);
      t.agent = c.agente; t.steps = c.pasos; t.input = t.input || t.notes || t.title;
      if (c.agente === 'juridico') t.mode = 'borrador';
    });
    saveTasks(); store.set('migr.agents', true);
  }
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
