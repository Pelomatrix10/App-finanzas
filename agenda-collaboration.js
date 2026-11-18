(() => {
  const agenda = document.getElementById('tab-agenda');
  const list = agenda?.querySelector('.copper-agenda-list');
  if (!list) return;

  function element(tag, label, className) {
    const node = document.createElement(tag);
    if (label) node.textContent = label;
    if (className) node.className = className;
    return node;
  }

  function button(label, action) {
    const node = element('button', label, 'btn btn-ghost btn-sm');
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  const localDay = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Lima'}).format(new Date());
  const dateLabel = (date, options) => new Intl.DateTimeFormat('es-PE', {...options, timeZone: 'UTC'}).format(new Date(date + 'T12:00:00Z'));
  const inbox = element('div', '', 'tito-invitation-inbox');
  const toolbar = element('div', '', 'tito-agenda-switch');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Vista de Agenda');
  let view = 'dates';
  try { view = localStorage.getItem('tito-agenda-view') === 'calendar' ? 'calendar' : 'dates'; } catch {}
  let month = localDay().slice(0, 7);
  let selectedDay = '';
  let jobs = [];
  let invitations = [];
  let syncedUser;
  let refreshVersion = 0;
  let queuedLink = new URLSearchParams(location.search).get('invitacion');
  const datesButton = button('Fechas', () => changeView('dates'));
  const calendarButton = button('Calendario', () => changeView('calendar'));
  toolbar.append(datesButton, calendarButton);
  const calendar = element('div', '', 'tito-calendar');
  const dayHeading = element('p', '', 'tito-calendar-selection');
  dayHeading.setAttribute('aria-live', 'polite');
  const emptyDay = element('p', 'No hay trabajos para esta fecha.', 'copper-agenda-hint');
  list.before(inbox, toolbar, calendar, dayHeading, emptyDay);

  function changeView(next) {
    view = next;
    try { localStorage.setItem('tito-agenda-view', view); } catch {}
    renderCalendar();
  }

  function renderCalendar() {
    const active = view === 'calendar';
    datesButton.setAttribute('aria-pressed', String(!active));
    calendarButton.setAttribute('aria-pressed', String(active));
    calendar.hidden = !active;
    dayHeading.hidden = !active;
    emptyDay.hidden = true;
    let visible = 0;
    for (const card of list.querySelectorAll('.copper-booking')) {
      const date = card.dataset.agendaDate;
      card.hidden = active && (selectedDay ? date !== selectedDay : !date?.startsWith(month + '-'));
      if (!card.hidden) visible++;
    }
    const placeholder = list.querySelector('.copper-agenda-hint:not(.copper-booking .copper-agenda-hint)');
    if (placeholder && (jobs.length || visible || placeholder.textContent.startsWith('Todavía'))) placeholder.hidden = active || visible > 0;
    if (!active) return;
    calendar.replaceChildren();
    const [year, number] = month.split('-').map(Number);
    const first = new Date(Date.UTC(year, number - 1, 1));
    const monthDays = new Date(Date.UTC(year, number, 0)).getUTCDate();
    const shift = (delta) => {
      month = new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
      selectedDay = '';
      renderCalendar();
    };
    const heading = element('div', '', 'tito-calendar-header');
    const previous = button('‹', () => shift(-1));
    previous.setAttribute('aria-label', 'Mes anterior');
    const next = button('›', () => shift(1));
    next.setAttribute('aria-label', 'Mes siguiente');
    heading.append(previous, element('strong', dateLabel(month + '-01', {month: 'long', year: 'numeric'})), next);
    const grid = element('div', '', 'tito-calendar-grid');
    for (const day of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) grid.append(element('span', day, 'tito-calendar-weekday'));
    const pad = (first.getUTCDay() + 6) % 7;
    for (let i = 0; i < pad; i++) grid.append(element('span'));
    const scheduled = [...jobs.filter(job => job.estado !== 'Cancelado'), ...invitations.filter(invite => !invite.outgoing && invite.status === 'accepted' && !invite.cancelled)];
    for (let i = 1; i <= monthDays; i++) {
      const date = month + '-' + String(i).padStart(2, '0');
      const count = scheduled.filter(job => job.fecha === date).length;
      const day = button(String(i), () => {
        selectedDay = selectedDay === date ? '' : date;
        renderCalendar();
        calendar.querySelector('[data-calendar-day="' + date + '"]')?.focus();
      });
      day.dataset.calendarDay = date;
      day.setAttribute('aria-label', dateLabel(date, {dateStyle: 'full'}) + (count ? ', ' + count + (count === 1 ? ' trabajo' : ' trabajos') : ''));
      day.setAttribute('aria-pressed', String(date === selectedDay));
      if (date === localDay()) day.setAttribute('aria-current', 'date');
      if (count) day.append(element('small', String(count)));
      grid.append(day);
    }
    const controls = element('div', '', 'tito-calendar-controls');
    controls.append(button('Hoy', () => { selectedDay = localDay(); month = selectedDay.slice(0, 7); renderCalendar(); }));
    if (selectedDay) controls.append(button('Ver todo el mes', () => { selectedDay = ''; renderCalendar(); }));
    calendar.append(heading, grid, controls);
    dayHeading.textContent = selectedDay ? dateLabel(selectedDay, {dateStyle: 'full'}) : 'Trabajos del mes';
    emptyDay.textContent = selectedDay ? 'No hay trabajos para esta fecha.' : 'No hay trabajos para este mes.';
    emptyDay.hidden = visible !== 0;
  }

  async function call(name, args) {
    const {data, error} = await supabaseClient.rpc(name, args);
    if (error) throw error;
    return data;
  }

  function details(item) {
    const times = [item.inicio?.slice(0, 5), item.fin?.slice(0, 5)].filter(Boolean).join('–');
    return [dateLabel(item.fecha, {dateStyle: 'long'}), times ? times + ' (hora de Perú)' : '', item.lugar].filter(Boolean).join(' · ');
  }

  function inviteRow(item, incoming) {
    const row = element('div', '', 'tito-invite-row');
    row.id = 'tito-invite-' + item.id;
    row.append(element('strong', incoming ? item.nombre + ' · ' + item.assignment : item.email + ' · ' + item.assignment));
    if (incoming) row.append(element('div', item.organizer_name + ' · ' + details(item), 'copper-agenda-hint'));
    const label = item.cancelled ? 'Trabajo cancelado'
      : item.status === 'accepted' ? 'Aceptada'
      : item.status === 'declined' ? 'Rechazada'
      : !item.actionable ? 'Invitación cerrada'
      : item.channel === 'app' ? 'Pendiente de respuesta'
      : {queued: 'Correo en cola', sent: 'Correo enviado · respuesta por correo', manual: 'Envío desde tu correo', failed: 'No se pudo enviar automáticamente'}[item.delivery];
    const message = element('p', label, 'copper-agenda-hint');
    row.append(message);
    if (incoming && item.status === 'pending' && item.actionable) {
      const actions = element('div', '', 'tito-invite-actions');
      for (const [label, value] of [['Aceptar', 'accepted'], ['Rechazar', 'declined']]) {
        actions.append(button(label, async () => {
          for (const control of actions.children) control.disabled = true;
          try {
            await call('respond_to_job_invitation', {invitation: item.id, answer: value});
            await refreshInvitations();
          } catch {
            message.textContent = 'No se pudo guardar la respuesta. Actualiza Agenda e inténtalo de nuevo.';
          } finally {
            for (const control of actions.children) control.disabled = false;
          }
        }));
      }
      row.append(actions);
    }
    if (!incoming && item.channel === 'email' && item.actionable && ['manual','failed'].includes(item.delivery)) {
      const link = element('a', 'Abrir borrador de correo', 'btn btn-ghost btn-sm');
      const subject = 'Invitación a trabajar en ' + item.nombre;
      const body = 'Hola,\n\nTe invito a participar en ' + item.nombre + ' como ' + item.assignment + '.\n' + details(item) + '\n\n¿Me confirmas tu disponibilidad respondiendo a este correo?';
      link.href = 'mailto:' + encodeURIComponent(item.email).replace('%40','@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      row.append(link);
    }
    return row;
  }

  function renderInvitations() {
    const incoming = invitations.filter(item => !item.outgoing);
    const pending = incoming.filter(item => item.status === 'pending' && item.actionable).length;
    inbox.hidden = !incoming.length;
    inbox.replaceChildren();
    if (incoming.length) {
      const panel = element('details', '', 'copper-card');
      panel.open = pending > 0 || Boolean(queuedLink) || Boolean(inbox.dataset.expanded);
      panel.append(element('summary', 'Invitaciones de trabajo' + (pending ? ' · ' + pending + ' por responder' : '')));
      panel.addEventListener('toggle', () => { inbox.dataset.expanded = panel.open ? '1' : ''; });
      incoming.forEach(item => panel.append(inviteRow(item, true)));
      inbox.append(panel);
    }
    for (const card of list.querySelectorAll('.tito-invited-job')) card.remove();
    for (const invite of incoming.filter(item => item.status === 'accepted' && !item.cancelled)) {
      const card = element('article', '', 'copper-booking tito-invited-job');
      card.dataset.agendaDate = invite.fecha;
      const date = element('div', '', 'copper-booking-date');
      date.append(element('span', dateLabel(invite.fecha, {month:'short'})), element('strong', invite.fecha.slice(-2)));
      const info = element('div');
      info.append(element('div', invite.nombre, 'copper-booking-name'), element('div', invite.assignment + ' · ' + invite.organizer_name, 'copper-booking-meta'),
        element('div', details(invite), 'copper-booking-meta'), element('div', 'Invitación aceptada', 'copper-client-linked'));
      card.append(date, info);
      const next = [...list.querySelectorAll('.copper-booking')].find(other => other.dataset.agendaDate > invite.fecha);
      list.insertBefore(card, next || null);
    }
    for (const card of list.querySelectorAll('[data-job-id]')) {
      card.querySelector('.tito-outgoing')?.remove();
      const job = jobs.find(item => item.id === card.dataset.jobId);
      const outgoing = invitations.filter(item => item.outgoing && item.job_id === job?.id);
      const canInvite = job && ['Tentativo','Confirmado'].includes(job.estado) && job.fecha >= localDay();
      if (!outgoing.length && !canInvite) continue;
      const panel = element('details', '', 'tito-outgoing');
      panel.open = card.dataset.invitesOpen === 'yes';
      panel.addEventListener('toggle', () => { card.dataset.invitesOpen = panel.open ? 'yes' : ''; });
      panel.append(element('summary', outgoing.length ? 'Invitaciones · ' + outgoing.length : 'Invitar a este trabajo'));
      outgoing.forEach(item => panel.append(inviteRow(item, false)));
      if (canInvite) panel.append(button('+ Invitar', () => openInvitation(job, card)));
      card.querySelector('.copper-booking-info').append(panel);
    }
    renderCalendar();
    if (queuedLink) {
      const item = document.getElementById('tito-invite-' + queuedLink);
      if (item) {
        queuedLink = null;
        requestAnimationFrame(() => item.scrollIntoView({block:'center'}));
      }
    }
  }

  async function refreshInvitations(force = false) {
    const user = window.titoAccess?.user?.id;
    const version = ++refreshVersion;
    if (!user) return;
    if (syncedUser !== user) { invitations = []; syncedUser = user; }
    try {
      const result = await call('my_job_invitations');
      if (version !== refreshVersion || user !== window.titoAccess?.user?.id) return;
      if (force !== true && JSON.stringify(result || []) === JSON.stringify(invitations) && !queuedLink && !inbox.querySelector('button')) return;
      invitations = result || [];
      renderInvitations();
    } catch {
      if (version !== refreshVersion || user !== window.titoAccess?.user?.id) return;
      inbox.hidden = false;
      inbox.replaceChildren(element('p', 'No se pudieron cargar las invitaciones.', 'copper-agenda-hint'), button('Reintentar', refreshInvitations));
    }
  }

  async function openInvitation(job, card) {
    document.getElementById('tito-invite-editor')?.close();
    const dialog = element('dialog', '', 'tito-invite-dialog');
    dialog.id = 'tito-invite-editor';
    const title = element('h2', 'Invitar a ' + job.nombre);
    title.id = 'tito-invite-title';
    dialog.setAttribute('aria-labelledby', title.id);
    const form = element('form');
    const email = element('input'); email.type = 'email'; email.required = true; email.maxLength = 254;
    const role = element('input'); role.value = 'Asistente'; role.required = true; role.maxLength = 80;
    const emailLabel = element('label', 'Correo del invitado'); emailLabel.append(email);
    const roleLabel = element('label', 'Rol en el trabajo'); roleLabel.append(role);
    const description = element('p', 'Los testers responden en TiTo. Para una persona externa, puedes abrir un correo con los datos del trabajo.', 'copper-agenda-hint');
    const feedback = element('p', '', 'copper-agenda-hint');
    feedback.setAttribute('role','status');
    const actions = element('div', '', 'tito-invite-actions');
    const submit = element('button', 'Crear invitación', 'btn btn-brass'); submit.type = 'submit';
    actions.append(button('Cancelar', () => dialog.close()), submit);
    form.append(title, emailLabel, roleLabel, description, feedback, actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    dialog.showModal();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        await call('invite_to_job', {job: job.id, recipient: email.value.trim(), task_role: role.value.trim()});
        card.dataset.invitesOpen = 'yes';
        await refreshInvitations(true);
        dialog.close();
      } catch (error) {
        feedback.textContent = error.message || 'No se pudo crear la invitación.';
      } finally { submit.disabled = false; }
    });
    if (window.titoAccess?.isAdmin) {
      try {
        const testers = await call('job_invitation_testers');
        if (!dialog.open || !testers?.length) return;
        const chooser = element('select'); chooser.append(new Option('Seleccionar tester', ''));
        for (const tester of testers) chooser.append(new Option(tester.name === tester.email ? tester.email : tester.name + ' · ' + tester.email, tester.email));
        chooser.addEventListener('change', () => { if (chooser.value) email.value = chooser.value; });
        const label = element('label', 'Tester de TiTo (opcional)'); label.append(chooser);
        form.insertBefore(label, emailLabel);
      } catch { /* Typing the email remains available. */ }
    }
  }

  function openFromNotification() {
    if (queuedLink && window.titoAccess?.user) document.querySelector('.copper-bottom [data-copper="agenda"]')?.click();
  }

  window.addEventListener('tito-agenda-updated', event => {
    if (syncedUser !== window.titoAccess?.user?.id) invitations = [];
    jobs = event.detail?.jobs || [];
    renderInvitations();
    refreshInvitations();
  });
  for (const control of document.querySelectorAll('[data-copper="agenda"]')) control.addEventListener('click', refreshInvitations);
  window.addEventListener('tito-session-ready', () => {
    if (syncedUser !== window.titoAccess?.user?.id) { invitations = []; renderInvitations(); }
    openFromNotification();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && agenda.classList.contains('active-section')) refreshInvitations();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && agenda.classList.contains('active-section')) refreshInvitations();
  }, 30000);
  openFromNotification();
  renderCalendar();
})();