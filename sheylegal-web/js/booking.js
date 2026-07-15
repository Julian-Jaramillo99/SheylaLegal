/* =========================================================
   SHEYLEGAL — booking.js  v1.0
   Sistema de Agenda de Citas con slots dinámicos,
   validación en tiempo real y protección anti-spam.

   ARQUITECTURA:
   - En producción: llama a /api/availability y /api/book
   - En modo demo (sin backend): genera slots mock y
     simula el envío mostrando confirmacion.html
   ========================================================= */

(function () {

  'use strict';

  /* =====================================================
     CONFIGURACIÓN
     ===================================================== */
  const CONFIG = {
    /**
     * URL base de la API serverless.
     * En local/demo funciona sin backend gracias al modo MOCK.
     */
    apiBase: '/api',

    /** Duración de cada cita en minutos */
    slotDuration: 60,

    /** Horario de atención (24h) */
    openHour:  9,
    closeHour: 18,

    /** Días laborales (0 = Domingo, 6 = Sábado) */
    workDays: [1, 2, 3, 4, 5],

    /** Días festivos en formato YYYY-MM-DD */
    holidays: [
      '2026-01-01', '2026-05-01', '2026-08-10', '2026-10-09',
      '2026-11-02', '2026-11-03', '2026-12-25',
    ],

    /** Zona horaria para mostrar al usuario */
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Guayaquil',

    /** Si true, usa datos mock en lugar de la API real */
    demoMode: true,

    /** Site key de Google reCAPTCHA v3 (ver <head> de contacto.html).
     *  Si sigue siendo el placeholder, el envío continúa sin token. */
    recaptchaSiteKey: 'TU_RECAPTCHA_SITE_KEY',
  };

  /** Obtiene un token de reCAPTCHA v3 si está configurado; si no, resuelve null
   *  sin bloquear el envío del formulario (evita romper el modo demo). */
  async function getRecaptchaToken(action) {
    const key = CONFIG.recaptchaSiteKey;
    if (!key || key === 'TU_RECAPTCHA_SITE_KEY' || typeof grecaptcha === 'undefined') {
      return null;
    }
    try {
      return await new Promise((resolve) => {
        grecaptcha.ready(() => {
          grecaptcha.execute(key, { action }).then(resolve).catch(() => resolve(null));
        });
      });
    } catch {
      return null;
    }
  }

  /* =====================================================
     ESTADO DEL MÓDULO
     ===================================================== */
  const state = {
    selectedDate: null,
    selectedTime: null,
    availableSlots: [],
  };

  /* =====================================================
     INICIALIZACIÓN
     ===================================================== */
  function init() {
    const form = document.getElementById('booking-form');
    if (!form) return; // Solo se activa en páginas con el formulario

    setupDateInput();
    setupFormValidation(form);
    setupFormSubmit(form);
    displayTimezone();
  }

  /* =====================================================
     ZONA HORARIA
     ===================================================== */
  function displayTimezone() {
    const tzEl = document.getElementById('booking-timezone');
    if (tzEl) {
      tzEl.textContent = `Horarios en tu zona horaria: ${CONFIG.timezone}`;
    }
  }

  /* =====================================================
     INPUT DE FECHA — deshabilitar fines de semana y festivos
     ===================================================== */
  function setupDateInput() {
    const dateInput = document.getElementById('booking-date');
    if (!dateInput) return;

    // Minimum date = tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.min = toISODate(tomorrow);

    // Max date = 60 days ahead
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 60);
    dateInput.max = toISODate(maxDate);

    dateInput.addEventListener('change', () => {
      const dateStr = dateInput.value;
      if (!dateStr) return;

      const date     = new Date(dateStr + 'T12:00:00');
      const dayOfWeek = date.getDay();

      // Clear time slots
      clearTimeSlots();

      if (!CONFIG.workDays.includes(dayOfWeek)) {
        showTimeSlotsMessage('⚠ Los fines de semana no hay atención. Por favor selecciona un día laboral.');
        state.selectedDate = null;
        return;
      }

      if (CONFIG.holidays.includes(dateStr)) {
        showTimeSlotsMessage('⚠ Este día es feriado. Por favor selecciona otra fecha.');
        state.selectedDate = null;
        return;
      }

      state.selectedDate = dateStr;
      loadAvailableSlots(dateStr);
    });
  }

  /* =====================================================
     CARGA DE SLOTS DE DISPONIBILIDAD
     ===================================================== */
  async function loadAvailableSlots(dateStr) {
    showTimeSlotsLoading();

    try {
      let slots;

      if (CONFIG.demoMode) {
        // DEMO: generar slots de ejemplo
        await fakeDemoDelay(600);
        slots = generateDemoSlots(dateStr);
      } else {
        // PRODUCCIÓN: obtener de la API
        const res = await fetch(`${CONFIG.apiBase}/availability?date=${dateStr}`);
        if (!res.ok) throw new Error('Error al obtener disponibilidad');
        const data = await res.json();
        slots = data.slots || [];
      }

      state.availableSlots = slots;
      renderTimeSlots(slots);

    } catch (err) {
      console.warn('[Booking] Error cargando slots:', err);
      showTimeSlotsMessage('No se pudo cargar la disponibilidad. Intenta de nuevo o contáctanos por WhatsApp.');
    }
  }

  /* =====================================================
     GENERADOR DE SLOTS DEMO
     ===================================================== */
  function generateDemoSlots(dateStr) {
    const slots = [];
    // Some slots are "busy" to simulate real bookings
    const busySlots = ['10:00', '14:00', '16:00'];

    for (let h = CONFIG.openHour; h < CONFIG.closeHour; h += CONFIG.slotDuration / 60) {
      const hour   = Math.floor(h);
      const minute = Math.round((h - hour) * 60);
      const time   = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

      slots.push({
        time,
        available: !busySlots.includes(time),
      });
    }

    return slots;
  }

  /* =====================================================
     RENDER DE SLOTS
     ===================================================== */
  function renderTimeSlots(slots) {
    const container = document.getElementById('time-slots-grid');
    if (!container) return;

    if (!slots.length) {
      showTimeSlotsMessage('No hay horarios disponibles para esta fecha.');
      return;
    }

    container.innerHTML = slots.map(slot => `
      <button type="button"
              class="time-slot-btn"
              data-time="${slot.time}"
              ${!slot.available ? 'disabled aria-disabled="true"' : ''}
              aria-label="${slot.time} ${slot.available ? '— disponible' : '— no disponible'}">
        ${slot.time}
      </button>
    `).join('');

    container.style.display = 'grid';
    document.getElementById('time-slots-loading')?.remove();

    container.querySelectorAll('.time-slot-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.selectedTime = btn.dataset.time;
        clearFieldError('booking-time-group');
      });
    });
  }

  function showTimeSlotsLoading() {
    const container = document.getElementById('time-slots-grid');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    let loader = document.getElementById('time-slots-loading');
    if (!loader) {
      loader = document.createElement('p');
      loader.id = 'time-slots-loading';
      loader.className = 'time-slots-loading';
      loader.textContent = 'Cargando horarios disponibles…';
      container?.parentNode?.insertBefore(loader, container?.nextSibling);
    }
  }

  function showTimeSlotsMessage(msg) {
    const container = document.getElementById('time-slots-grid');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    let loader = document.getElementById('time-slots-loading');
    if (!loader) {
      loader = document.createElement('p');
      loader.id = 'time-slots-loading';
      loader.className = 'time-slots-loading';
      container?.parentNode?.insertBefore(loader, container?.nextSibling);
    }
    loader.textContent = msg;
  }

  function clearTimeSlots() {
    const container = document.getElementById('time-slots-grid');
    if (container) {
      container.innerHTML = '';
      container.style.display = 'none';
    }
    document.getElementById('time-slots-loading')?.remove();
    state.selectedTime = null;
  }

  /* =====================================================
     VALIDACIÓN DEL FORMULARIO
     ===================================================== */
  function setupFormValidation(form) {
    const fields = ['booking-name', 'booking-email', 'booking-phone', 'booking-service', 'booking-date'];

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      el.addEventListener('input', ()  => clearFieldError(el.closest('.booking-form-field')?.id || el.id));
      el.addEventListener('change', () => clearFieldError(el.closest('.booking-form-field')?.id || el.id));
    });
  }

  function validateForm() {
    let valid = true;
    const errors = [];

    const required = [
      { id: 'booking-name',    msg: 'Por favor ingresa tu nombre completo.',  min: 2 },
      { id: 'booking-email',   msg: 'Por favor ingresa un correo electrónico válido.', email: true },
      { id: 'booking-phone',   msg: 'Por favor ingresa tu número de teléfono.' },
      { id: 'booking-service', msg: 'Por favor selecciona el servicio de interés.' },
      { id: 'booking-date',    msg: 'Por favor selecciona una fecha disponible.' },
    ];

    required.forEach(({ id, msg, min, email }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const val = el.value.trim();
      let fieldValid = !!val;

      if (fieldValid && min)   fieldValid = val.length >= min;
      if (fieldValid && email) fieldValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

      const fieldEl = el.closest('.booking-form-field');
      if (!fieldValid) {
        fieldEl?.classList.add('has-error');
        const errEl = fieldEl?.querySelector('.field-error-msg');
        if (errEl) errEl.textContent = msg;
        valid = false;
        errors.push(msg);
      } else {
        fieldEl?.classList.remove('has-error');
      }
    });

    // Time slot validation
    if (!state.selectedTime) {
      const timGroup = document.getElementById('time-slots-group');
      timGroup?.classList.add('has-error');
      valid = false;
      errors.push('Por favor selecciona un horario.');
    }

    return { valid, errors };
  }

  function clearFieldError(fieldId) {
    const el = document.getElementById(fieldId);
    if (el?.classList.contains('has-error')) {
      el.classList.remove('has-error');
    }
  }

  /* =====================================================
     ENVÍO DEL FORMULARIO
     ===================================================== */
  function setupFormSubmit(form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const { valid, errors } = validateForm();
      if (!valid) {
        window.SheylegalToast?.show(
          'Campos incompletos',
          errors[0] || 'Por favor revisa el formulario.',
          'error'
        );
        // Scroll to first error
        form.querySelector('.has-error input, .has-error select')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      const submitBtn = document.getElementById('btn-book');
      const btnText   = document.getElementById('btn-book-text');
      const spinner   = document.getElementById('btn-book-spinner');

      // Loading state
      if (submitBtn) submitBtn.disabled = true;
      if (btnText)   btnText.style.opacity = '0';
      if (spinner)   spinner.style.display  = 'inline-block';

      const formData = {
        name:    document.getElementById('booking-name')?.value.trim(),
        email:   document.getElementById('booking-email')?.value.trim(),
        phone:   document.getElementById('booking-phone')?.value.trim(),
        company: document.getElementById('booking-company')?.value.trim(),
        service: document.getElementById('booking-service')?.value,
        date:    state.selectedDate,
        time:    state.selectedTime,
        message: document.getElementById('booking-message')?.value.trim(),
        timezone: CONFIG.timezone,
      };

      // Token anti-spam (no bloquea el envío si reCAPTCHA no está configurado)
      formData.recaptchaToken = await getRecaptchaToken('booking_submit');

      try {
        if (CONFIG.demoMode) {
          await fakeDemoDelay(2000);
          // Store data for confirmation page
          sessionStorage.setItem('sheylegal_booking', JSON.stringify(formData));
          window.location.href = 'confirmacion.html';
        } else {
          const res = await fetch(`${CONFIG.apiBase}/book`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(formData),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Error al procesar la reserva.');
          }

          const data = await res.json();
          sessionStorage.setItem('sheylegal_booking', JSON.stringify({ ...formData, ...data }));
          window.location.href = 'confirmacion.html';
        }

      } catch (err) {
        console.error('[Booking] Submit error:', err);
        window.SheylegalToast?.show(
          'Error al agendar',
          err.message || 'Por favor intenta nuevamente o contáctanos por WhatsApp.',
          'error',
          0
        );

        // Restore button
        if (submitBtn) submitBtn.disabled = false;
        if (btnText)   btnText.style.opacity = '1';
        if (spinner)   spinner.style.display  = 'none';
      }
    });
  }

  /* =====================================================
     UTILIDADES
     ===================================================== */
  function toISODate(date) {
    return date.toISOString().split('T')[0];
  }

  function fakeDemoDelay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /* =====================================================
     PÁGINA DE CONFIRMACIÓN — leer datos de sessionStorage
     ===================================================== */
  function initConfirmationPage() {
    const dataEl = document.getElementById('conf-data');
    if (!dataEl) return;

    const raw = sessionStorage.getItem('sheylegal_booking');
    if (!raw) return;

    const data = JSON.parse(raw);

    // Fill in details
    setConfDetail('conf-name',    data.name);
    setConfDetail('conf-service', data.service);
    setConfDetail('conf-datetime', `${formatDate(data.date)} a las ${data.time}`);
    setConfDetail('conf-email',   data.email);

    // Google Calendar link
    const gcLink = document.getElementById('btn-gcal');
    if (gcLink && data.date && data.time) {
      gcLink.href = buildGoogleCalendarLink(data);
    }

    // Outlook link
    const outlookLink = document.getElementById('btn-outlook');
    if (outlookLink && data.date && data.time) {
      outlookLink.href = buildOutlookLink(data);
    }

    // ICS download (Apple Calendar)
    const icsLink = document.getElementById('btn-ics');
    if (icsLink && data.date && data.time) {
      icsLink.href     = buildICSLink(data);
      icsLink.download = 'consulta-sheylegal.ics';
    }

    // Clean up
    sessionStorage.removeItem('sheylegal_booking');
  }

  function setConfDetail(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.textContent = value;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${months[parseInt(m)-1]} de ${y}`;
  }

  function buildGoogleCalendarLink(data) {
    const [y, mo, d] = data.date.split('-');
    const [h, mi]    = data.time.split(':');
    const start = `${y}${mo}${d}T${h}${mi}00`;
    const end   = addHour(y, mo, d, h, mi, 1);

    const params = new URLSearchParams({
      action:  'TEMPLATE',
      text:    `Consulta Legal — Sheylegal`,
      dates:   `${start}/${end}`,
      details: `Consulta con Sheylegal para el servicio: ${data.service}.\n\nContacto: contacto@sheylegal.com`,
      location: 'Quito, Ecuador (remoto disponible)',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function buildOutlookLink(data) {
    const [y, mo, d] = data.date.split('-');
    const [h, mi]    = data.time.split(':');
    const startISO   = `${y}-${mo}-${d}T${h}:${mi}:00`;
    const end        = new Date(`${startISO}`);
    end.setHours(end.getHours() + 1);
    const endISO     = end.toISOString().slice(0, 16);

    const params = new URLSearchParams({
      path:     '/calendar/action/compose',
      rru:      'addevent',
      startdt:  startISO,
      enddt:    endISO,
      subject:  'Consulta Legal — Sheylegal',
      body:     `Consulta para el servicio: ${data.service}. Contacto: contacto@sheylegal.com`,
      location: 'Quito, Ecuador',
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  function buildICSLink(data) {
    const [y, mo, d] = data.date.split('-');
    const [h, mi]    = data.time.split(':');
    const start = `${y}${mo}${d}T${h}${mi}00`;
    const end   = addHour(y, mo, d, h, mi, 1);
    const now   = new Date().toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sheylegal//Reserva//ES',
      'BEGIN:VEVENT',
      `UID:${Date.now()}@sheylegal.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:Consulta Legal — Sheylegal`,
      `DESCRIPTION:Servicio: ${data.service}. Email: ${data.email}`,
      `LOCATION:Quito, Ecuador`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  }

  function addHour(y, mo, d, h, mi, hours) {
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`);
    dt.setHours(dt.getHours() + hours);
    return dt.toISOString().replace(/[-:]/g,'').slice(0,15);
  }

  /* =====================================================
     BOOTSTRAP
     ===================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    init();
    initConfirmationPage();
  });

})();
