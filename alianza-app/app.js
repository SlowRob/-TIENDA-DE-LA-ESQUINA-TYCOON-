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
    tasks = SEED_TASKS.map(t => ({ id: uid(), status: 'todo', created: Date.now(), due: '', time: '', remind: '', ...t }));
    store.set('tasks', tasks);
  }
  let projects = store.get('projects', DEFAULT_PROJECTS);
  let settings = store.get('settings', {
    claudeKey: '', claudeModel: 'claude-sonnet-5-5',
    openaiKey: '', openaiModel: 'gpt-image-1',
    googleClientId: '', delegate: ''
  });
  let logos = store.get('logos', []); // [{name, project, dataUrl}]
  const ui = { view: 'hoy', filterProject: '', search: '', agent: 'comunicado', mailLabel: null };
  const saveTasks = () => store.set('tasks', tasks);

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
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Pendiente: ' + t.title, { body });
        }
        toast('⏰ ' + t.title);
        t.notified = true; changed = true;
      }
    });
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
      <div class="toolbar" style="margin-top:12px">
        <button class="btn btn-ghost btn-sm" id="btnIcsAll">📅 Agregar pendientes al calendario (.ics)</button>
        ${'Notification' in window && Notification.permission !== 'granted' ? '<button class="btn btn-ghost btn-sm" id="btnNotif">🔔 Activar recordatorios</button>' : ''}
      </div>
      ${overdue.length ? section('⚠️ Vencidas', overdue, '') : ''}
      ${section('Hoy', dueToday, 'Nada vence hoy.')}
      ${section('Próximos 7 días', upcoming, 'Sin pendientes con fecha esta semana.')}
      ${section('Sin fecha', noDate, 'Todo tiene fecha. ¡Bien!')}
    `;
  };
  views.hoy.after = root => {
    bindTaskEvents(root);
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

  function connectGmail() {
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
      const { threads = [] } = await gmailGet(`threads?labelIds=${encodeURIComponent(id)}&maxResults=20`);
      gmail.threads = await Promise.all(threads.map(async th => {
        const d = await gmailGet(`threads/${th.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
        const last = d.messages[d.messages.length - 1];
        const h = n => (last.payload.headers.find(x => x.name === n) || {}).value || '';
        return { id: th.id, subject: h('Subject') || '(sin asunto)', from: h('From'), date: h('Date'), snippet: decodeEntities(th.snippet || last.snippet || '') };
      }));
    } catch (e) { toast(e.message); }
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
        <p>Conecta tu Gmail para ver las carpetas de cada proyecto, detectar pendientes y tomar los logos adjuntos.</p>
        <div class="notice">La app pide únicamente el permiso <b>gmail.readonly</b>: puede <b>leer</b>, pero Google no le permite enviar, responder, borrar, archivar ni marcar correos. Nada cambia en tu buzón.</div>
        <button class="btn btn-primary" id="btnGmail">Conectar Gmail (solo lectura)</button>
      </div>`;
    const label = gmail.labels.find(l => l.id === ui.mailLabel);
    const folders = gmail.labels.map(l => `<div class="folder ${l.id === ui.mailLabel ? 'active' : ''}" data-label="${esc(l.id)}">${esc(l.name)}</div>`).join('');
    let right = '<div class="empty">Elige una carpeta.</div>';
    if (label) {
      const cands = gmail.logoCandidates.map((c, i) => `<div class="logo-tile" data-cand="${i}"><img src="${c.dataUrl}" alt=""><div>${esc(c.name)}</div><button class="btn btn-gold btn-sm" style="margin-top:6px">Usar como logo</button></div>`).join('');
      right = `
        <div class="toolbar"><h2 style="margin:0">${esc(label.name)}</h2><span class="spacer"></span>
          <button class="btn btn-ghost btn-sm" id="btnLogos">🖼️ Buscar logos en esta carpeta</button></div>
        ${cands ? `<h2>Imágenes encontradas</h2><div class="logo-grid">${cands}</div>` : ''}
        ${gmail.loading ? '<div class="empty">Cargando…</div>' : ''}
        <div class="card" style="padding:0">${gmail.threads.map(t => `
          <div class="mail-item">
            <div class="subj">${esc(t.subject)}</div>
            <div class="t-meta">${esc(t.from)} · ${esc(t.date)}</div>
            <div class="snip">${esc(t.snippet)}</div>
            <button class="btn btn-ghost btn-sm" data-totask="${esc(t.id)}">+ Crear tarea</button>
            <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${esc(t.id)}">Abrir en Gmail</a>
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

  function addLogo(logo) {
    logos = logos.filter(l => !(l.project === logo.project && l.name === logo.name));
    logos.push(logo);
    if (!store.set('logos', logos)) logos.pop();
    else toast(`Logo guardado para ${logo.project}. Se usará sin modificaciones.`);
  }

  // ---------------------------------------------------------------- Agencia (IA)
  const AGENTS = {
    comunicado: { ico: '✍️', name: 'Redactor de comunicados', engine: 'Claude', desc: 'Comunicados cortos para WhatsApp con el tono de Alianza y bloque de trazabilidad.' },
    correo: { ico: '📨', name: 'Redactor de respuestas', engine: 'Claude', desc: 'Borradores de respuesta a correos. Tú los copias y envías; la app nunca envía nada.' },
    planificador: { ico: '🗓️', name: 'Planificador del día', engine: 'Claude', desc: 'Ordena tus pendientes por prioridad y te propone el plan de la jornada.' },
    disenador: { ico: '🎨', name: 'Diseñador de piezas', engine: 'ChatGPT', desc: 'Flyer con la paleta institucional y los logos originales, sin alterarlos.' }
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
    if (key === 'planificador') return `
      <p class="sub">Usará tus ${tasks.filter(t => t.status !== 'done').length} pendientes abiertos.</p>
      <label>Contexto de hoy (opcional)<textarea name="idea" rows="3" placeholder="Tengo comité a las 3 p. m., visita de obra en la mañana…">${esc(last.idea)}</textarea></label>`;
    return `
      <label>Proyecto<select name="project">${projectOptions(last.project)}</select></label>
      <label>Título de la pieza<input name="titulo" value="${esc(last.titulo)}"></label>
      <label>Texto de la pieza<textarea name="texto" rows="5">${esc(last.texto)}</textarea></label>
      <label>Imagen de fondo (ChatGPT)<input name="escena" placeholder="Ej: fachada de conjunto residencial moderno al atardecer" value="${esc(last.escena)}"></label>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="useAI" style="width:auto;margin:0" ${last.useAI === false ? '' : 'checked'}> Generar imagen con ChatGPT (sin IA se usa la plantilla institucional)</label>
      <div class="notice">Regla absoluta: los logos se colocan <b>tal como son</b> (sin estirar, recolorear ni recortar). La IA solo crea la imagen de fondo.</div>
      <h2>Logos de ${esc(last.project || projects[0])}</h2>
      <div class="logo-grid" id="logoPick"></div>
      <label style="margin-top:10px">Subir logo desde el equipo<input type="file" name="logoFile" accept="image/*"></label>`;
  }

  views.agencia = () => `
    <h1>Agencia</h1><p class="sub">Cada agente se encarga de una actividad. Tú das la instrucción; nada se publica ni se envía sin tu aprobación.</p>
    <div class="gold-line"></div>
    <div class="grid agents">${Object.entries(AGENTS).map(([k, a]) => `
      <div class="card agent ${k === ui.agent ? 'active' : ''}" data-agent="${k}">
        <div class="ico">${a.ico}</div><h3>${a.name}</h3><p>${a.desc}</p>
        <div class="engine"><span class="chip ${a.engine === 'Claude' ? '' : 'gold'}">${a.engine}</span></div>
      </div>`).join('')}</div>
    <div class="card workspace" style="margin-top:12px">
      <h2 style="margin-top:0">${AGENTS[ui.agent].ico} ${AGENTS[ui.agent].name}</h2>
      <form id="agentForm">${agentForm(ui.agent)}
        <button class="btn btn-primary" id="btnRun">Generar</button>
      </form>
      <h2>Resultado</h2>
      <div class="output" id="out"><span class="sub">Aquí aparecerá el resultado.</span></div>
      <div class="toolbar" id="outActions" style="margin-top:10px" hidden></div>
    </div>`;

  views.agencia.after = root => {
    root.querySelectorAll('[data-agent]').forEach(el => el.onclick = () => { ui.agent = el.dataset.agent; render(); });
    const form = $('#agentForm', root);
    const out = $('#out', root), actions = $('#outActions', root);

    if (ui.agent === 'disenador') {
      const paintLogos = () => {
        const proj = form.project.value;
        const own = logos.filter(l => l.project === proj || l.project === 'General / AGI');
        $('#logoPick', root).innerHTML = own.length
          ? own.map(l => `<div class="logo-tile selected" title="${esc(l.project)}"><img src="${l.dataUrl}" alt=""><div>${esc(l.name)}</div></div>`).join('')
          : '<div class="sub" style="grid-column:1/-1">Sin logos guardados. Búscalos en la pestaña Correo dentro de la carpeta del proyecto o súbelos aquí.</div>';
      };
      form.project.onchange = paintLogos; paintLogos();
      form.logoFile.onchange = () => {
        const f = form.logoFile.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => { addLogo({ name: f.name, project: form.project.value, dataUrl: rd.result }); paintLogos(); };
        rd.readAsDataURL(f);
      };
    }

    form.onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      delete fd.logoFile;
      fd.useAI = !!form.useAI?.checked;
      store.set('agent.' + ui.agent, fd);
      const btn = $('#btnRun', root); btn.disabled = true; btn.textContent = 'Trabajando…';
      out.textContent = 'Trabajando…'; actions.hidden = true;
      try {
        if (ui.agent === 'disenador') {
          await runDesigner(fd, out, actions);
        } else {
          const text = await runWriter(ui.agent, fd);
          out.textContent = text;
          actions.hidden = false;
          actions.innerHTML = `<button class="btn btn-ghost btn-sm" id="aCopy">Copiar</button>
            ${ui.agent === 'comunicado' ? '<button class="btn btn-gold btn-sm" id="aDesign">Enviar al Diseñador</button>' : ''}
            <button class="btn btn-ghost btn-sm" id="aTask">+ Crear tarea de seguimiento</button>`;
          $('#aCopy').onclick = () => navigator.clipboard.writeText(text).then(() => toast('Copiado.'));
          $('#aTask').onclick = () => openTask(null, { title: `Revisar y aprobar: ${AGENTS[ui.agent].name.toLowerCase()}`, project: fd.project || 'General / AGI', status: 'review', notes: text.slice(0, 1500) });
          const ad = $('#aDesign'); if (ad) ad.onclick = () => {
            const titulo = (text.match(/T[ÍI]TULO:\s*(.+)/i) || [])[1] || fd.tema;
            const texto = ((text.match(/MENSAJE:\s*([\s\S]*?)(?:\n\s*FIRMA:|REGISTRO DE TRAZABILIDAD)/i) || [])[1] || text).trim();
            store.set('agent.disenador', { ...store.get('agent.disenador', {}), project: fd.project, titulo, texto });
            ui.agent = 'disenador'; render();
          };
        }
      } catch (err) { out.textContent = '⚠️ ' + err.message; }
      btn.disabled = false; btn.textContent = 'Generar';
    };
  };

  function runWriter(key, fd) {
    const fecha = new Date().toLocaleDateString('es-CO', { timeZone: TZ });
    if (key === 'comunicado') {
      return askClaude(COMUNICADO_SYSTEM, `Fecha: ${fecha}\nNombre del delegado: ${settings.delegate || '(sin definir)'}\nProyecto / conjunto: ${fd.project}\nTema: ${fd.tema}\nIdea general (notas en bruto):\n${fd.idea}`);
    }
    if (key === 'correo') {
      return askClaude('Eres el asistente de la Coordinación de Proyectos de Alianza Grupo Inmobiliario. Redacta un BORRADOR de respuesta de correo en español de Colombia: cordial, profesional, breve y concreto. Comienza con "Cordial saludo," y termina con "Cordialmente," seguido de la firma del delegado. Incluye una línea "Asunto:" sugerida. No inventes datos: si falta información, déjala entre corchetes.',
        `Delegado: ${settings.delegate || '[nombre]'}\nProyecto: ${fd.project}\nCorreo recibido:\n${fd.mail}\n\nLo que quiero responder:\n${fd.idea}`);
    }
    const open = tasks.filter(t => t.status !== 'done')
      .map(t => `- [${t.project}] ${t.title} | prioridad ${t.priority} | ${t.due ? 'vence ' + t.due + (t.time ? ' ' + t.time : '') : 'sin fecha'} | estado ${STATUS[t.status]}`).join('\n');
    return askClaude('Eres el asistente de planeación de la Coordinación de Proyectos de Alianza Grupo Inmobiliario. Con la lista de pendientes, entrega: 1) Las 3 prioridades del día y por qué. 2) Un plan por bloques horarios (8:00 a 17:00). 3) Pendientes que conviene delegar o reprogramar. 4) Alertas de vencimientos. Sé breve y usa viñetas.',
      `Hoy es ${fecha}.\nContexto: ${fd.idea || 'ninguno'}\n\nPendientes:\n${open}`);
  }

  // Compone la pieza: fondo (IA o plantilla) + logos originales sin alterar + textos.
  async function runDesigner(fd, out, actions) {
    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo cargar una imagen.')); i.src = src; });

    ctx.fillStyle = BRAND.blanco; ctx.fillRect(0, 0, W, H);
    const imgH = 560;
    if (fd.useAI) {
      out.textContent = 'ChatGPT está creando la imagen de fondo…';
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

    out.innerHTML = ''; out.appendChild(canvas);
    if (y > H - barH - 20) toast('El texto es largo: considera acortarlo para lectura en celular.');
    if (!chosen.length) toast('La pieza no tiene logos: agrégalos desde Correo o súbelos.');
    actions.hidden = false;
    actions.innerHTML = '<button class="btn btn-gold btn-sm" id="aDown">⬇️ Descargar PNG</button><button class="btn btn-ghost btn-sm" id="aTask">+ Tarea: aprobar pieza</button>';
    $('#aDown').onclick = () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `pieza-${(fd.project || 'alianza').replace(/\W+/g, '-').toLowerCase()}.png`; a.click(); };
    $('#aTask').onclick = () => openTask(null, { title: `Aprobar pieza gráfica: ${fd.titulo}`, project: fd.project, status: 'review', notes: fd.texto });
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

  // ---------------------------------------------------------------- Ajustes
  views.ajustes = () => `
    <h1>Ajustes</h1><div class="gold-line"></div>
    <form class="card workspace" id="setForm">
      <h2 style="margin-top:0">Delegado</h2>
      <label>Tu nombre (para firmas y trazabilidad)<input name="delegate" value="${esc(settings.delegate)}"></label>
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
        <button class="btn btn-ghost btn-sm" id="btnExport">Exportar tareas (JSON)</button>
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
      store.set('projects', projects); toast('Proyectos guardados.'); fillProjectSelect();
    };
    root.querySelectorAll('[data-dellogo]').forEach(b => b.onclick = () => { logos.splice(Number(b.dataset.dellogo), 1); store.set('logos', logos); render(); });
    $('#btnExport', root).onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ tasks, projects }, null, 2)], { type: 'application/json' }));
      a.download = `alianza-tareas-${todayStr()}.json`; a.click();
    };
    $('#fileImport', root).onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(txt => {
        const d = JSON.parse(txt);
        if (Array.isArray(d.tasks)) { tasks = d.tasks; saveTasks(); }
        if (Array.isArray(d.projects)) { projects = d.projects; store.set('projects', projects); }
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
    $('#taskDialogTitle').textContent = id ? 'Editar tarea' : 'Nueva tarea';
    $('#btnDeleteTask').hidden = !id;
    $('#btnCalTask').hidden = !id || !t.due;
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
  $('#btnDeleteTask').onclick = () => {
    if (!confirm('¿Eliminar esta tarea?')) return;
    tasks = tasks.filter(t => t.id !== editingId); saveTasks(); dlg.close(); render();
  };
  $('#btnCalTask').onclick = () => {
    const t = tasks.find(x => x.id === editingId);
    const url = googleCalendarUrl(t);
    if (url) window.open(url, '_blank', 'noopener');
  };
  $('#btnNewTask').onclick = () => openTask(null);

  // ---------------------------------------------------------------- Navegación
  function setView(v) { ui.view = v; render(); window.scrollTo(0, 0); }
  function render() {
    const root = $('#view');
    root.innerHTML = views[ui.view]();
    views[ui.view].after?.(root);
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  }
  document.querySelectorAll('#tabbar button').forEach(b => b.onclick = () => setView(b.dataset.view));

  render();
  checkReminders();
  setInterval(checkReminders, 30000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
