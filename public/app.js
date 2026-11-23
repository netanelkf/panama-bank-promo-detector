'use strict';

// Plain-JS single page app. All scraped/user data is rendered with
// textContent (never innerHTML) because snippets come from third-party sites.

(function () {
  const TOKEN_KEY = 'promos_token';
  const NEW_DAYS = 7;

  const state = { token: null, user: null };

  // ---------- storage ----------
  function loadToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  function saveToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: session-only login */
    }
  }

  // ---------- DOM helper ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function safeHref(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }

  const app = () => document.getElementById('app');

  function render(...nodes) {
    app().replaceChildren(...nodes);
  }

  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }

  // ---------- formatting ----------
  const dateFmt = new Intl.DateTimeFormat('es-PA', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTimeFmt = new Intl.DateTimeFormat('es-PA', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

  function relative(iso) {
    if (!iso) return '—';
    const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
    const abs = Math.abs(diffSec);
    if (abs < 60) return 'hace un momento';
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
    return dateFmt.format(new Date(iso));
  }

  function isNew(iso) {
    return iso && Date.now() - new Date(iso).getTime() < NEW_DAYS * 86400 * 1000;
  }

  function parseDetails(details) {
    if (!details) return { rates: [], months: [] };
    if (typeof details === 'string') {
      try {
        details = JSON.parse(details);
      } catch {
        return { rates: [], months: [] };
      }
    }
    return { rates: details.rates || [], months: details.months || [] };
  }

  function detailChips(details) {
    const d = parseDetails(details);
    const chips = [];
    for (const r of d.rates) chips.push(h('span', { class: 'chip' }, h('span', { class: 'chip-label' }, 'Tasa'), `${r}%`));
    for (const m of d.months) chips.push(h('span', { class: 'chip' }, h('span', { class: 'chip-label' }, 'Plazo'), `${m} meses`));
    return chips.length ? h('div', { class: 'chips' }, chips) : null;
  }

  // ---------- API ----------
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status === 401 && state.token) {
      logout(false);
      toast('Tu sesión expiró. Inicia sesión de nuevo.');
      location.hash = '#/login';
      throw new Error('Sesión expirada');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        data?.error ||
        (Array.isArray(data?.errors) && data.errors.map((e) => `${e.path}: ${e.msg}`).join(', ')) ||
        `Error ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- session ----------
  async function restoreSession() {
    state.token = loadToken();
    if (!state.token) return;
    try {
      state.user = await api('/auth/me');
    } catch {
      state.token = null;
      state.user = null;
      saveToken(null);
    }
  }

  function setSession(token, user) {
    state.token = token;
    state.user = user;
    saveToken(token);
  }

  function logout(navigate = true) {
    state.token = null;
    state.user = null;
    saveToken(null);
    if (navigate) {
      location.hash = '#/';
      route();
    }
  }

  // ---------- nav ----------
  function renderNav(current) {
    const nav = document.getElementById('nav');
    const link = (href, label) => h('a', { href, 'aria-current': current === href ? 'page' : null }, label);
    if (!state.user) {
      nav.replaceChildren(link('#/login', 'Iniciar sesión'), h('a', { href: '#/registro', class: 'btn btn-sm' }, 'Crear cuenta'));
      return;
    }
    nav.replaceChildren(
      link('#/', 'Promociones'),
      state.user.role === 'admin' ? link('#/admin', 'Admin') : null,
      h('button', { type: 'button', onclick: () => logout() }, 'Salir')
    );
  }

  // ---------- views ----------
  async function viewLanding() {
    const banksList = h('ul', { class: 'bank-list' }, h('li', { class: 'muted' }, 'Cargando bancos…'));

    render(
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          {},
          h('h1', {}, 'Entérate cuando un banco quiera comprar el saldo de tu tarjeta'),
          h(
            'p',
            { class: 'lead' },
            'Revisamos los sitios de los bancos de Panamá varias veces al día y te avisamos por email cuando aparece o cambia una promoción de compra de saldo: tasa, plazo y el enlace oficial para aplicar.'
          ),
          h(
            'div',
            { class: 'hero-actions' },
            h('a', { href: '#/registro', class: 'btn' }, 'Crear cuenta gratis'),
            h('a', { href: '#/login', class: 'btn btn-ghost' }, 'Ya tengo cuenta')
          )
        ),
        h(
          'div',
          { class: 'card' },
          h(
            'ol',
            { class: 'steps' },
            [
              ['Monitoreo', 'Revisamos las páginas de promociones de cada banco.'],
              ['Detección', 'Si cambia la oferta de compra de saldo, la registramos con tasa y plazo.'],
              ['Aviso', 'Te llega un email con el detalle y el enlace del banco.'],
            ].map(([title, text], i) =>
              h('li', {}, h('span', { class: 'step-num' }, String(i + 1)), h('div', {}, h('strong', {}, title), h('div', { class: 'muted small' }, text)))
            )
          )
        )
      ),
      h('section', {}, h('h2', {}, 'Bancos que monitoreamos'), banksList)
    );

    try {
      const banks = await api('/banks');
      banksList.replaceChildren(...banks.map((b) => h('li', {}, b.name)));
    } catch {
      banksList.replaceChildren(h('li', { class: 'muted' }, 'No se pudo cargar la lista de bancos.'));
    }
  }

  function viewAuth(mode) {
    const isRegister = mode === 'register';
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { type: 'submit', class: 'btn' }, isRegister ? 'Crear cuenta' : 'Entrar');

    async function onSubmit(e) {
      e.preventDefault();
      const form = new FormData(e.target);
      const body = { email: form.get('email'), password: form.get('password') };
      if (isRegister && form.get('name')) body.name = form.get('name');
      submit.disabled = true;
      error.hidden = true;
      try {
        const res = await api(isRegister ? '/auth/register' : '/auth/login', { method: 'POST', body });
        setSession(res.token, res.user);
        toast(isRegister ? '¡Cuenta creada! Ya estás suscrito a las alertas.' : 'Sesión iniciada');
        location.hash = '#/';
      } catch (err) {
        error.textContent = err.status === 409 ? 'Ese email ya tiene cuenta. Inicia sesión.' : err.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    }

    render(
      h(
        'div',
        { class: 'card auth-card' },
        h('h1', {}, isRegister ? 'Crear cuenta' : 'Iniciar sesión'),
        h(
          'p',
          { class: 'muted small' },
          isRegister ? 'Recibirás un email cada vez que detectemos una promoción nueva.' : 'Accede para ver las promociones detectadas.'
        ),
        h(
          'form',
          { onsubmit: onSubmit, novalidate: false },
          error,
          isRegister
            ? h('div', { class: 'field' }, h('label', { for: 'name' }, 'Nombre (opcional)'), h('input', { id: 'name', name: 'name', type: 'text', autocomplete: 'name' }))
            : null,
          h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), h('input', { id: 'email', name: 'email', type: 'email', required: true, autocomplete: 'email' })),
          h(
            'div',
            { class: 'field' },
            h('label', { for: 'password' }, 'Contraseña'),
            h('input', {
              id: 'password',
              name: 'password',
              type: 'password',
              required: true,
              minlength: isRegister ? 8 : null,
              autocomplete: isRegister ? 'new-password' : 'current-password',
            }),
            isRegister ? h('div', { class: 'muted small' }, 'Mínimo 8 caracteres.') : null
          ),
          submit
        ),
        h(
          'p',
          { class: 'small muted' },
          isRegister ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? ',
          h('a', { href: isRegister ? '#/login' : '#/registro' }, isRegister ? 'Inicia sesión' : 'Crea una')
        )
      )
    );
    document.getElementById('email').focus();
  }

  function promoCard(bank, promo) {
    const href = safeHref(promo.url);
    return h(
      'article',
      { class: 'card promo-card' },
      h(
        'div',
        { class: 'promo-head' },
        h('h3', { class: 'promo-bank' }, bank.name),
        isNew(promo.detected_at) ? h('span', { class: 'badge badge-new' }, 'Nueva') : null
      ),
      detailChips(promo.details),
      promo.snippet ? h('p', { class: 'snippet' }, promo.snippet) : null,
      h(
        'div',
        { class: 'promo-foot' },
        h('span', { class: 'muted', title: dateTimeFmt.format(new Date(promo.detected_at)) }, `Detectada ${relative(promo.detected_at)}`),
        href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, 'Ver en el banco ↗') : null
      )
    );
  }

  function historyTable(promos) {
    if (!promos.length) return h('p', { class: 'muted' }, 'Todavía no hay promociones registradas.');
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Banco'), h('th', {}, 'Tasa / plazo'), h('th', {}, ''))),
        h(
          'tbody',
          {},
          promos.map((p) => {
            const d = parseDetails(p.details);
            const terms = [d.rates.map((r) => `${r}%`).join(', '), d.months.length ? `${d.months.join(', ')} meses` : ''].filter(Boolean).join(' · ');
            const href = safeHref(p.url);
            return h(
              'tr',
              {},
              h('td', { class: 'num nowrap' }, dateFmt.format(new Date(p.detected_at))),
              h('td', {}, p.bank_name),
              h('td', { class: 'num' }, terms || h('span', { class: 'muted' }, '—')),
              h('td', { class: 'nowrap' }, href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, 'Ver ↗') : null)
            );
          })
        )
      )
    );
  }

  async function viewDashboard() {
    const user = state.user;

    const toggle = h('input', { type: 'checkbox', id: 'subscribed', checked: user.subscribed });
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        state.user = await api('/auth/me', { method: 'PATCH', body: { subscribed: toggle.checked } });
        toast(toggle.checked ? 'Alertas activadas' : 'Alertas desactivadas');
        alertText.textContent = alertCopy(toggle.checked);
      } catch (err) {
        toggle.checked = !toggle.checked;
        toast(`No se pudo guardar: ${err.message}`);
      } finally {
        toggle.disabled = false;
      }
    });
    const alertCopy = (on) =>
      on ? `Te avisaremos a ${user.email} cuando detectemos una promoción nueva o un cambio de condiciones.` : 'No recibirás emails. Puedes reactivarlas cuando quieras.';
    const alertText = h('p', { class: 'muted small', style: 'margin:4px 0 0' }, alertCopy(user.subscribed));

    const grid = h('div', { class: 'grid' }, h('p', { class: 'muted' }, 'Cargando…'));
    const filter = h('select', { 'aria-label': 'Filtrar por banco' }, h('option', { value: '' }, 'Todos los bancos'));
    const history = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));

    render(
      h('h1', {}, user.name ? `Hola, ${user.name}` : 'Promociones de compra de saldo'),
      h('p', { class: 'lead' }, 'La detección más reciente de cada banco. Las condiciones exactas siempre están en el sitio del banco.'),
      h(
        'div',
        { class: 'card alert-bar' },
        h('div', {}, h('strong', {}, 'Alertas por email'), alertText),
        h('label', { class: 'switch', for: 'subscribed' }, toggle, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), 'Activas')
      ),
      grid,
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', {}, 'Historial de detecciones'), filter), history)
    );

    async function loadHistory() {
      const q = filter.value ? `&bank=${encodeURIComponent(filter.value)}` : '';
      try {
        history.replaceChildren(historyTable(await api(`/promotions?limit=50${q}`)));
      } catch (err) {
        history.replaceChildren(h('p', { class: 'form-error' }, err.message));
      }
    }
    filter.addEventListener('change', loadHistory);

    try {
      const [banks, latest] = await Promise.all([api('/banks'), api('/promotions/latest')]);
      const byBank = new Map(latest.map((p) => [p.bank_id, p]));
      // Banks with a detection first (most recent first), then the rest A–Z.
      const sorted = [...banks].sort((a, b) => {
        const pa = byBank.get(a.id);
        const pb = byBank.get(b.id);
        if (pa && pb) return new Date(pb.detected_at) - new Date(pa.detected_at);
        if (pa) return -1;
        if (pb) return 1;
        return a.name.localeCompare(b.name, 'es');
      });
      const withPromo = sorted.filter((b) => byBank.has(b.id));
      const without = sorted.filter((b) => !byBank.has(b.id));
      grid.replaceChildren(
        ...(withPromo.length
          ? withPromo.map((b) => promoCard(b, byBank.get(b.id)))
          : [h('p', { class: 'muted' }, 'Aún no hemos detectado promociones de compra de saldo.')])
      );
      if (without.length) {
        grid.after(
          h(
            'p',
            { class: 'muted small no-promo' },
            h('strong', {}, 'Sin promoción detectada: '),
            without.map((b) => b.name).join(' · ')
          )
        );
      }
      filter.append(...banks.map((b) => h('option', { value: b.slug }, b.name)));
    } catch (err) {
      grid.replaceChildren(h('p', { class: 'form-error' }, err.message));
    }
    loadHistory();
  }

  function statusBadge(s) {
    if (!s.active) return h('span', { class: 'badge badge-off' }, 'Pausada');
    if (!s.last_checked_at) return h('span', { class: 'badge badge-off' }, 'Sin revisar');
    if (s.consecutive_failures >= 3) return h('span', { class: 'badge badge-bad' }, s.last_status_code ? `Falla · ${s.last_status_code}` : 'Falla');
    if (s.consecutive_failures > 0) return h('span', { class: 'badge badge-warn' }, s.last_status_code ? `Error · ${s.last_status_code}` : 'Error');
    return h('span', { class: 'badge badge-ok' }, 'OK');
  }

  function editSourceDialog(source, onSaved) {
    const keywords = Array.isArray(source.keywords) ? source.keywords.join(', ') : '';
    const error = h('p', { class: 'form-error', hidden: true });
    const dialog = h(
      'dialog',
      { 'aria-labelledby': 'edit-title' },
      h(
        'form',
        {
          method: 'dialog',
          onsubmit: async (e) => {
            if (e.submitter?.value === 'cancel') return;
            e.preventDefault();
            const f = new FormData(e.target);
            const body = {
              url: f.get('url'),
              keywords: String(f.get('keywords'))
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
              css_selector: f.get('css_selector') || null,
              active: f.get('active') === 'on',
            };
            try {
              await api(`/banks/${source.bank_id}/sources/${source.id}`, { method: 'PATCH', body });
              dialog.close();
              toast('Fuente actualizada');
              onSaved();
            } catch (err) {
              error.textContent = err.message;
              error.hidden = false;
            }
          },
        },
        h('h2', { id: 'edit-title' }, source.bank_name),
        error,
        h('div', { class: 'field' }, h('label', { for: 'f-url' }, 'URL monitoreada'), h('input', { id: 'f-url', name: 'url', type: 'url', required: true, value: source.url })),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'f-kw' }, 'Palabras clave (separadas por coma)'),
          h('input', { id: 'f-kw', name: 'keywords', type: 'text', required: true, value: keywords })
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'f-css' }, 'Selector CSS (opcional)'),
          h('input', { id: 'f-css', name: 'css_selector', type: 'text', value: source.css_selector || '', placeholder: 'ej. main' })
        ),
        h('div', { class: 'field' }, h('label', { class: 'checkbox' }, h('input', { type: 'checkbox', name: 'active', checked: source.active }), 'Fuente activa')),
        h(
          'div',
          { class: 'dialog-actions' },
          h('button', { type: 'submit', value: 'cancel', class: 'btn btn-ghost', formnovalidate: true }, 'Cancelar'),
          h('button', { type: 'submit', class: 'btn' }, 'Guardar')
        )
      )
    );
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  async function viewAdmin() {
    if (state.user?.role !== 'admin') {
      render(h('h1', {}, 'Acceso restringido'), h('p', { class: 'muted' }, 'Esta sección es solo para administradores.'));
      return;
    }

    const runBtn = h('button', { type: 'button', class: 'btn' }, 'Revisar ahora');
    const stats = h('div', { class: 'stats' });
    const table = h('div', {}, h('p', { class: 'muted' }, 'Cargando…'));
    let pollTimer;

    render(
      h('h1', {}, 'Administración'),
      h('p', { class: 'lead' }, 'Estado de cada página monitoreada. Una fuente con fallos repetidos (403, 404, timeout) necesita revisión: URL nueva, selector o palabras clave.'),
      stats,
      h('section', {}, h('div', { class: 'section-head' }, h('h2', {}, 'Fuentes monitoreadas'), runBtn), table)
    );

    function stat(value, label) {
      return h('div', { class: 'card' }, h('div', { class: 'stat-value' }, String(value)), h('div', { class: 'stat-label' }, label));
    }

    async function load() {
      const data = await api('/admin/sources/health');
      const active = data.sources.filter((s) => s.active);
      stats.replaceChildren(
        stat(active.length, 'Fuentes activas'),
        stat(active.filter((s) => s.last_checked_at && s.consecutive_failures === 0).length, 'Funcionando'),
        stat(data.failing, 'Con errores')
      );
      runBtn.disabled = data.scrape_running;
      runBtn.textContent = data.scrape_running ? 'Revisando…' : 'Revisar ahora';

      const rows = [...data.sources].sort((a, b) => b.consecutive_failures - a.consecutive_failures || a.bank_name.localeCompare(b.bank_name, 'es'));
      table.replaceChildren(
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h('tr', {}, h('th', {}, 'Banco'), h('th', {}, 'Estado'), h('th', {}, 'Última revisión'), h('th', {}, 'Último OK'), h('th', {}, 'URL'), h('th', {}, ''))
            ),
            h(
              'tbody',
              {},
              rows.map((s) =>
                h(
                  'tr',
                  {},
                  h('td', {}, s.bank_name),
                  h(
                    'td',
                    {},
                    statusBadge(s),
                    s.consecutive_failures > 0 ? h('div', { class: 'muted small' }, `${s.consecutive_failures} fallo(s) seguido(s)`) : null
                  ),
                  h('td', { class: 'num small' }, relative(s.last_checked_at)),
                  h('td', { class: 'num small' }, relative(s.last_success_at)),
                  h(
                    'td',
                    { class: 'url-cell' },
                    safeHref(s.url) ? h('a', { href: safeHref(s.url), target: '_blank', rel: 'noopener noreferrer' }, s.url) : s.url,
                    s.last_error ? h('div', { class: 'muted small' }, s.last_error) : null
                  ),
                  h('td', {}, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => editSourceDialog(s, load) }, 'Editar'))
                )
              )
            )
          )
        )
      );

      clearTimeout(pollTimer);
      if (data.scrape_running && location.hash === '#/admin') pollTimer = setTimeout(load, 3000);
    }

    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      try {
        await api('/admin/scrape/run', { method: 'POST' });
        toast('Revisión iniciada. Tarda unos minutos.');
      } catch (err) {
        toast(err.message);
      }
      load();
    });

    try {
      await load();
    } catch (err) {
      table.replaceChildren(h('p', { class: 'form-error' }, err.message));
    }
  }

  // ---------- router ----------
  async function route() {
    const hash = location.hash || '#/';
    renderNav(hash);
    window.scrollTo(0, 0);

    if (hash === '#/login' || hash === '#/registro') {
      if (state.user) return void (location.hash = '#/');
      return viewAuth(hash === '#/registro' ? 'register' : 'login');
    }
    if (hash === '#/admin') {
      if (!state.user) return void (location.hash = '#/login');
      return viewAdmin();
    }
    return state.user ? viewDashboard() : viewLanding();
  }

  window.addEventListener('hashchange', route);
  restoreSession().then(route);
})();
