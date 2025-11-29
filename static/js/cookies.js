(function () {
  // ------- helpers -------
  const $ = (s) => document.querySelector(s);
  const getToken = () => (document.querySelector('meta[name="csrf-token"]')?.content || '');
  const hasConsentCookie = () => document.cookie.split('; ').some(c => c.startsWith('user_consent='));

  function getConsentCookieRaw() {
    const m = document.cookie.split('; ').find(c => c.startsWith('user_consent='));
    if (!m) return null;
    return decodeURIComponent(m.split('=').slice(1).join('='));
  }
  function parseConsentCookie() {
    let raw = getConsentCookieRaw();
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (_) {
      try {
        raw = raw.replace(/\\054/g, ',').replace(/^"+|"+$/g, '').replace(/\\"/g, '"');
        return JSON.parse(raw);
      } catch (e) {
        console.warn('Nepodařilo se parseovat user_consent cookie:', raw, e);
        return null;
      }
    }
  }
  function applyConsentToUI(consent) {
    if (!consent) return;
    const a = $('#consent-analytics');
    const d = $('#consent-ads');
    const p = $('#consent-personalize');
    if (a) a.checked = !!consent.analytics;
    if (d) d.checked = !!consent.ads;
    if (p) p.checked = !!consent.personalize;
  }

  // ------- UI control -------
  function hideConsentUI() {
    $('#cookie-bar')?.classList.add('hidden');
    $('#consent-modal')?.classList.add('hidden');
    const bd = $('#consent-backdrop');
    if (bd) bd.classList.add('backdrop-off', 'hidden');
    document.body.classList.add('consent-given');
  }
  let lastFocused = null, trapHandler = null;
  function focusablesIn(el){
    return el.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
  }
  window.closeModal = function () {
    $('#consent-modal')?.classList.add('hidden');
    const bd = $('#consent-backdrop');
    if (bd) bd.classList.add('backdrop-off', 'hidden');
    document.body.classList.remove('consent-open');
    if (trapHandler){ document.removeEventListener('keydown', trapHandler); trapHandler = null; }
    if (lastFocused && typeof lastFocused.focus === 'function'){ lastFocused.focus(); }
  };
  window.showModal = function () {
    applyConsentToUI(parseConsentCookie());

    const modal = $('#consent-modal');
    const bd = $('#consent-backdrop');
    modal?.classList.remove('hidden');
    bd?.classList.remove('hidden', 'backdrop-off');
    document.body.classList.add('consent-open');

    lastFocused = document.activeElement;
    const title = modal.querySelector('h3');
    title?.setAttribute('tabindex','-1');
    title?.focus?.();

    const nodes = focusablesIn(modal);
    const first = nodes[0], last = nodes[nodes.length - 1];
    trapHandler = function(e){
      if (e.key === 'Tab'){
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
      if (e.key === 'Escape'){ e.preventDefault(); window.closeModal(); }
    };
    document.addEventListener('keydown', trapHandler);
  };

  async function postConsent(payload) {
    const res = await fetch('/set-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getToken() },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Consent save failed: ' + res.status);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const existing = parseConsentCookie();
    if (existing) applyConsentToUI(existing);
    if (hasConsentCookie()) hideConsentUI();

    $('#consent-open-settings')?.addEventListener('click', (e) => { e.preventDefault(); window.showModal(); });
    $('#consent-cancel')?.addEventListener('click', (e) => { e.preventDefault(); window.closeModal(); });

    $('#consent-save')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          analytics: !!$('#consent-analytics')?.checked,
          ads: !!$('#consent-ads')?.checked,
          personalize: !!$('#consent-personalize')?.checked
        };
        await postConsent(payload);
        updateConsentMode(payload); // <<< Consent Mode
        hideConsentUI();
        if (typeof window.__onConsentSaved === 'function') window.__onConsentSaved();
        if (payload.analytics && typeof window.enableTracking === 'function') window.enableTracking();
      } catch (err) {
        console.error(err);
        alert('Nepodařilo se uložit nastavení soukromí.');
      }
    });

    $('#consent-allow-all')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const payload = { analytics:true, ads:true, personalize:true };
        await postConsent(payload);
        updateConsentMode(payload); // <<< Consent Mode
        hideConsentUI();
        if (typeof window.__onConsentSaved === 'function') window.__onConsentSaved();
        if (typeof window.enableTracking === 'function') window.enableTracking();
      } catch (err) { console.error(err); }
    });

    $('#consent-deny-all')?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const payload = { analytics:false, ads:false, personalize:false };
        await postConsent(payload);
        updateConsentMode(payload); // <<< Consent Mode
        hideConsentUI();
        if (typeof window.__onConsentSaved === 'function') window.__onConsentSaved();
      } catch (err) { console.error(err); }
    });

    const fab = $('#cookie-manager');
    const hasConsentClass = document.body.classList.contains('consent-given');
    if (hasConsentClass || hasConsentCookie()) fab?.classList.remove('hidden');
    fab?.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.showModal === 'function') {
        window.showModal();
        setTimeout(() => { document.querySelector('#consent-modal h3')?.setAttribute('tabindex','-1');
                           document.querySelector('#consent-modal h3')?.focus?.(); }, 30);
      }
    });

    window.__onConsentSaved = function(){ fab?.classList.remove('hidden'); };
  });
  if (typeof gtag === 'function') {
    gtag('consent', 'default', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'granted'
    });
  }

  updateConsentMode = function(consent) {
    if (typeof gtag !== 'function') return;
    try {
      gtag('consent', 'update', {
        ad_storage: consent.ads ? 'granted' : 'denied',
        analytics_storage: consent.analytics ? 'granted' : 'denied',
        ad_user_data: consent.ads ? 'granted' : 'denied',
        ad_personalization: consent.personalize ? 'granted' : 'denied',
        functionality_storage: 'granted'
      });
    } catch (e) {
      console.warn('ConsentMode update failed:', e);
    }
  };
})();