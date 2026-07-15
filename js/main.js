/* =========================================================
   SHEYLEGAL — main.js  v2.0
   Navegación, carrito premium multi-paso, validación,
   Toast Notifications y pasarela de pago PayPal
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* =====================================================
     UTILIDAD: TOAST NOTIFICATIONS
     ===================================================== */
  const Toast = {
    container: null,

    init() {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);
      }
    },

    /**
     * @param {string} title  - Toast title
     * @param {string} msg    - Optional message
     * @param {'success'|'error'|'info'} type
     * @param {number} duration - ms to auto-dismiss (0 = no auto)
     */
    show(title, msg = '', type = 'info', duration = 4500) {
      if (!this.container) this.init();

      const icons = {
        success: '<path d="m5 12 5 5L20 7"/>',
        error:   '<path d="M18 6 6 18M6 6l12 12"/>',
        info:    '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>',
      };

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.setAttribute('role', 'alert');
      toast.innerHTML = `
        <div class="toast-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">${icons[type]}</svg>
        </div>
        <div class="toast-body">
          <div class="toast-title">${title}</div>
          ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
        </div>
        <button class="toast-close-btn" aria-label="Cerrar notificación">&times;</button>
      `;

      this.container.appendChild(toast);

      const dismiss = () => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
      };

      toast.querySelector('.toast-close-btn').addEventListener('click', dismiss);
      if (duration > 0) setTimeout(dismiss, duration);
    }
  };

  Toast.init();
  window.SheylegalToast = Toast;


  /* =====================================================
     HEADER — scroll effect
     ===================================================== */
  const header = document.querySelector('.site-header');
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 30);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();


  /* =====================================================
     MENÚ MÓVIL
     ===================================================== */
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav   = document.querySelector('.main-nav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = navToggle.classList.toggle('open');
      mainNav.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      navToggle.classList.remove('open');
      mainNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }));

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mainNav.classList.contains('open')) {
        navToggle.classList.remove('open');
        mainNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }


  /* =====================================================
     REVEAL ON SCROLL — IntersectionObserver
     ===================================================== */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }


  /* =====================================================
     ACORDEÓN FAQ
     ===================================================== */
  document.querySelectorAll('.accordion-head').forEach(head => {
    head.addEventListener('click', () => {
      const item    = head.closest('.accordion-item');
      const wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.accordion-head')?.setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        head.setAttribute('aria-expanded', 'true');
      }
    });
    // Initial aria state
    head.setAttribute('aria-expanded', 'false');
  });


  /* =====================================================
     FORMULARIOS — demo con validación + spinner + toast
     ===================================================== */
  document.querySelectorAll('form[data-demo-form]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      const btnText   = submitBtn?.querySelector('.btn-text') || submitBtn;
      const spinner   = submitBtn?.querySelector('.spinner');

      // Show loading state
      if (submitBtn) submitBtn.disabled = true;
      if (spinner)   spinner.style.display = 'inline-block';
      if (btnText && btnText !== submitBtn) btnText.style.opacity = '0';

      // Simulate network request
      await new Promise(r => setTimeout(r, 1500));

      // Restore button
      if (submitBtn) submitBtn.disabled = false;
      if (spinner)   spinner.style.display = 'none';
      if (btnText && btnText !== submitBtn) btnText.style.opacity = '1';

      form.reset();

      // Show success UI
      const successBox = form.parentElement.querySelector('.form-success') || form.querySelector('.form-success');
      if (successBox) {
        successBox.classList.add('show');
        successBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      Toast.show('¡Mensaje enviado!', 'Te responderemos en menos de 24 horas hábiles.', 'success');
    });
  });


  /* =====================================================
     CARRITO + CHECKOUT MULTI-PASO (localStorage)
     ===================================================== */
  window.SheylegalCart = (function () {

    const STORAGE_KEY = 'sheylegal_cart_v2';
    let   currentStep = 1;
    let   billingData = {};

    /* --- Storage helpers --- */
    function getCart() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
      catch { return []; }
    }
    function saveCart(cart) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
      renderCartUI();
    }
    function addItem(item) {
      const cart = getCart();
      if (cart.find(i => i.id === item.id)) {
        Toast.show('Ya en el carrito', `"${item.name}" ya está en tu carrito.`, 'info');
        openDrawer();
        return;
      }
      cart.push(item);
      saveCart(cart);
      openDrawer();
      Toast.show('¡Agregado!', item.name, 'success');
    }
    function removeItem(id) {
      const item = getCart().find(i => i.id === id);
      saveCart(getCart().filter(i => i.id !== id));
      if (item) Toast.show('Eliminado', item.name, 'info');
    }
    function clearCart() { saveCart([]); }
    function getTotal()  { return getCart().reduce((s, i) => s + parseFloat(i.price), 0); }

    /* --- Drawer helpers --- */
    function openDrawer() {
      document.querySelector('.cart-drawer')?.classList.add('open');
      document.querySelector('.cart-overlay')?.classList.add('open');
      document.querySelector('.cart-drawer')?.removeAttribute('aria-hidden');
      setStep(currentStep);
    }
    function closeDrawer() {
      document.querySelector('.cart-drawer')?.classList.remove('open');
      document.querySelector('.cart-overlay')?.classList.remove('open');
      document.querySelector('.cart-drawer')?.setAttribute('aria-hidden', 'true');
    }

    /* --- Step management --- */
    function setStep(step) {
      currentStep = step;

      // Update panels
      document.querySelectorAll('.checkout-panel').forEach(p => p.classList.remove('active'));
      const panel = {
        1: document.getElementById('panel-cart'),
        2: document.getElementById('panel-billing'),
        3: document.getElementById('panel-payment'),
      }[step];
      if (panel) panel.classList.add('active');

      // Update step indicators
      document.querySelectorAll('.cart-step-item').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s < step)  el.classList.add('completed');
        if (s === step) el.classList.add('active');
      });

      // Update header title
      const titles = { 1: 'Tu Carrito', 2: 'Tus Datos', 3: 'Pago Seguro' };
      const headerTitle = document.getElementById('cart-drawer-title');
      if (headerTitle) headerTitle.textContent = titles[step] || 'Tu Carrito';

      // Step-specific logic
      if (step === 3) {
        renderOrderMini();
        renderPaypalButtons();
      }
    }

    /* --- Main UI render --- */
    function renderCartUI() {
      const cart     = getCart();
      const total    = getTotal();

      // Update all cart count badges
      document.querySelectorAll('.cart-count').forEach(el => {
        el.textContent = cart.length;
        el.setAttribute('aria-label', `${cart.length} artículos en el carrito`);
      });

      const itemsList    = document.getElementById('cart-items-list');
      const summarySection = document.getElementById('cart-summary-section');
      const subtotalEl   = document.getElementById('cart-subtotal');
      const totalEl      = document.getElementById('cart-total-display');
      const footerActions = document.querySelector('#panel-cart .cart-footer-actions');

      if (!itemsList) return;

      if (cart.length === 0) {
        itemsList.innerHTML = `
          <div class="cart-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>
            <p>Tu carrito está vacío.<br>Explora nuestra tienda de documentos legales.</p>
            <a href="tienda.html">Ver Tienda →</a>
          </div>`;
        if (summarySection) summarySection.style.display = 'none';
        if (footerActions)  footerActions.style.display  = 'none';
        // Also reset to step 1
        if (currentStep > 1) setStep(1);
        return;
      }

      if (summarySection) summarySection.style.display = '';
      if (footerActions)  footerActions.style.display  = '';

      itemsList.innerHTML = cart.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item-thumb" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          </div>
          <div class="cart-item-info">
            <h5>${item.name}</h5>
            <div class="cart-item-price">$${parseFloat(item.price).toFixed(2)}</div>
            <button class="cart-item-remove" data-remove="${item.id}" aria-label="Quitar ${item.name} del carrito">Quitar</button>
          </div>
        </div>
      `).join('');

      if (subtotalEl) subtotalEl.textContent = `$${total.toFixed(2)}`;
      if (totalEl)    totalEl.textContent    = `$${total.toFixed(2)}`;

      itemsList.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => removeItem(btn.dataset.remove));
      });
    }

    /* --- Mini order summary for step 3 --- */
    function renderOrderMini() {
      const cart    = getCart();
      const total   = getTotal();
      const miniEl  = document.getElementById('order-mini');
      if (!miniEl) return;

      miniEl.innerHTML = `
        <h5>Resumen del Pedido</h5>
        ${cart.map(i => `
          <div class="order-mini-item">
            <span>${i.name}</span>
            <span>$${parseFloat(i.price).toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="order-mini-total">
          <span>Total</span>
          <span>$${total.toFixed(2)}</span>
        </div>
      `;
    }

    /* --- PayPal Buttons --- */
    function renderPaypalButtons() {
      const container = document.getElementById('paypal-buttons-container');
      if (!container) return;
      container.innerHTML = '';

      const cart = getCart();
      if (cart.length === 0) return;

      if (window.paypal?.Buttons) {
        window.paypal.Buttons({
          style: { shape: 'pill', color: 'gold', layout: 'vertical', label: 'paypal' },
          createOrder: (_, actions) => {
            return actions.order.create({
              purchase_units: [{
                description: cart.map(i => i.name).join(', ').slice(0, 120),
                amount: { value: getTotal().toFixed(2), currency_code: 'USD' }
              }]
            });
          },
          onApprove: (_, actions) => {
            return actions.order.capture().then(() => {
              showDownloads(cart);
              clearCart();
              Toast.show('¡Pago aprobado!', 'Tus documentos están disponibles para descargar.', 'success', 6000);
            });
          },
          onError: (err) => {
            console.error('[PayPal Error]', err);
            Toast.show('Error en el pago', 'Ocurrió un problema. Intenta de nuevo o contáctanos por WhatsApp.', 'error', 0);
          }
        }).render('#paypal-buttons-container');
      } else {
        // Fallback when PayPal SDK is not loaded
        container.innerHTML = `
          <button class="btn-checkout-next" id="fallback-pay">
            Pagar $${getTotal().toFixed(2)} con PayPal
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>`;
        document.getElementById('fallback-pay')?.addEventListener('click', () => {
          window.open('https://www.paypal.com/paypalme/sheylegal', '_blank');
        });
      }
    }

    /* --- Show Downloads --- */
    function showDownloads(purchasedItems) {
      // Switch all panels off, show download panel
      document.querySelectorAll('.checkout-panel').forEach(p => p.classList.remove('active'));
      const dlPanel = document.getElementById('panel-download');
      if (dlPanel) dlPanel.classList.add('active');

      // Hide steps
      const steps = document.querySelector('.cart-steps');
      if (steps) steps.style.display = 'none';

      // Populate download list
      const list = document.getElementById('doc-download-list');
      if (list) {
        list.innerHTML = purchasedItems.map(i => `
          <a href="${i.file}" download target="_blank" rel="noopener">
            <span>${i.name}</span>
            <span>Descargar ↓</span>
          </a>
        `).join('');
      }
    }

    /* --- Billing form validation --- */
    function validateBillingForm() {
      let valid = true;

      const nameInput  = document.getElementById('billing-name');
      const emailInput = document.getElementById('billing-email');
      const nameField  = document.getElementById('field-name');
      const emailField = document.getElementById('field-email');
      const nameMsg    = document.getElementById('msg-name');
      const emailMsg   = document.getElementById('msg-email');

      if (!nameInput?.value.trim() || nameInput.value.trim().length < 2) {
        nameField?.classList.add('field-error');
        nameField?.classList.remove('valid');
        if (nameMsg) nameMsg.classList.add('show');
        valid = false;
      } else {
        nameField?.classList.remove('field-error');
        nameField?.classList.add('valid');
        if (nameMsg) nameMsg.classList.remove('show');
        billingData.name = nameInput.value.trim();
      }

      const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailInput?.value || !emailRx.test(emailInput.value)) {
        emailField?.classList.add('field-error');
        emailField?.classList.remove('valid');
        if (emailMsg) emailMsg.classList.add('show');
        valid = false;
      } else {
        emailField?.classList.remove('field-error');
        emailField?.classList.add('valid');
        if (emailMsg) emailMsg.classList.remove('show');
        billingData.email = emailInput.value.trim();
      }

      return valid;
    }

    /* --- Real-time validation on input --- */
    ['billing-name', 'billing-email'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const field = document.getElementById(`field-${id.replace('billing-', '')}`);
        if (field?.classList.contains('field-error')) {
          field.classList.remove('field-error');
          field.querySelector('.field-msg')?.classList.remove('show');
        }
      });
    });

    /* --- Step button listeners --- */
    document.getElementById('btn-to-billing')?.addEventListener('click', () => {
      if (getCart().length === 0) return;
      setStep(2);
    });

    document.getElementById('btn-to-payment')?.addEventListener('click', () => {
      if (validateBillingForm()) {
        setStep(3);
      } else {
        Toast.show('Campos incompletos', 'Por favor revisa los datos ingresados.', 'error');
      }
    });

    document.getElementById('btn-back-to-cart')?.addEventListener('click',    () => setStep(1));
    document.getElementById('btn-back-to-billing')?.addEventListener('click', () => setStep(2));

    /* --- Global click listeners --- */
    document.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add-to-cart]');
      if (addBtn) {
        addItem({
          id:    addBtn.dataset.id,
          name:  addBtn.dataset.name,
          price: addBtn.dataset.price,
          file:  addBtn.dataset.file,
        });
      }
      if (e.target.closest('[data-cart-open]'))  openDrawer();
      if (e.target.closest('[data-cart-close]')) closeDrawer();
    });

    /* --- Escape key closes drawer --- */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });

    /* --- Initial render --- */
    renderCartUI();

    return { addItem, removeItem, clearCart, getCart, getTotal, openDrawer, closeDrawer };
  })();

}); // END DOMContentLoaded
