(() => {
  const DATA_PATHS = {
    settings: 'assets/data/settings.json',
    menus: 'assets/data/menus.json',
    items: 'assets/data/items.json',
    delivery: 'assets/data/delivery.json',
    promotions: 'assets/data/promotions.json',
    content: 'assets/data/content.json',
    gallery: 'assets/data/gallery.json',
  };

  const STATIC_ASSET_BASE = (document.currentScript?.getAttribute('src') || '').includes('/static/') ? '/static/' : '';
  async function clearLegacyBrowserCaches() {
    if (!('caches' in window)) return;
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    } catch (error) {
      console.warn('[La cuisine de Rosalie] Impossible de vider les caches navigateur hérités:', error);
    }
  }

  function localAssetPath(path) {
    if (/^(https?:)?\/\//.test(path) || path.startsWith('/')) return path;
    return `${STATIC_ASSET_BASE}${path}`;
  }

  const CART_STORAGE_KEY = 'lacuisine_rosalie_cart_v2';
  const ADMIN_ACCESS_KEY_STORAGE_KEY = 'lacuisine_rosalie_admin_access_key';
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const WEEKEND_DAYS = new Set(['saturday', 'sunday']);
  const DEFAULT_DELIVERY_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const WEEKDAY_LABELS = {
    sunday: 'dimanche', monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi',
    thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi',
  };
  const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };
  const DATE_REASONS = {
    available: 'Disponible', too_soon: 'Trop tôt',
    no_delivery: 'Pas de livraison', weekend: 'Fin de semaine', full: 'Complet', closed: 'Fermé', invalid: 'Date invalide',
  };

  const state = {
    page: 'home',
    data: null,
    cart: {
      items: [],
      deliveryDate: '',
      deliveryWindow1: '',
      deliveryWindow2: '',
      coolerAvailable: false,
      deliveryInstructions: '',
      customer: {
        name: '', phone: '', email: '', streetNumber: '', streetName: '', apartment: '', city: '', province: 'QC', postalCode: '', notes: '',
      },
    },
    selectedPortions: {},
    quantities: {},
    toastTimer: null,
    lastAddedKey: '',
    dateMessage: '',
    carousel: { index: 0, timer: null, paused: false, touchStartX: 0 },
    admin: { authenticated: false, token: '', rememberKey: false, owner: 'UncleSam45', repo: 'RVSITE', branch: 'main', working: null, original: null, selectedFile: 'dashboard', message: '', saving: false, editorValid: true, orders: { owner: 'UncleSam45', repo: 'RVSITE_BRIDGE', branch: 'main', path: 'orders.json', loading: false, message: '', data: null, updatedAt: '', lastFetchedAt: '' }, stripe: { apiKey: '', projectSlug: 'lacuisine_rosalie', currency: 'cad', environment: 'test', loading: false, updating: false, message: '', repoCatalog: null, stripeCatalog: null, plan: null, results: null } },
  };

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap');
      :root{--bg:#FFF2B8;--card:#FFF6CF;--text:#24382F;--muted:#66766E;--olive:#72A982;--deep-olive:#2F6F55;--gold:#F7CA4D;--brown:#C56E8B;--border:#F1E6B8;--success:#3F8B63;--warning:#D99A25;--error:#B85050;--shadow:0 18px 45px rgba(82,105,69,.10);--soft:0 8px 22px rgba(82,105,69,.08)}
      *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:radial-gradient(circle at 10% 0%,rgba(255,218,234,.78) 0,transparent 30%),radial-gradient(circle at 90% 8%,rgba(201,241,210,.82) 0,transparent 32%),linear-gradient(135deg,#FFF2B8 0,#FFEFA7 45%,#EAF8D7 100%);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased} button,input,select,textarea{font:inherit} button{min-height:44px} a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

      .opening-note{margin-top:22px;color:#5E7168;font-size:.95rem;font-weight:700}
      .site{min-height:100vh;padding:12px 12px 92px}.container{width:min(1180px,100%);margin-inline:auto}.topbar{position:sticky;top:10px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border:1px solid rgba(228,216,200,.9);border-radius:24px;background:rgba(255,253,248,.92);backdrop-filter:blur(16px);box-shadow:var(--soft)}.brand{display:flex;align-items:center;gap:10px;min-width:0}.brand-mark{display:inline-flex;align-items:center;justify-content:center;width:96px;height:68px;flex:0 0 96px;border-radius:20px;background:linear-gradient(135deg,var(--deep-olive),var(--olive));color:#fff;font-family:'Playfair Display',Georgia,serif;font-size:1.2rem;font-weight:700;box-shadow:0 10px 22px rgba(47,66,30,.18);overflow:hidden}.brand-mark img{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit}.brand-fallback{display:none}.brand-copy{display:block}.brand-name{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.18rem;font-weight:700;line-height:1.05}.brand-tagline{display:block;color:var(--muted);font-size:.82rem;margin-top:3px}.nav{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}.nav-btn{border:1px solid transparent;background:transparent;color:var(--muted);border-radius:999px;padding:9px 12px;font-size:.9rem;font-weight:800;cursor:pointer}.nav-btn:hover,.nav-btn[aria-current=true]{background:#f3eadf;border-color:#dccbb7;color:var(--deep-olive)}.cart-nav{background:var(--deep-olive);color:#fff;border-color:var(--deep-olive)}.cart-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;margin-left:5px;padding:0 6px;border-radius:99px;background:var(--gold);color:#fff;font-size:.78rem}.mobile-menu{display:none;border:1px solid var(--border);border-radius:999px;background:#fff;padding:8px 12px;font-weight:800;color:var(--deep-olive)}
      main{padding-top:18px}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:24px;align-items:center;border:1px solid var(--border);border-radius:32px;padding:clamp(22px,4vw,52px);background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(251,245,236,.94));box-shadow:var(--shadow);overflow:hidden}.kicker{color:var(--olive);text-transform:uppercase;letter-spacing:.1em;font-size:.78rem;font-weight:900}.hero h1,.page-title{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2.15rem,5vw,4.65rem);line-height:1.02;margin:10px 0;color:var(--text)}.lead{font-size:clamp(1rem,2vw,1.18rem);line-height:1.75;color:var(--muted);max-width:62ch}.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;border:1px solid transparent;padding:12px 18px;font-weight:900;cursor:pointer;text-decoration:none;transition:transform .15s ease,filter .15s ease}.btn:hover{transform:translateY(-1px);filter:brightness(1.03)}.btn-primary{background:linear-gradient(180deg,#c08d50,#9f682f);color:#fff;box-shadow:0 12px 24px rgba(184,132,66,.24)}.btn-secondary{background:#fff;color:var(--deep-olive);border-color:#d8c8b5}.btn-olive{background:var(--deep-olive);color:#fff}.btn-ghost{background:#fff8ef;color:var(--brown);border-color:#ead9c5}.trust-chips,.chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:#fffdf8;border-radius:999px;padding:8px 11px;color:#5f554b;font-size:.88rem;font-weight:700}.hero-visual{position:relative;min-height:390px;border-radius:28px;overflow:hidden;background:linear-gradient(135deg,#efe1cd,#fff)}.hero-visual img{width:100%;height:100%;min-height:390px;object-fit:cover;display:block}.hero-card{position:absolute;left:18px;right:18px;bottom:18px;border:1px solid rgba(255,255,255,.72);border-radius:22px;padding:16px;background:rgba(255,253,248,.9);backdrop-filter:blur(12px);box-shadow:var(--soft)}.hero-card strong{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.35rem}.section{margin-top:26px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:14px}.section h2{font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.7rem,3vw,2.6rem);margin:0}.section p{color:var(--muted);line-height:1.65}.grid{display:grid;gap:16px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}.card,.panel{border:1px solid var(--border);border-radius:24px;background:rgba(255,255,255,.94);box-shadow:var(--soft)}.panel{padding:20px}.mini-card{padding:18px}.mini-card strong{display:block;margin-bottom:6px;color:var(--deep-olive)}.menu-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}.menu-header{border:1px solid #dac6ad;border-radius:28px;padding:24px;background:linear-gradient(135deg,#fff8ef,#fff);box-shadow:var(--soft)}.menu-header h1{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2rem,4vw,3.4rem);margin:4px 0}.promo{border-left:5px solid var(--gold);background:#fff7eb}.menu-section-title{display:flex;align-items:center;gap:10px;margin:24px 0 12px}.menu-section-title h2{font-size:1.7rem}.menu-card{display:grid;grid-template-columns:160px 1fr;overflow:hidden}.menu-card img{width:100%;height:100%;min-height:210px;object-fit:cover;background:#eee0d2}.menu-card-body{padding:18px;display:grid;gap:12px}.badge{width:fit-content;padding:5px 9px;border-radius:999px;background:#edf2e7;color:var(--deep-olive);font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;font-weight:900}.menu-card h3{margin:0;font-size:1.25rem}.menu-card p{margin:0;color:var(--muted);line-height:1.55}.portion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.portion-btn{border:1px solid #d8c8b6;border-radius:16px;background:#fffdf8;padding:10px 8px;cursor:pointer;text-align:center;color:var(--text);font-weight:900}.portion-btn small{display:block;color:var(--muted);font-weight:800;margin-top:2px}.portion-btn.active{background:var(--deep-olive);border-color:var(--deep-olive);color:#fff}.portion-btn.active small{color:#efe6d9}.item-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.qty{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;overflow:hidden;background:#fff}.qty button{border:0;background:transparent;width:42px;cursor:pointer;font-weight:900;color:var(--deep-olive)}.qty span{min-width:34px;text-align:center;font-weight:900}.unavailable{opacity:.62}.unavailable .btn,.unavailable .portion-btn{pointer-events:none}.cart-panel{position:sticky;top:108px;padding:18px}.cart-panel h2{font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.55rem,5vw,2.15rem);line-height:1.08;margin:0 0 10px;overflow-wrap:anywhere;hyphens:auto}.cart-empty{padding:14px;border:1px dashed #d8c8b6;border-radius:16px;color:var(--muted);background:#fffaf2}.cart-lines{display:grid;gap:10px}.cart-line{border:1px solid #eadfd2;border-radius:16px;padding:12px;background:#fffdf8}.line-top{display:flex;justify-content:space-between;gap:10px}.line-title{font-weight:900}.line-meta{color:var(--muted);font-size:.86rem;margin-top:2px}.line-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.remove-btn{border:0;background:transparent;color:var(--error);font-weight:900;cursor:pointer}.cart-total,.summary-row{display:flex;justify-content:space-between;gap:12px;padding-top:12px;margin-top:12px;border-top:1px dashed #d7c7b6;font-weight:900}.notice{padding:12px;border-radius:16px;border:1px solid #efd9b8;background:#fff8e9;color:var(--warning);font-weight:800;line-height:1.45}.success-note{border-color:#cfe2d5;background:#f0f8f2;color:var(--success)}.checkout-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px;align-items:start}.step{padding:20px}.step h2{display:flex;gap:10px;align-items:center;margin:0 0 12px;font-size:1.3rem}.step-number{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--deep-olive);color:#fff;font-size:.9rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:.88rem;font-weight:900;color:#4b3a2a}.field input,.field select,.field textarea{width:100%;min-height:46px;border:1px solid #d9cab8;border-radius:14px;background:#fffdf8;padding:10px 12px;color:var(--text)}.field textarea{min-height:96px;resize:vertical}.date-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.date-btn{border:1px solid var(--border);border-radius:16px;background:#fffdf8;padding:10px 4px;cursor:pointer;color:var(--text)}.date-btn strong{display:block}.date-btn span{display:block;font-size:.73rem;color:var(--muted);margin-top:2px}.date-btn.disabled{background:#f0e6d9;color:#8a7b6d;cursor:not-allowed}.date-btn.selected{background:var(--deep-olive);border-color:var(--deep-olive);color:#fff}.date-btn.selected span{color:#f1e7d8}.quote-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.quote-item{padding:16px;border:1px solid var(--border);border-radius:18px;background:#fffdf8;font-weight:900;color:var(--deep-olive)}.zone-map{min-height:300px;border-radius:28px;background:radial-gradient(circle at 50% 45%,rgba(184,132,66,.45),transparent 24%),radial-gradient(circle at 35% 35%,rgba(80,107,47,.35),transparent 18%),linear-gradient(135deg,#f4e7d6,#fffaf2);display:grid;place-items:center;text-align:center;padding:24px;color:var(--deep-olive);font-weight:900}.footer{margin-top:30px;padding:24px;color:#f8f3ea;background:linear-gradient(135deg,var(--deep-olive),#203015);border-radius:28px}.footer-grid{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:18px}.footer a{color:#fff}.toast{position:fixed;right:18px;bottom:86px;z-index:80;background:var(--deep-olive);color:#fff;border-radius:999px;padding:12px 16px;box-shadow:var(--shadow);font-weight:900;transform:translateY(16px);opacity:0;pointer-events:none;transition:.2s}.toast.show{transform:translateY(0);opacity:1}.mobile-cart-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:75;display:none;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:var(--deep-olive);color:#fff;padding:10px 12px 10px 16px;box-shadow:var(--shadow);font-weight:900}.mobile-cart-bar button{border:0;border-radius:999px;background:var(--gold);color:#fff;padding:9px 14px;font-weight:900;cursor:pointer}.mobile-cart-bar.empty{display:none}.final-cta{background:linear-gradient(135deg,var(--deep-olive),#273816);color:#fff;text-align:center;overflow:hidden}.final-cta h2{color:#fff}.final-cta p{color:#efe3d4;margin-inline:auto}.emotional-card{background:linear-gradient(135deg,#fffdf8,#f4e5d2)}.stepper{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}.step-pill{border:1px solid var(--border);border-radius:999px;background:#fffdf8;padding:10px 12px;font-weight:900;color:var(--muted);text-align:center;line-height:1.2;overflow-wrap:anywhere;hyphens:auto}.step-pill.active{background:var(--deep-olive);color:#fff;border-color:var(--deep-olive)}.status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:8px 12px;font-weight:900;background:#edf7ef;color:var(--success);border:1px solid #cfe2d5}.status-badge.closed{background:#fff0e9;color:var(--error);border-color:#edc8bd}.food-placeholder{min-height:210px;display:grid;place-items:center;text-align:center;background:linear-gradient(135deg,#f4e5d2,#fffaf2);color:var(--olive);font-weight:900}.food-placeholder span{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.35rem}.btn[disabled]{opacity:.55;cursor:not-allowed;filter:saturate(.6)}.btn[disabled]:hover{transform:none}.btn.added{animation:pulse .45s ease;background:var(--success)}@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.035)}100%{transform:scale(1)}}.date-btn.disabled{cursor:pointer}.date-feedback{margin-top:10px}.menu-empty{padding:18px;border:1px dashed var(--border);border-radius:18px;background:#fffdf8;color:var(--muted);font-weight:800}.availability-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:22px;background:rgba(255,253,248,.92);box-shadow:var(--soft)}.availability-strip span{padding:10px 12px;border-radius:16px;background:#fffaf2;color:var(--muted)}.availability-strip strong{color:var(--deep-olive)}.showcase-carousel{position:relative}.showcase-carousel .section-head p{max-width:760px}.showcase-shell{position:relative;overflow:hidden;border-radius:32px;background:radial-gradient(circle at 20% 0,rgba(184,132,66,.28),transparent 38%),linear-gradient(135deg,#fffaf2,#f0dfcb);border:1px solid var(--border);box-shadow:var(--shadow);padding:14px}.showcase-track{display:flex;transition:transform .55s cubic-bezier(.22,1,.36,1);will-change:transform}.showcase-slide{min-width:100%;padding:4px;opacity:.72;transform:scale(.985);transition:opacity .35s ease,transform .35s ease}.showcase-slide.active{opacity:1;transform:scale(1)}.showcase-image-wrap{position:relative;min-height:520px;border-radius:26px;overflow:hidden;background:#eadccc}.showcase-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.showcase-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(36,26,18,.76),rgba(36,26,18,.28) 48%,rgba(36,26,18,.08)),linear-gradient(0deg,rgba(36,26,18,.5),transparent 50%)}.showcase-badge{position:absolute;top:22px;left:22px;z-index:2;display:inline-flex;padding:9px 13px;border-radius:999px;background:rgba(255,253,248,.92);color:var(--deep-olive);font-weight:900;border:1px solid rgba(255,255,255,.5)}.showcase-copy{position:absolute;left:clamp(22px,5vw,58px);right:clamp(22px,5vw,58px);bottom:clamp(24px,5vw,58px);z-index:2;color:#fff;max-width:680px}.showcase-title{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2rem,4vw,4rem);line-height:1;margin:0 0 10px}.showcase-subtitle{font-size:1.08rem;line-height:1.65;color:#fff3e4;margin:0 0 18px}.showcase-controls{position:absolute;inset:50% 24px auto;display:flex;justify-content:space-between;transform:translateY(-50%);pointer-events:none}.showcase-controls button{pointer-events:auto;width:52px;height:52px;border-radius:999px;border:1px solid rgba(255,255,255,.55);background:rgba(255,253,248,.9);color:var(--deep-olive);font-size:2rem;font-weight:900;cursor:pointer;box-shadow:var(--soft)}.showcase-dots{position:absolute;left:0;right:0;bottom:24px;display:flex;justify-content:center;gap:8px;z-index:3}.showcase-dots button{width:11px;height:11px;min-height:11px;padding:0;border-radius:99px;border:0;background:rgba(255,255,255,.55);cursor:pointer}.showcase-dots button[aria-selected=true]{width:30px;background:#fff}.showcase-slide.image-missing .showcase-image{display:none}.catering-callout{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#fffdf8,#f7e8d4)}.contact-hero{align-items:stretch}.contact-hero .panel{padding:clamp(20px,3vw,30px)}.contact-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:20px}.identity-card{background:linear-gradient(135deg,#fffef4,#fff4bc 58%,#eafbe3)}.identity-list{display:grid;gap:12px;margin-top:18px}.identity-row{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:start;padding:13px 14px;border:1px solid #E8D385;border-radius:18px;background:rgba(255,253,248,.68)}.identity-label{color:var(--muted);font-size:.82rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.identity-value{font-weight:900;color:var(--text)}.identity-value.legal{font-family:'Playfair Display',Georgia,serif;font-size:1.35rem;color:var(--deep-olive)}.mapaq-badge{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding:16px;border-radius:20px;border:1px solid #cfe2d5;background:#f0f8f2;color:var(--success)}.mapaq-badge strong{display:block;color:var(--deep-olive);font-size:1.05rem}.contact-details{margin-top:16px}.admin-launch{position:fixed;right:10px;bottom:10px;z-index:120;width:28px;height:28px;min-height:28px;border:1px solid rgba(47,111,85,.18);border-radius:999px;background:rgba(255,253,248,.55);color:rgba(47,111,85,.62);font-weight:900;cursor:pointer;backdrop-filter:blur(10px);box-shadow:0 8px 18px rgba(36,56,47,.08)}.admin-launch:hover,.admin-launch:focus{background:#fff;color:var(--deep-olive);transform:none}.admin-shell{display:grid;grid-template-columns:320px minmax(0,1fr);gap:18px;align-items:start}.admin-panel{background:rgba(255,253,248,.96)}.admin-secret{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.admin-login-card{max-width:520px;margin-inline:auto}.admin-remember{display:flex;align-items:center;gap:10px;margin-top:14px;font-weight:900;color:var(--deep-olive)}.admin-remember input{width:20px;height:20px}.admin-title{margin:6px 0 10px;font-size:clamp(1.35rem,2.2vw,1.9rem);line-height:1.08;overflow-wrap:anywhere}.admin-tabs{display:grid;gap:8px}.admin-tab{justify-content:flex-start;width:100%;border-radius:16px}.admin-editor{min-height:420px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88rem;line-height:1.5}.admin-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.admin-diff{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.admin-diff pre{max-height:360px;overflow:auto;margin:0;padding:14px;border-radius:16px;background:#203015;color:#fff;font-size:.78rem;white-space:pre-wrap}.admin-workbench{display:grid;gap:16px}.admin-card{padding:18px;border:1px solid #E8D385;border-radius:24px;background:linear-gradient(135deg,rgba(255,253,248,.9),rgba(255,244,188,.65));box-shadow:var(--soft)}.admin-card h3{margin:0 0 12px;font-family:'Playfair Display',Georgia,serif;font-size:1.45rem}.admin-field-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.admin-mini-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.admin-item-card{display:grid;gap:12px}.admin-price-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.admin-preview{position:sticky;top:108px}.admin-preview-box{padding:16px;border-radius:20px;background:#fffbe7;border:1px solid #E8D385}.admin-warning{padding:16px;border:2px solid #B85050;border-radius:22px;background:linear-gradient(135deg,#fff0e9,#fff8e9);color:#7b2929;font-weight:900;line-height:1.5}.admin-warning a{color:#7b2929;text-decoration:underline}.admin-warning strong{display:block;font-size:1.05rem;margin-bottom:4px}.admin-home-hero{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;padding:22px;border-radius:28px;background:radial-gradient(circle at 12% 0,rgba(247,202,77,.35),transparent 36%),linear-gradient(135deg,#203015,#2f6f55);color:#fff;box-shadow:var(--shadow)}.admin-home-hero .kicker,.admin-home-hero p{color:#f6eadc}.admin-home-hero h2{font-size:clamp(2rem,4vw,3.4rem);line-height:1;margin:8px 0}.admin-home-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.admin-stat{padding:16px;border:1px solid rgba(255,255,255,.38);border-radius:20px;background:rgba(255,253,248,.14);backdrop-filter:blur(10px)}.admin-stat span{display:block;color:#efe3d4;font-weight:900;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}.admin-stat strong{display:block;margin-top:8px;font-size:1.65rem}.orders-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.orders-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.order-card{display:grid;gap:12px;padding:16px;border:1px solid #E8D385;border-radius:22px;background:linear-gradient(135deg,#fffdf8,#fff9df);box-shadow:var(--soft)}.order-card-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.order-card h3{margin:0;font-size:1.16rem}.order-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-weight:800;font-size:.84rem}.order-lines{display:grid;gap:8px}.order-line{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border-radius:14px;background:#fff}.order-delivery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.order-delivery div{padding:10px;border-radius:14px;background:#f0f8f2;color:var(--deep-olive);font-weight:900}.admin-empty{padding:22px;border:1px dashed #d8c8b6;border-radius:22px;background:#fffdf8;color:var(--muted);font-weight:800}.admin-check{display:flex;align-items:center;gap:10px;font-weight:900}.admin-check input{width:22px;height:22px}.detail-card{padding:16px;border:1px solid #E8D385;border-radius:18px;background:rgba(255,253,248,.72)}.detail-card strong{display:block;margin-bottom:6px;color:var(--deep-olive)}

      /* Soft Easter palette: sunny yellows, fresh mint, and gentle blush accents without stark white surfaces. */
      .topbar{border-color:rgba(232,211,133,.95);background:rgba(255,246,204,.92)}.brand-mark{background:linear-gradient(135deg,#F7CA4D,#CFEFA9 52%,#93D7B0);color:#24382F;box-shadow:0 12px 26px rgba(247,202,77,.24)}.nav-btn:hover,.nav-btn[aria-current=true]{background:#FFF4BC;border-color:#F3DC7A;color:var(--deep-olive)}.cart-nav,.btn-olive,.step-pill.active{background:linear-gradient(135deg,#2F6F55,#5DBB7B);color:#fff;border-color:#2F6F55}.cart-badge{background:#FFE889;color:#24382F}.hero{background:radial-gradient(circle at 5% 0%,rgba(255,221,235,.72),transparent 38%),linear-gradient(135deg,rgba(255,249,218,.98),rgba(255,238,164,.92) 55%,rgba(225,246,207,.9));border-color:#E8D385}.btn-primary{background:linear-gradient(180deg,#FFE889,#F7CA4D);color:#24382F;box-shadow:0 14px 26px rgba(247,202,77,.32);border-color:#EEC33F}.btn-secondary{background:#FFF4C9;color:var(--deep-olive);border-color:#D9E9B7}.btn-ghost{background:#FFF3F8;color:#A24D6A;border-color:#FFD7E6}.chip{background:rgba(255,248,211,.94);border-color:#EAD99B;color:#5E7168}.hero-visual{background:linear-gradient(135deg,#FFF4BC,#E1F7D2 58%,#FFE5EF)}.hero-card{border-color:rgba(255,250,224,.92);background:rgba(255,246,204,.92)}.card,.panel{background:rgba(255,249,218,.95);border-color:#E8D385}.menu-header{border-color:#F1E6B8;background:radial-gradient(circle at 8% 0%,rgba(255,229,239,.72),transparent 40%),linear-gradient(135deg,#fffef4,#fff6c9 58%,#effbe8)}.promo{border-left-color:#F7CA4D;background:#FFF9D9}.menu-banner{overflow:hidden;margin-bottom:18px;border:1px solid #E8D385;border-radius:28px;background:#FFF6CF;box-shadow:var(--soft);line-height:0}.menu-banner img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}.menu-card,.cart-panel,.step,.order-summary,.quote-card{background:rgba(255,248,211,.96);border-color:#E8D385}.portion-btn,.date-btn,input,select,textarea{border-color:#E4D28D;background:#FFFBE7}.portion-btn.active,.date-btn.available.active{border-color:#F7CA4D;background:#FFF3A8;color:#24382F;box-shadow:0 8px 18px rgba(247,202,77,.22)}.date-btn.available{background:#F3FFE9}.mobile-cart-bar{background:linear-gradient(135deg,#2F6F55,#69BE7D);border-color:#2F6F55}.food-placeholder{background:linear-gradient(135deg,#FFF4BC,#F4FFE9 65%,#FFE5EF);color:var(--deep-olive)}.availability-strip,.menu-empty{background:rgba(255,246,204,.94);border-color:#E8D385}.availability-strip span{background:#FFF8CD}.showcase-shell{background:radial-gradient(circle at 15% 0,rgba(255,229,239,.72),transparent 35%),radial-gradient(circle at 95% 12%,rgba(218,247,226,.82),transparent 34%),linear-gradient(135deg,#fffdf1,#fff4bc);border-color:#F1E6B8}.showcase-image-wrap{background:#FFF4BC}.showcase-overlay{background:linear-gradient(90deg,rgba(47,111,85,.70),rgba(47,111,85,.30) 48%,rgba(247,202,77,.10)),linear-gradient(0deg,rgba(47,111,85,.48),transparent 55%)}.showcase-subtitle{color:#FFFBE8}.showcase-badge,.showcase-controls button{background:rgba(255,246,204,.94);color:var(--deep-olive);border-color:rgba(255,250,224,.78)}.showcase-dots button[aria-selected=true]{background:#FFE889}.catering-callout{background:linear-gradient(135deg,#fffef4,#fff3bd 55%,#eafbe3)}
      @media(max-width:980px){.admin-shell,.admin-home-hero,.admin-home-stats,.orders-grid,.order-delivery,.admin-diff,.admin-field-row,.admin-price-grid{grid-template-columns:1fr}.contact-actions{grid-template-columns:1fr}.identity-row{grid-template-columns:1fr;gap:4px}.availability-strip{grid-template-columns:1fr 1fr}.showcase-image-wrap{min-height:430px}.showcase-controls{inset:auto 18px 18px}.catering-callout{display:block}.nav{display:none}.mobile-menu{display:inline-flex}.topbar.open .nav{display:flex;position:absolute;left:10px;right:10px;top:76px;padding:12px;border:1px solid var(--border);border-radius:20px;background:#fffdf8;box-shadow:var(--shadow)}.hero,.menu-layout,.checkout-grid{grid-template-columns:1fr}.cart-panel{position:static}.grid-3,.grid-4,.footer-grid{grid-template-columns:1fr 1fr}.mobile-cart-bar{display:flex}.menu-card{grid-template-columns:130px 1fr}.site{padding-bottom:92px}}
      @media (prefers-reduced-motion: reduce){.showcase-track,.showcase-slide{transition:none!important;animation:none!important}.btn:hover{transform:none}}
      @media(max-width:660px){.stepper{grid-template-columns:1fr}.availability-strip{grid-template-columns:1fr}.showcase-shell{padding:8px;border-radius:24px}.showcase-image-wrap{min-height:390px;border-radius:20px}.showcase-overlay{background:linear-gradient(0deg,rgba(47,111,85,.78),rgba(47,111,85,.12))}.showcase-badge{top:14px;left:14px}.showcase-copy{left:18px;right:18px;bottom:52px}.showcase-title{font-size:2rem}.showcase-subtitle{font-size:.98rem}.showcase-controls{display:none}.step-pill{text-align:left}.mobile-cart-bar.empty{display:none}.site{padding-left:8px;padding-right:8px}.topbar{border-radius:18px}.brand-mark{width:74px;height:52px;flex-basis:74px;border-radius:16px;font-size:1.05rem}.hero{padding:20px;border-radius:24px}.hero-visual,.hero-visual img{min-height:270px}.grid-2,.grid-3,.grid-4,.footer-grid,.form-grid,.quote-list{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.menu-card{grid-template-columns:1fr}.menu-card img{height:210px}.portion-grid{grid-template-columns:1fr}.date-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.checkout-grid{gap:12px}.panel,.step{padding:16px}.brand-name{font-size:1rem}.brand-tagline{font-size:.76rem}}
    `;
    document.head.appendChild(style);
  }


  function setSeo(content) {
    const seo = content?.seo || {};
    document.title = seo.title || 'La cuisine de Rosalie | Repas faits maison & livraison locale';
    upsertMeta('description', seo.description || 'Menus faits maison en rotation, portions Petit / Grand / Familial et livraison locale.');
    upsertMeta('og:title', document.title, 'property');
    upsertMeta('og:description', seo.description || '', 'property');
    upsertMeta('og:type', 'website', 'property');
  }

  function upsertMeta(name, content, attr = 'name') {
    let node = document.querySelector(`meta[${attr}="${name}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attr, name);
      document.head.appendChild(node);
    }
    node.setAttribute('content', content);
  }

  function uncachedDataPath(path) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${Date.now()}`;
  }

  async function fetchJson(path, fallback) {
    try {
      const response = await fetch(uncachedDataPath(path), { cache: 'no-store' });
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      return response.json();
    } catch (error) {
      console.warn('[La cuisine de Rosalie] Données indisponibles:', error);
      return fallback;
    }
  }

  async function loadData() {
    const [settings, menus, items, delivery, promotions, content, gallery] = await Promise.all([
      fetchJson(DATA_PATHS.settings, {}), fetchJson(DATA_PATHS.menus, {}), fetchJson(DATA_PATHS.items, { items: [] }),
      fetchJson(DATA_PATHS.delivery, { zones: [], rules: {} }), fetchJson(DATA_PATHS.promotions, { active: [] }), fetchJson(DATA_PATHS.content, {}),
      fetchJson(DATA_PATHS.gallery, { slides: [] }),
    ]);
    return { settings, menus, items: items.items || [], delivery, promotions, content, gallery };
  }


  function orderNoticeText(includeAdvance = true) {
    return includeAdvance ? '72h à l’avance' : '72h';
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: state.data?.settings?.ordering?.currency || 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0).replace(/\u00a0/g, ' ');
  }

  function parseLocalDate(dateLike, hour = 12) {
    if (dateLike instanceof Date) return new Date(dateLike.getFullYear(), dateLike.getMonth(), dateLike.getDate(), hour, 0, 0, 0);
    const [year, month, day] = String(dateLike || '').split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, hour, 0, 0, 0);
  }

  function businessToday(now = new Date()) {
    const timezone = state.data?.settings?.ordering?.timezone || 'America/Toronto';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return parseLocalDate(`${parts.year}-${parts.month}-${parts.day}`, 0);
  }

  function toLocalIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDate(dateLike) {
    if (!dateLike) return 'à confirmer';
    const date = typeof dateLike === 'string' ? parseLocalDate(dateLike) : dateLike;
    return new Intl.DateTimeFormat('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function getSettingRules() {
    const ordering = state.data?.settings?.ordering || {};
    const deliveryRules = state.data?.delivery?.rules || {};
    return { ...ordering, ...deliveryRules };
  }

  function getEnabledZones() {
    return (state.data?.delivery?.zones || []).filter((zone) => zone.enabled !== false);
  }

  function getCurrentMenu() {
    return state.data?.menus?.current_menu || {};
  }

  function getMenuItems(type = 'items') {
    const menu = getCurrentMenu();
    const ids = type === 'extras' ? menu.extra_ids || [] : menu.item_ids || [];
    const byId = new Map((state.data?.items || []).map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function getPortions(item) {
    return Object.entries(item.pricing || {})
      .filter(([, price]) => price !== null && price !== undefined && price !== '')
      .map(([key, price]) => ({ key, label: PORTION_LABELS[key] || key, price: Number(price) }));
  }

  function getItemById(id) {
    return (state.data?.items || []).find((item) => item.id === id);
  }

  function itemImagePath(item, preferred = 'card') {
    const images = item?.images || {};
    if (preferred === 'hero') return images.hero || images.card || item?.image || images.original || images.thumb || '';
    if (preferred === 'thumb') return images.thumb || item?.image || images.card || images.original || images.hero || '';
    return images[preferred] || item?.image || images.card || images.hero || images.original || images.thumb || '';
  }

  function currentMenuIds() {
    const menu = getCurrentMenu();
    if (menu.active === false) return new Set();
    return new Set([...(menu.item_ids || []), ...(menu.extra_ids || [])]);
  }

  function getCurrentMenuOfferings() {
    return [...getMenuItems('items'), ...getMenuItems('extras')];
  }

  function getCurrentMenuImageItems() {
    return getCurrentMenuOfferings().filter((item) => item.available !== false && itemImagePath(item, 'hero'));
  }

  function cartTotals() {
    const subtotal = state.cart.items.reduce((sum, line) => sum + line.price * line.qty, 0);
    const count = state.cart.items.reduce((sum, line) => sum + line.qty, 0);
    return { subtotal, count };
  }

  function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.items)) state.cart.items = parsed.items.filter((line) => line.itemId && line.portion && Number(line.qty) > 0);
      if (typeof parsed.deliveryDate === 'string') state.cart.deliveryDate = parsed.deliveryDate;
      if (typeof parsed.deliveryWindow1 === 'string') state.cart.deliveryWindow1 = parsed.deliveryWindow1;
      if (typeof parsed.deliveryWindow2 === 'string') state.cart.deliveryWindow2 = parsed.deliveryWindow2;
      if (typeof parsed.coolerAvailable === 'boolean') state.cart.coolerAvailable = parsed.coolerAvailable;
      if (typeof parsed.deliveryInstructions === 'string') state.cart.deliveryInstructions = parsed.deliveryInstructions;
      if (parsed.customer && typeof parsed.customer === 'object') state.cart.customer = { ...state.cart.customer, ...parsed.customer };
    } catch (error) {
      console.warn('Panier local illisible.', error);
    }
  }

  function addToCart(item, portionKey, qty = 1) {
    const portion = getPortions(item).find((option) => option.key === portionKey);
    if (!portion || item.available === false || !getMenuOrderStatus().open) { showToast(menuOrderStatusMessage()); return; }
    const existing = state.cart.items.find((line) => line.itemId === item.id && line.portion === portion.key);
    if (existing) existing.qty += qty;
    else state.cart.items.push({ itemId: item.id, title: item.title, portion: portion.key, portionLabel: portion.label, price: portion.price, qty });
    state.lastAddedKey = `${item.id}:${portion.key}`;
    saveCart();
    showToast(`${item.title} ajouté au panier`);
    setTimeout(() => { state.lastAddedKey = ''; render(); }, 900);
    render();
  }

  function changeLineQty(itemId, portion, delta) {
    const line = state.cart.items.find((entry) => entry.itemId === itemId && entry.portion === portion);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) state.cart.items = state.cart.items.filter((entry) => !(entry.itemId === itemId && entry.portion === portion));
    saveCart();
    render();
  }

  function removeLine(itemId, portion) {
    state.cart.items = state.cart.items.filter((entry) => !(entry.itemId === itemId && entry.portion === portion));
    saveCart();
    render();
  }

  function setPage(page) {
    state.page = page;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function formatOrderTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const timezone = state.data?.settings?.ordering?.timezone || 'America/Toronto';
    return new Intl.DateTimeFormat('fr-CA', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date).replace(' h 00', ' h');
  }

  function getMenuOrderStatus(now = new Date()) {
    const menu = getCurrentMenu();
    if (menu.active === false) return { open: false, state: 'inactive' };
    const time = now.getTime();
    if (menu.order_open_at && time < new Date(menu.order_open_at).getTime()) return { open: false, state: 'before' };
    if (menu.order_close_at && time >= new Date(menu.order_close_at).getTime()) return { open: false, state: 'after' };
    return { open: true, state: 'open' };
  }

  function menuOrderStatusMessage() {
    const menu = getCurrentMenu();
    const status = getMenuOrderStatus();
    if (status.state === 'before') return `Les commandes pour ce menu ouvriront ${formatOrderTimestamp(menu.order_open_at)} (heure de Montréal).`;
    if (status.state === 'after') return 'Commandes fermées';
    if (status.state === 'inactive') return 'Commandes fermées';
    return `Commandes ouvertes jusqu’au ${formatOrderTimestamp(menu.order_close_at)} (heure de Montréal).`;
  }

  function deliveryWindows() {
    return state.data?.delivery?.delivery_windows || ['13h à 15h', '15h à 17h', '17h à 19h', '19h à 21h'];
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function minimumDeliveryDate(noticeHours) {
    const noticeDays = Math.ceil(Number(noticeHours || 0) / 24);
    const today = businessToday();
    const minimum = new Date(today);
    minimum.setDate(minimum.getDate() + noticeDays);
    return minimum;
  }

  function isWeekendDeliveryDay(date) {
    return WEEKEND_DAYS.has(WEEKDAYS[date.getDay()]);
  }

  function deliveryDayLabels() {
    return DEFAULT_DELIVERY_DAYS.map((day) => WEEKDAY_LABELS[day] || day).join(', ');
  }

  function isDateAvailable(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return { ok: false, reason: 'invalid' };
    const rules = getSettingRules();
    const noticeHours = Number(rules.order_notice_hours || 48);
    const threshold = minimumDeliveryDate(noticeHours);
    const deliveryCutoff = parseLocalDate(date);
    if (deliveryCutoff < threshold) return { ok: false, reason: 'too_soon' };
    if (isWeekendDeliveryDay(date)) return { ok: false, reason: 'weekend' };
    return { ok: true, reason: 'available' };
  }

  function firstAvailableDate() {
    const rules = getSettingRules();
    const date = minimumDeliveryDate(Number(rules.order_notice_hours || 48));
    date.setHours(12, 0, 0, 0);
    for (let i = 0; i < 45; i += 1) {
      const candidate = new Date(date);
      candidate.setDate(date.getDate() + i);
      if (isDateAvailable(candidate).ok) return toLocalIsoDate(candidate);
    }
    return '';
  }

  function validateOrder() {
    const errors = [];
    const rules = getSettingRules();
    const totals = cartTotals();
    const customer = state.cart.customer;
    if (!getMenuOrderStatus().open) errors.push(menuOrderStatusMessage());
    if (!state.cart.items.length) errors.push('Ajoutez au moins un plat au panier.');
    if (totals.subtotal < Number(rules.minimum_order || 0)) errors.push(`Minimum de commande: ${formatCurrency(rules.minimum_order || 0)}.`);
    if (!state.cart.deliveryDate) errors.push('Choisissez une date de livraison disponible.');
    else {
      const dateStatus = isDateAvailable(parseLocalDate(state.cart.deliveryDate));
      if (!dateStatus.ok && dateStatus.reason === 'too_soon') errors.push('Cette date ne respecte pas le délai minimal de préparation de 72h.');
      else if (!dateStatus.ok) errors.push('Choisissez une date de livraison disponible.');
    }
    if (!customer.name.trim()) errors.push('Le nom complet est requis.');
    if (!customer.phone.trim()) errors.push('Le téléphone est requis.');
    if (!customer.email.trim()) errors.push('Le courriel est requis afin que Rosalie puisse vous contacter au besoin concernant votre commande.');
    else if (!isValidEmail(customer.email)) errors.push('Veuillez inscrire un courriel valide.');
    if (!customer.streetNumber.trim() || !customer.streetName.trim()) errors.push('L’adresse de livraison est requise.');
    if (!customer.city.trim()) errors.push('La ville est requise.');
    const allowed = getEnabledZones().map((zone) => zone.city.toLowerCase());
    if (customer.city && !allowed.includes(customer.city.toLowerCase())) errors.push('La ville choisie n’est pas dans la zone de livraison.');
    if (!state.cart.deliveryWindow1 || !state.cart.deliveryWindow2) errors.push('Veuillez choisir deux plages horaires de livraison.');
    else if (state.cart.deliveryWindow1 === state.cart.deliveryWindow2) errors.push('Veuillez choisir deux plages horaires différentes.');
    return errors;
  }

  function buildCheckoutPayload() {
    const customer = state.cart.customer;
    const preferenceBlock = [
      '---',
      'Préférences de livraison:',
      `Plage horaire 1: ${state.cart.deliveryWindow1}`,
      `Plage horaire 2: ${state.cart.deliveryWindow2}`,
      `Glacière disponible: ${state.cart.coolerAvailable ? 'Oui' : 'Non'}`,
      `Instructions livraison/glacière: ${state.cart.deliveryInstructions || 'Aucune'}`,
      '---',
    ].join('\n');
    const notes = [customer.notes || '', preferenceBlock].filter(Boolean).join('\n\n');
    return {
      items: state.cart.items.map((line) => ({ item_id: line.itemId, portion: line.portion, qty: line.qty })),
      delivery_date: state.cart.deliveryDate,
      delivery_window_1: state.cart.deliveryWindow1,
      delivery_window_2: state.cart.deliveryWindow2,
      cooler_available: state.cart.coolerAvailable,
      delivery_instructions: state.cart.deliveryInstructions,
      customer: {
        name: customer.name, phone: customer.phone, email: customer.email, street_number: customer.streetNumber,
        street_name: customer.streetName, apartment: customer.apartment, city: customer.city, province: customer.province || 'QC',
        postal_code: (customer.postalCode || '').toUpperCase(), notes,
      },
    };
  }

  function checkoutEndpoints() {
    const configured = state.data?.settings?.ordering?.checkout_endpoint || '/api/create-checkout-session';
    return Array.from(new Set([configured, '/.netlify/functions/create-checkout-session']));
  }

  async function requestCheckoutSession(payload) {
    const endpoints = checkoutEndpoints();
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.checkout_url) return data.checkout_url;
        const message = data.error || `Session Stripe indisponible (${response.status}).`;
        lastError = new Error(message);
        if (response.status !== 404) break;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Session Stripe indisponible.');
  }

  async function checkout() {
    const errors = validateOrder();
    if (errors.length) {
      showToast(errors[0]);
      render();
      return;
    }
    const payload = buildCheckoutPayload();
    try {
      const checkoutUrl = await requestCheckoutSession(payload);
      window.location.assign(checkoutUrl);
    } catch (error) {
      showToast(error.message || 'Impossible de créer la session de paiement.');
      console.warn('Erreur de paiement:', error, payload);
    }
  }

  function showToast(message) {
    const toast = document.querySelector('.toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function brandLogoHtml() {
    const logoPaths = [localAssetPath('logo.png'), 'assets/images/logo.png'];
    return `<span class="brand-mark" aria-hidden="true"><img src="${logoPaths[0]}" alt="" data-logo-paths="${escapeHtml(logoPaths.join('|'))}" data-logo-index="0" onerror="const paths=this.dataset.logoPaths.split('|');const next=Number(this.dataset.logoIndex||0)+1;if(next<paths.length){this.dataset.logoIndex=String(next);this.src=paths[next];}else{this.style.display='none';this.nextElementSibling.style.display='inline';}"><span class="brand-fallback">LR</span></span>`;
  }

  function navHtml() {
    const nav = [
      ['home', 'Accueil'], ['menu', 'Menu'], ['commander', 'Commander'], ['traiteur', 'Traiteur'], ['livraison', 'Livraison'], ['contact', 'Contact'],
    ];
    const { count } = cartTotals();
    return `
      <header class="topbar container" id="topbar">
        <button class="brand" data-page="home" aria-label="Accueil La cuisine de Rosalie" style="border:0;background:transparent;cursor:pointer">
          ${brandLogoHtml()}
          <span class="brand-copy"><span class="brand-name">${escapeHtml(state.data.settings.business.name || 'La cuisine de Rosalie')}</span><span class="brand-tagline">${escapeHtml(state.data.settings.business.tagline)}</span></span>
        </button>
        <button class="mobile-menu" data-menu-toggle aria-expanded="false">Menu</button>
        <nav class="nav" aria-label="Navigation principale">
          ${nav.map(([id, label]) => `<button class="nav-btn" data-page="${id}" aria-current="${state.page === id}">${label}</button>`).join('')}
          <button class="nav-btn cart-nav" data-page="commander" aria-current="${state.page === 'commander'}">Panier <span class="cart-badge">${count}</span></button>
        </nav>
      </header>`;
  }

  const GALLERY_STATUS_LABELS = {
    current: 'Disponible cette semaine', past: 'Création passée', catering: 'Traiteur', custom: 'Sur demande', seasonal: 'Saisonnier',
  };

  function autoGallerySlides() {
    const menuIds = currentMenuIds();
    return (state.data?.items || [])
      .map((item, index) => ({ item, index, image: itemImagePath(item, 'hero') }))
      .filter(({ item, image }) => item.available !== false && image)
      .map(({ item, index, image }) => ({
        id: `auto-item-${item.id || index}`,
        title: item.title || 'Plat maison',
        subtitle: item.description || item.category || 'Création maison de La cuisine de Rosalie',
        image,
        thumb: itemImagePath(item, 'thumb'),
        linked_item_id: item.id,
        status: menuIds.has(item.id) ? 'current' : 'custom',
        badge: menuIds.has(item.id) ? GALLERY_STATUS_LABELS.current : item.category || GALLERY_STATUS_LABELS.custom,
        cta_label: menuIds.has(item.id) ? 'Voir au menu' : 'Nous contacter',
        cta_page: menuIds.has(item.id) ? 'menu' : 'contact',
        enabled: true,
        sort: 1000 + index,
        auto: true,
      }));
  }

  function resolveManualSlide(slide) {
    const linkedItem = slide.linked_item_id ? getItemById(slide.linked_item_id) : null;
    const image = slide.image || itemImagePath(linkedItem, 'hero');
    if (!image) return null;
    return {
      ...slide,
      title: slide.title || linkedItem?.title || 'Plat maison',
      subtitle: slide.subtitle || linkedItem?.description || linkedItem?.category || '',
      image,
      thumb: slide.thumb || itemImagePath(linkedItem, 'thumb'),
    };
  }

  function getGallerySlides() {
    const manualSlides = (state.data?.gallery?.slides || [])
      .filter((slide) => slide.enabled !== false)
      .map(resolveManualSlide)
      .filter(Boolean)
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
    const manualItemIds = new Set(manualSlides.map((slide) => slide.linked_item_id).filter(Boolean));
    const automaticSlides = autoGallerySlides().filter((slide) => !manualItemIds.has(slide.linked_item_id));
    return [...manualSlides, ...automaticSlides];
  }

  function galleryTargetPage(slide) {
    if (slide.cta_page) return slide.cta_page;
    if (slide.status === 'catering') return 'traiteur';
    if (slide.status === 'past') return 'contact';
    return slide.linked_item_id ? 'menu' : '';
  }

  function galleryCarouselHtml() {
    const slides = getGallerySlides();
    if (!slides.length) return '';
    const active = Math.min(state.carousel.index, slides.length - 1);
    state.carousel.index = active;
    return `<section class="section container showcase-carousel" aria-label="Nos plats maison en images" tabindex="0">
      <div class="section-head"><div><div class="kicker">Galerie maison</div><h2>Nos plats maison en images</h2><p>Un aperçu de nos créations, menus passés et inspirations maison. Les plats disponibles à commander sont indiqués dans le menu de la semaine.</p></div></div>
      <div class="showcase-shell">
        <div class="showcase-track" style="transform:translateX(-${active * 100}%)">
          ${slides.map((slide, index) => {
            const badge = slide.badge || GALLERY_STATUS_LABELS[slide.status] || GALLERY_STATUS_LABELS.custom;
            const page = galleryTargetPage(slide);
            return `<article class="showcase-slide ${index === active ? 'active' : ''}" aria-hidden="${index !== active}">
              <div class="showcase-image-wrap">
                <img class="showcase-image" src="${escapeHtml(slide.image)}" alt="${escapeHtml(slide.title || badge)}" loading="${index === 0 ? 'eager' : 'lazy'}" onerror="this.closest('.showcase-slide').classList.add('image-missing')">
                <div class="showcase-overlay"></div>
                <span class="showcase-badge">${escapeHtml(badge)}</span>
                <div class="showcase-copy"><h3 class="showcase-title">${escapeHtml(slide.title)}</h3><p class="showcase-subtitle">${escapeHtml(slide.subtitle)}</p>${slide.cta_label && page ? `<button class="btn btn-primary" data-page="${escapeHtml(page)}" data-gallery-cta="${escapeHtml(slide.id)}">${escapeHtml(slide.cta_label)}</button>` : ''}</div>
              </div>
            </article>`;
          }).join('')}
        </div>
        <div class="showcase-controls"><button data-gallery-prev aria-label="Image précédente">‹</button><button data-gallery-next aria-label="Image suivante">›</button></div>
        <div class="showcase-dots" role="tablist" aria-label="Choisir une image">${slides.map((slide, index) => `<button data-gallery-dot="${index}" aria-label="Voir ${escapeHtml(slide.title || `slide ${index + 1}`)}" aria-selected="${index === active}"></button>`).join('')}</div>
      </div>
    </section>`;
  }

  function setGallerySlide(index) {
    const slides = getGallerySlides();
    if (!slides.length) return;
    state.carousel.index = (index + slides.length) % slides.length;
    render();
  }

  function nextGallerySlide() { setGallerySlide(state.carousel.index + 1); }
  function prevGallerySlide() { setGallerySlide(state.carousel.index - 1); }

  function stopGalleryAutoplay() {
    if (state.carousel.timer) clearInterval(state.carousel.timer);
    state.carousel.timer = null;
  }

  function startGalleryAutoplay() {
    stopGalleryAutoplay();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || getGallerySlides().length < 2 || state.carousel.paused) return;
    state.carousel.timer = setInterval(nextGallerySlide, 5000);
  }

  function bindGalleryEvents(root) {
    const carousel = root.querySelector('.showcase-carousel');
    if (!carousel) { stopGalleryAutoplay(); return; }
    carousel.querySelector('[data-gallery-next]')?.addEventListener('click', nextGallerySlide);
    carousel.querySelector('[data-gallery-prev]')?.addEventListener('click', prevGallerySlide);
    carousel.querySelectorAll('[data-gallery-dot]').forEach((button) => button.addEventListener('click', () => setGallerySlide(Number(button.dataset.galleryDot))));
    const pause = () => { state.carousel.paused = true; stopGalleryAutoplay(); };
    const resume = () => { state.carousel.paused = false; startGalleryAutoplay(); };
    carousel.addEventListener('mouseenter', pause);
    carousel.addEventListener('mouseleave', resume);
    carousel.addEventListener('focusin', pause);
    carousel.addEventListener('focusout', resume);
    carousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); nextGallerySlide(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); prevGallerySlide(); }
    });
    carousel.addEventListener('touchstart', (event) => { state.carousel.touchStartX = event.touches[0].clientX; pause(); }, { passive: true });
    carousel.addEventListener('touchend', (event) => {
      const delta = event.changedTouches[0].clientX - state.carousel.touchStartX;
      if (Math.abs(delta) > 45) (delta < 0 ? nextGallerySlide : prevGallerySlide)();
      resume();
    }, { passive: true });
    startGalleryAutoplay();
  }

  function homeHtml() {
    const menu = getCurrentMenu();
    const rules = getSettingRules();
    const menuIsActive = menu.active !== false;
    const currentAvailableItems = menuIsActive ? getMenuItems().filter((item) => item.available !== false) : [];
    const featuredItems = currentAvailableItems.filter((item) => item.featured === true);
    const menuItems = (featuredItems.length ? featuredItems : currentAvailableItems).slice(0, 3);
    const zones = getEnabledZones().map((zone) => zone.city).join(', ');
    const heroItems = getCurrentMenuImageItems();
    const activeHeroItem = heroItems.length ? heroItems[state.carousel.index % heroItems.length] : null;
    const heroImage = itemImagePath(activeHeroItem, 'hero') || state.data.content.home?.hero_image || 'assets/images/hero/homepage-hero.webp';
    return `
      <section class="hero container">
        <div>
          <div class="kicker">${menuIsActive ? 'Menu de la semaine • Livraison locale' : 'À bientôt • Livraison locale'}</div>
          <h1>${escapeHtml(state.data.content.home?.headline || 'Repas faits maison livrés dans votre secteur')}</h1>
          <p class="lead">${escapeHtml(state.data.content.home?.subheadline || 'Une cuisine simple, généreuse et préparée avec soin pour simplifier vos repas de semaine.')}</p>
          <div class="cta-row">${menuIsActive ? '<button class="btn btn-primary" data-page="menu">Voir le menu de la semaine</button><button class="btn btn-secondary" data-page="commander">Planifier ma commande</button>' : '<button class="btn btn-primary" data-page="menu">Voir le message</button><button class="btn btn-secondary" data-page="contact">Nous contacter</button>'}</div>
          <div class="trust-chips"><span class="chip">Fait maison</span><span class="chip">Livraison locale</span>${menuIsActive ? `<span class="chip">Commande ${orderNoticeText()}</span><span class="chip">Portions Petit / Grand / Familial</span>` : '<span class="chip">Menu de la semaine</span>'}</div>
        </div>
        <div class="hero-visual">
          <img src="${escapeHtml(heroImage)}" alt="${escapeHtml(activeHeroItem?.title || 'Repas maison préparé avec soin')}" loading="eager" onerror="this.src='https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1400&q=82'">
          <div class="hero-card"><strong>${escapeHtml(menuIsActive ? activeHeroItem?.title || menu.title || 'Menu de la semaine' : 'Menu de la semaine')}</strong><span>${menuIsActive ? `${activeHeroItem ? 'Disponible cette semaine • ' : ''}Petit / Grand / Familial • livraison à céduler avec le client` : 'Les commandes sont fermées pour le moment. Consultez le menu pour connaître la prochaine période de commande.'}</span></div>
        </div>
      </section>
      <section class="availability-strip container" aria-label="Disponibilité du menu">
        <span><strong>${menuIsActive ? 'Période:' : 'Statut:'}</strong> ${menuIsActive ? `${formatDate(menu.start_date)} au ${formatDate(menu.end_date)}` : 'Menu de la semaine'}</span>
        <span><strong>${menuIsActive ? 'Préavis:' : 'Menu:'}</strong> ${menuIsActive ? orderNoticeText(false) : 'Commandes fermées'}</span>
        <span><strong>Zones:</strong> ${escapeHtml(zones || 'à confirmer')}</span>
        <span><strong>Minimum:</strong> ${formatCurrency(rules.minimum_order || 35)}</span>
      </section>
      ${menuItems.length ? `<section class="section container">
        <div class="section-head"><div><div class="kicker">À commander maintenant</div><h2>Aperçu du menu actuel</h2><p>Items actifs et disponibles cette semaine. Cliquez pour voir toutes les portions, prix et options.</p></div><button class="btn btn-ghost" data-page="menu">Tout voir le menu</button></div>
        <div class="grid grid-3">${menuItems.map((item) => itemPreviewHtml(item)).join('')}</div>
      </section>` : ''}
      ${galleryCarouselHtml()}
      <section class="section container grid grid-4">
        ${['Choisissez vos plats', 'Sélectionnez Petit, Grand ou Familial', 'Planifiez votre livraison', 'Savourez vos repas faits maison'].map((text, index) => `<div class="card mini-card"><strong>${index + 1}. ${text}</strong><p>Un parcours simple, pensé pour commander rapidement sur téléphone.</p></div>`).join('')}
      </section>
      <section class="section container panel emotional-card">
        <div class="section-head"><div><div class="kicker">Confiance</div><h2>Fait maison, local et pensé pour les familles.</h2><p>Portions familiales, livraison dans les secteurs desservis, préavis de ${orderNoticeText()} et préparation soignée. Zones: ${escapeHtml(zones)}.</p></div><button class="btn btn-primary" data-page="livraison">Voir les conditions</button></div>
      </section>
      <section class="section container panel catering-callout"><div><div class="kicker">Demandes spéciales</div><h2>Vous avez vu un plat qui vous intéresse?</h2><p>Écrivez-nous pour une demande spéciale ou un événement. Les créations passées de la galerie peuvent inspirer votre prochaine commande traiteur.</p></div><button class="btn btn-primary" data-page="contact">Faire une demande</button></section>
      <section class="section container panel final-cta"><div class="kicker">${menuIsActive ? 'Prêt à commander?' : 'À bientôt'}</div><h2>${menuIsActive ? 'Voir le menu de la semaine' : 'Consultez le menu de la semaine'}</h2><p>${menuIsActive ? 'Le menu actuel affiche les plats disponibles, les portions, les prix et les dates de livraison.' : 'Les commandes sont fermées pour le moment. Consultez le menu pour connaître la prochaine période de commande.'}</p><div class="cta-row" style="justify-content:center">${menuIsActive ? '<button class="btn btn-primary" data-page="menu">Voir le menu de la semaine</button><button class="btn btn-secondary" data-page="commander">Planifier ma commande</button>' : '<button class="btn btn-primary" data-page="contact">Nous contacter</button>'}</div></section>`;
  }

  function itemImageHtml(item) {
    const image = itemImagePath(item);
    if (!image) return `<div class="food-placeholder" aria-label="Photo à venir"><span>Photo à venir</span><small>La cuisine de Rosalie</small></div>`;
    return `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.outerHTML='&lt;div class=&quot;food-placeholder&quot;&gt;&lt;span&gt;Photo à venir&lt;/span&gt;&lt;small&gt;La cuisine de Rosalie&lt;/small&gt;&lt;/div&gt;'">`;
  }

  function itemPreviewHtml(item) {
    const portions = getPortions(item);
    return `<article class="card menu-card" style="grid-template-columns:1fr">${itemImageHtml(item)}<div class="menu-card-body"><span class="badge">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="chip-row">${portions.map((p) => `<span class="chip">${p.label} ${formatCurrency(p.price)}</span>`).join('')}</div><button class="btn btn-ghost" data-page="menu">Voir dans le menu</button></div></article>`;
  }

  function menuBannerHtml() {
    const bannerPaths = [localAssetPath('banner.png'), 'assets/banner.png', 'assets/images/banner.png', 'assets/images/hero/banner.png'];
    return `<section class="menu-banner" aria-label="Real Food. Real Convenience."><img src="${bannerPaths[0]}" data-banner-paths="${escapeHtml(bannerPaths.join('|'))}" data-banner-index="0" alt="Real Food. Real Convenience. Homemade meals, ready when you are." loading="eager" decoding="async" onerror="const paths=this.dataset.bannerPaths.split('|');const next=Number(this.dataset.bannerIndex||0)+1;if(next<paths.length){this.dataset.bannerIndex=String(next);this.src=paths[next];}else{this.closest('.menu-banner').style.display='none';}"></section>`;
  }

  function menuPageHtml() {
    const menu = getCurrentMenu();
    const rules = getSettingRules();
    const promos = (state.data.promotions.active || []).filter((promo) => promo.enabled);
    const orderStatus = getMenuOrderStatus();
    const isOpen = orderStatus.open;
    return `
      <div class="container menu-layout">
        <div>
          ${menuBannerHtml()}
          <section class="menu-header">
            <div class="kicker">Menu en rotation</div><h1>${escapeHtml(menu.title || 'Menu de la semaine')}</h1><span class="status-badge ${isOpen ? '' : 'closed'}">${isOpen ? 'Commande ouverte' : 'Commandes fermées'}</span>
            <p class="lead">${escapeHtml(menu.description || 'Menu disponible pour commandes planifiées.')}</p><p class="notice ${isOpen ? 'success-note' : ''}">${menuOrderStatusMessage()}</p>
            <div class="chip-row"><span class="chip">Commande ${orderNoticeText()}</span><span class="chip">Livraison locale disponible</span><span class="chip">Petit / Grand / Familial</span><span class="chip">Minimum ${formatCurrency(rules.minimum_order || 35)}</span></div>
          </section>
          ${!menu.active ? `<section class="section menu-empty">${menuOrderStatusMessage()}</section>` : ''}${menu.active && !orderStatus.open ? `<section class="section menu-empty">${menuOrderStatusMessage()}</section>` : ''}${menu.active && promos.length ? `<section class="section panel promo"><strong>${escapeHtml(promos[0].title)}</strong><p>${escapeHtml(promos[0].description)}</p></section>` : ''}
          ${menu.active ? `${menuSectionHtml('Plats principaux', getMenuItems('items'))}${menuSectionHtml('Accompagnements & extras', getMenuItems('extras'))}` : ''}
        </div>
        ${cartPanelHtml(true)}
      </div>`;
  }

  function menuSectionHtml(title, items) {
    return `<section class="section"><div class="menu-section-title"><h2>${escapeHtml(title)}</h2></div><div class="grid">${items.map(menuItemHtml).join('')}</div></section>`;
  }

  function menuItemHtml(item) {
    const portions = getPortions(item);
    const selected = state.selectedPortions[item.id] || portions[0]?.key || 'standard';
    const qty = state.quantities[item.id] || 1;
    return `<article class="card menu-card ${item.available === false ? 'unavailable' : ''}">
      ${itemImageHtml(item)}
      <div class="menu-card-body">
        <span class="badge">${item.available === false ? 'De retour bientôt' : escapeHtml(item.category)}</span>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
        <div class="portion-grid" role="group" aria-label="Portions pour ${escapeHtml(item.title)}">
          ${portions.map((portion) => `<button class="portion-btn ${selected === portion.key ? 'active' : ''}" data-portion="${item.id}:${portion.key}">${portion.label}<small>${formatCurrency(portion.price)}</small></button>`).join('')}
        </div>
        <div class="item-actions">
          <div class="qty" aria-label="Quantité"><button data-menu-qty="${item.id}:-1" aria-label="Réduire">−</button><span>${qty}</span><button data-menu-qty="${item.id}:1" aria-label="Augmenter">+</button></div>
          <button class="btn btn-primary ${state.lastAddedKey === `${item.id}:${selected}` ? 'added' : ''}" data-add="${item.id}" ${(item.available === false || !getMenuOrderStatus().open) ? 'disabled' : ''}>${state.lastAddedKey === `${item.id}:${selected}` ? 'Ajouté ✓' : 'Ajouter au panier'}</button>
        </div>
      </div>
    </article>`;
  }

  function cartPanelHtml(includeButton = false) {
    const totals = cartTotals();
    const rules = getSettingRules();
    const lines = state.cart.items.map((line) => cartLineHtml(line)).join('');
    const min = Number(rules.minimum_order || 0);
    const threshold = Number(rules.free_delivery_threshold || 0);
    return `<aside class="cart-panel card" aria-label="Votre panier"><h2>Votre panier</h2>
      ${state.cart.items.length ? `<div class="cart-lines">${lines}</div>` : `<div class="cart-empty">Votre panier est vide. Ajoutez un plat du menu de la semaine.</div>`}
      <div class="cart-total"><span>Sous-total</span><span>${formatCurrency(totals.subtotal)}</span></div>
      ${totals.subtotal > 0 && totals.subtotal < min ? `<p class="notice">Minimum de commande: ${formatCurrency(min)}. Ajoutez ${formatCurrency(min - totals.subtotal)} pour commander.</p>` : ''}
      ${totals.subtotal >= threshold ? `<p class="notice success-note">Livraison gratuite atteinte (${formatCurrency(threshold)} et plus).</p>` : `<p class="notice">Livraison gratuite à partir de ${formatCurrency(threshold)}.</p>`}
      ${includeButton ? `<button class="btn btn-primary" data-page="commander" ${!getMenuOrderStatus().open ? 'disabled' : ''} style="width:100%;margin-top:12px">Voir le panier</button>` : ''}
    </aside>`;
  }

  function cartLineHtml(line) {
    return `<div class="cart-line"><div class="line-top"><div><div class="line-title">${escapeHtml(line.title)}</div><div class="line-meta">${escapeHtml(line.portionLabel)} • ${formatCurrency(line.price)}</div></div><strong>${formatCurrency(line.price * line.qty)}</strong></div><div class="line-actions"><div class="qty"><button data-line-qty="${line.itemId}:${line.portion}:-1" aria-label="Réduire">−</button><span>${line.qty}</span><button data-line-qty="${line.itemId}:${line.portion}:1" aria-label="Augmenter">+</button></div><button class="remove-btn" data-remove="${line.itemId}:${line.portion}">Retirer</button></div></div>`;
  }

  function normalizeDeliveryDate() {
    const first = firstAvailableDate();
    if (!first) return;
    const selectedStatus = state.cart.deliveryDate ? isDateAvailable(parseLocalDate(state.cart.deliveryDate)) : { ok: false };
    if (!state.cart.deliveryDate || !selectedStatus.ok) {
      state.cart.deliveryDate = first;
      saveCart();
    }
  }

  function commanderHtml() {
    const orderStatus = getMenuOrderStatus();
    if (!orderStatus.open) {
      const title = orderStatus.state === 'before' ? 'Commandes bientôt ouvertes' : 'Commandes fermées';
      return `<section class="container section panel"><div class="kicker">${title}</div><h1 class="page-title">${title}</h1><p class="lead">${escapeHtml(menuOrderStatusMessage())}</p><div class="cta-row"><button class="btn btn-primary" data-page="menu">Voir le message</button><button class="btn btn-secondary" data-page="contact">Nous contacter</button></div></section>`;
    }
    normalizeDeliveryDate();
    const errors = validateOrder();
    const totals = cartTotals();
    return `<div class="container"><div class="stepper" aria-label="Étapes de commande"><span class="step-pill active">1 Votre commande</span><span class="step-pill">2 Livraison</span><span class="step-pill">3 Coordonnées</span><span class="step-pill">4 Confirmation</span></div></div><div class="container checkout-grid">
      <div class="grid">
        <section class="card step"><h2><span class="step-number">1</span>Votre commande</h2>${cartPanelHtml(false)}</section>
        <section class="card step"><h2><span class="step-number">2</span>Livraison</h2>${deliveryInfoHtml()}${dateSelectorHtml()}${deliveryPreferencesHtml()}</section>
        <section class="card step"><h2><span class="step-number">3</span>Coordonnées</h2>${customerFormHtml()}</section>
      </div>
      <aside class="card cart-panel checkout-confirmation"><h2>Confirmation</h2>${checkoutDeliverySummaryHtml()}<div class="summary-row"><span>Total</span><span>${formatCurrency(totals.subtotal)}</span></div>${errors.length ? `<div class="notice">${errors.map(escapeHtml).join('<br>')}</div>` : `<div class="notice success-note">Commande prête pour le paiement sécurisé.</div>`}<button class="btn btn-primary" data-checkout ${errors.length ? 'disabled' : ''} style="width:100%;margin-top:12px">Passer au paiement sécurisé</button><p class="line-meta">Vous serez redirigé vers un paiement sécurisé. Aucune information de carte n’est conservée sur ce site.</p></aside>
    </div>`;
  }

  function dateSelectorHtml() {
    const first = firstAvailableDate();
    const start = first ? parseLocalDate(first) : new Date();
    const buttons = [];
    for (let i = 0; i < 14; i += 1) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const iso = toLocalIsoDate(date);
      const status = isDateAvailable(date);
      buttons.push(`<button class="date-btn ${status.ok ? '' : 'disabled'} ${state.cart.deliveryDate === iso ? 'selected' : ''}" data-date="${iso}" data-date-reason="${status.reason}" aria-disabled="${status.ok ? 'false' : 'true'}"><strong>${new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' }).format(date)}</strong><span>${DATE_REASONS[status.reason]}</span></button>`);
    }
    return `<p>Les dates de livraison disponibles respectent un délai minimal de préparation de 72h après votre commande.</p><p>${first ? `Prochaine livraison disponible: <strong>${formatDate(first)}</strong>.` : 'Aucune date de livraison disponible avec le délai de 72h.'}</p><div class="date-grid">${buttons.join('')}</div>${state.dateMessage ? `<p class="notice date-feedback">${escapeHtml(state.dateMessage)}</p>` : ''}<p class="line-meta">Les dates affichées respectent le délai minimal de préparation de 72h. Les livraisons commencent à partir de 13h. Les heures de livraison sont approximatives.</p><p class="line-meta">Jours de livraison: ${deliveryDayLabels()}.</p>`;
  }

  function customerFormHtml() {
    const c = state.cart.customer;
    const zones = getEnabledZones();
    const input = (key, label, attrs = '') => `<div class="field"><label for="${key}">${label}</label><input id="${key}" data-customer="${key}" value="${escapeHtml(c[key] || '')}" ${attrs}></div>`;
    return `<div class="form-grid">
      ${input('name', 'Nom complet', 'autocomplete="name"')}${input('phone', 'Téléphone', 'autocomplete="tel"')}${input('email', 'Courriel', 'autocomplete="email" type="email" required')}<p class="line-meta">Le courriel est requis afin que Rosalie puisse vous contacter au besoin concernant votre commande.</p>${input('streetNumber', 'Numéro civique')}${input('streetName', 'Rue', 'autocomplete="address-line1"')}${input('apartment', 'Appartement')}
      <div class="field"><label for="city">Ville</label><select id="city" data-customer="city"><option value="">Choisir une ville</option>${zones.map((zone) => `<option value="${escapeHtml(zone.city)}" ${c.city === zone.city ? 'selected' : ''}>${escapeHtml(zone.city)}</option>`).join('')}</select></div>
      ${input('postalCode', 'Code postal', 'autocomplete="postal-code"')}
      <div class="field full"><label for="notes">Instructions, allergies ou commentaires</label><textarea id="notes" data-customer="notes">${escapeHtml(c.notes || '')}</textarea></div>
    </div>`;
  }



  function deliveryInfoHtml() {
    return `<div class="notice success-note"><strong>Informations importantes pour la livraison</strong><br>Les livraisons commencent à partir de 13h.<br>Les heures de livraison sont approximatives.<br>Rosalie peut vous contacter par courriel si votre commande est prête à l’avance, si des informations supplémentaires sont nécessaires ou si une modification est requise.<br>Vous pouvez laisser une glacière à l’extérieur si vous ne souhaitez pas être présent au moment de la livraison.</div>`;
  }

  function deliveryPreferencesHtml() {
    const selected = (value, window) => value === window ? 'selected' : '';
    const optionList = (value) => `<option value="">Choisir une plage</option>${deliveryWindows().map((window) => `<option value="${escapeHtml(window)}" ${selected(value, window)}>${escapeHtml(window)}</option>`).join('')}`;
    return `<div class="form-grid" style="margin-top:14px">
      <div class="field"><label for="deliveryWindow1">Première plage horaire disponible</label><select id="deliveryWindow1" data-cart-field="deliveryWindow1" required>${optionList(state.cart.deliveryWindow1)}</select></div>
      <div class="field"><label for="deliveryWindow2">Deuxième plage horaire disponible</label><select id="deliveryWindow2" data-cart-field="deliveryWindow2" required>${optionList(state.cart.deliveryWindow2)}</select></div>
      <p class="line-meta full">Les livraisons commencent à partir de 13h. Les heures sont approximatives.</p>
      <label class="field full" style="display:flex;grid-template-columns:auto 1fr;align-items:start;gap:10px;font-weight:900"><input type="checkbox" data-cart-checkbox="coolerAvailable" ${state.cart.coolerAvailable ? 'checked' : ''} style="width:auto;min-height:24px;min-width:24px"> Je peux laisser une glacière à l’extérieur si je ne suis pas présent au moment de la livraison.</label>
      <div class="field full"><label for="deliveryInstructions">Instructions pour la livraison ou la glacière</label><textarea id="deliveryInstructions" data-cart-field="deliveryInstructions" placeholder="Exemple: glacière sur le balcon, sonner à la porte arrière, etc.">${escapeHtml(state.cart.deliveryInstructions || '')}</textarea></div>
    </div>`;
  }

  function checkoutDeliverySummaryHtml() {
    return `<div class="cart-lines"><p class="line-meta"><strong>Date de livraison:</strong> ${state.cart.deliveryDate ? formatDate(state.cart.deliveryDate) : 'Aucune date disponible'}</p><p class="line-meta"><strong>Première plage horaire disponible:</strong> ${escapeHtml(state.cart.deliveryWindow1 || 'À choisir')}</p><p class="line-meta"><strong>Deuxième plage horaire disponible:</strong> ${escapeHtml(state.cart.deliveryWindow2 || 'À choisir')}</p><p class="line-meta"><strong>Glacière disponible:</strong> ${state.cart.coolerAvailable ? 'Oui' : 'Non'}</p>${state.cart.deliveryInstructions ? `<p class="line-meta"><strong>Instructions de livraison/glacière:</strong> ${escapeHtml(state.cart.deliveryInstructions)}</p>` : ''}</div>`;
  }

  function traiteurHtml() {
    const services = ['Événements familiaux', 'Petits groupes', 'Repas préparés', 'Plateaux / formats familiaux', 'Menus personnalisés'];
    return `<section class="container hero"><div><div class="kicker">Traiteur & événements</div><h1>Des repas faits maison pour vos moments importants.</h1><p class="lead">Repas familiaux, événements privés, réunions et repas corporatifs: Rosalie peut préparer une proposition adaptée à votre groupe.</p><div class="quote-list">${services.map((service) => `<div class="quote-item">${service}</div>`).join('')}</div></div><div class="panel"><h2>Demander une soumission</h2><form class="form-grid" action="mailto:${escapeHtml(state.data.settings.business.email || state.data.settings.business.phone)}" method="post" enctype="text/plain"><div class="field"><label>Nom</label><input name="nom"></div><div class="field"><label>Téléphone / courriel</label><input name="contact"></div><div class="field"><label>Date de l’événement</label><input name="date" type="date"></div><div class="field"><label>Nombre de personnes</label><input name="personnes" type="number" min="1"></div><div class="field"><label>Ville</label><input name="ville"></div><div class="field"><label>Type d’événement</label><input name="type"></div><div class="field full"><label>Message</label><textarea name="message"></textarea></div><button class="btn btn-primary" type="submit">Demander une soumission</button></form></div></section>`;
  }

  function livraisonHtml() {
    const rules = getSettingRules();
    const zones = getEnabledZones();
    return `<div class="container grid grid-2"><section class="panel"><div class="kicker">Livraison</div><h1 class="page-title">Nous desservons plusieurs municipalités.</h1><p>Les commandes doivent être placées 72h à l’avance afin de garantir la préparation.</p><div class="grid grid-2">${zones.map((zone) => `<div class="mini-card card"><strong>${escapeHtml(zone.city)}</strong><span>${escapeHtml(zone.province)}</span></div>`).join('')}</div><div class="chip-row"><span class="chip">Minimum ${formatCurrency(rules.minimum_order || 35)}</span><span class="chip">Livraison gratuite ${formatCurrency(rules.free_delivery_threshold || 35)} et plus</span><span class="chip">Livraison à céduler avec le client</span></div></section><aside class="zone-map"><div>Zone locale<br><span style="font-size:2.4rem">Contrecoeur • Sorel • Varennes • Verchères</span><br>Saint-Roch-de-Richelieu</div></aside></div>`;
  }

  function contactHtml() {
    const business = state.data.settings.business;
    const trust = state.data.settings.trust || {};
    const zones = getEnabledZones().map((zone) => zone.city).join(', ');
    const legalName = business.legal_name || 'Les Entreprises Rosalie Vaisica';
    const operatingName = business.operating_name || business.name || 'La Cuisine de Rosalie';
    const ownerFullName = business.owner_full_name || 'Rosalie Vaisica';
    const mapaqNumber = business.mapaq_certification_number || 'À confirmer';
    return `<section class="container grid grid-2 contact-hero">
      <div class="panel">
        <div class="kicker">Contact</div>
        <h1 class="page-title">Parlez directement avec Rosalie.</h1>
        <p class="lead">Pour une commande, une question sur les menus ou une demande traiteur, nous répondons avec soin et transparence.</p>
        <div class="contact-actions">
          <a class="btn btn-primary" href="tel:${escapeHtml(business.phone)}">Appeler ${escapeHtml(business.phone)}</a>
          <a class="btn btn-secondary" href="${escapeHtml(business.facebook_url)}" target="_blank" rel="noopener">Facebook</a>
          <a class="btn btn-secondary" href="${escapeHtml(business.messenger_url || business.facebook_url)}" target="_blank" rel="noopener">Messenger</a>
        </div>
        <div class="grid grid-2 contact-details">
          <div class="detail-card"><strong>Commande</strong><span>${orderNoticeText()} pour assurer une préparation maison de qualité.</span></div>
          <div class="detail-card"><strong>Zones desservies</strong><span>${escapeHtml(zones)}.</span></div>
          <div class="detail-card"><strong>Demandes spéciales</strong><span>Formats familiaux, repas préparés et soumissions traiteur.</span></div>
          <div class="detail-card"><strong>Hygiène et salubrité</strong><span>${escapeHtml(trust.hygiene_statement || 'Formation en hygiène et salubrité alimentaires.')}</span></div>
        </div>
      </div>
      <aside class="panel identity-card" aria-label="Informations légales et certification">
        <div class="kicker">Identification officielle</div>
        <h2>Entreprise alimentaire locale</h2>
        <p>Ces renseignements sont affichés pour respecter les exigences applicables et identifier clairement la personne responsable.</p>
        <div class="identity-list">
          <div class="identity-row"><span class="identity-label">Nom légal</span><span class="identity-value legal">${escapeHtml(legalName)}</span></div>
          <div class="identity-row"><span class="identity-label">Nom utilisé</span><span class="identity-value">${escapeHtml(operatingName)}</span></div>
          <div class="identity-row"><span class="identity-label">Responsable</span><span class="identity-value">${escapeHtml(ownerFullName)}</span></div>
        </div>
        <div class="mapaq-badge"><span><strong>Certification MAPAQ</strong><small>Numéro de certification</small></span><strong>${escapeHtml(mapaqNumber)}</strong></div>
        <p class="notice success-note">Merci de soutenir une entreprise locale transparente et conforme.</p>
      </aside>
    </section>`;
  }



  const ADMIN_FILES = [
    ['dashboard', 'Tableau de bord'], ['assets/data/content.json', 'Accueil'], ['assets/data/settings.json', 'Entreprise'], ['assets/data/menus.json', 'Menu'], ['assets/data/items.json', 'Plats'], ['assets/data/delivery.json', 'Livraison'], ['assets/data/promotions.json', 'Promos'], ['assets/data/gallery.json', 'Galerie'], ['stripe', 'Stripe'],
  ];

  function cloneJson(value) { return JSON.parse(JSON.stringify(value || {})); }

  function adminDataForPath(path) {
    const key = path.split('/').pop().replace('.json', '');
    if (key === 'items') return { items: state.data.items || [] };
    return cloneJson(state.data[key]);
  }

  function ensureAdminWorking() {
    if (!state.admin.working) {
      state.admin.working = Object.fromEntries(ADMIN_FILES.filter(([path]) => !['stripe', 'dashboard'].includes(path)).map(([path]) => [path, adminDataForPath(path)]));
      state.admin.original = cloneJson(state.admin.working);
    }
  }

  function adminLaunchHtml() {
    return `<button class="admin-launch" data-page="admin" aria-label="Portail administrateur">?</button>`;
  }

  function adminGet(path) {
    if (!state.admin.working?.[state.admin.selectedFile]) return '';
    return path.split('.').reduce((value, part) => (value == null ? '' : value[Number.isInteger(Number(part)) ? Number(part) : part]), state.admin.working[state.admin.selectedFile]);
  }

  function adminSet(path, value) {
    const parts = path.split('.');
    let target = state.admin.working[state.admin.selectedFile];
    parts.slice(0, -1).forEach((part) => { target = target[Number.isInteger(Number(part)) ? Number(part) : part]; });
    const key = parts.at(-1);
    target[Number.isInteger(Number(key)) ? Number(key) : key] = value;
    state.admin.editorValid = true;
    state.admin.message = 'Changement prêt à soumettre.';
  }

  function adminInput(path, label, type = 'text', attrs = '') {
    const value = adminGet(path);
    return `<div class="field"><label>${escapeHtml(label)}</label><input data-admin-field="${escapeHtml(path)}" type="${type}" value="${escapeHtml(value)}" ${attrs}></div>`;
  }

  function adminTextarea(path, label) {
    return `<div class="field full"><label>${escapeHtml(label)}</label><textarea data-admin-field="${escapeHtml(path)}">${escapeHtml(adminGet(path))}</textarea></div>`;
  }

  function adminCheckbox(path, label) {
    return `<label class="admin-check"><input type="checkbox" data-admin-field="${escapeHtml(path)}" data-admin-type="boolean" ${adminGet(path) ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
  }

  function adminContentPanel() {
    return `<div class="admin-workbench"><div class="admin-card"><h3>Page d’accueil</h3><div class="admin-field-row">${adminInput('home.headline', 'Grand titre')}${adminInput('home.primary_cta', 'Bouton principal')}</div>${adminTextarea('home.subheadline', 'Texte sous le titre')}<div class="admin-field-row">${adminInput('home.secondary_cta', 'Bouton secondaire')}${adminInput('seo.title', 'Titre Google')}</div>${adminTextarea('seo.description', 'Description Google')}</div></div>`;
  }

  function adminSettingsPanel() {
    return `<div class="admin-workbench"><div class="admin-card"><h3>Identité</h3><div class="admin-field-row">${adminInput('business.name', 'Nom affiché')}${adminInput('business.tagline', 'Slogan')}${adminInput('business.phone', 'Téléphone')}${adminInput('business.facebook_url', 'Lien Facebook')}${adminInput('business.messenger_url', 'Lien Messenger')}${adminInput('business.mapaq_certification_number', 'Certification MAPAQ')}</div></div><div class="admin-card"><h3>Commandes</h3><div class="admin-field-row">${adminInput('ordering.minimum_order', 'Minimum de commande', 'number')}${adminInput('ordering.free_delivery_threshold', 'Livraison gratuite à partir de', 'number')}${adminInput('ordering.order_notice_hours', 'Préavis en heures', 'number')}</div>${adminCheckbox('ordering.enabled', 'Commandes activées')}</div></div>`;
  }

  function adminMenuPanel() {
    return `<div class="admin-workbench"><div class="admin-card"><h3>Menu en cours</h3><div class="admin-field-row">${adminInput('current_menu.title', 'Titre du menu')}${adminInput('current_menu.start_date', 'Date de début', 'date')}${adminInput('current_menu.end_date', 'Date de fin', 'date')}${adminInput('current_menu.order_open_at', 'Ouverture commandes')}${adminInput('current_menu.order_close_at', 'Fermeture commandes')}</div>${adminTextarea('current_menu.description', 'Description')}${adminCheckbox('current_menu.active', 'Menu actif')}</div></div>`;
  }

  function adminItemsPanel() {
    const items = adminGet('items') || [];
    return `<div class="admin-workbench"><div class="admin-warning"><strong>Important: prix et plats</strong>Si vous changez un plat, une disponibilité ou un prix, vous devez informer l’admin à <a href="mailto:rosalie.vaisica@crowdnet.33mail.com">rosalie.vaisica@crowdnet.33mail.com</a> pour une mise à jour Stripe. Sans cette mise à jour serveur, le paiement/checkout peut ne pas fonctionner.</div>${items.map((item, index) => `<div class="admin-card admin-item-card"><h3>${escapeHtml(item.title || `Plat ${index + 1}`)}</h3><div class="admin-field-row">${adminInput(`items.${index}.title`, 'Nom du plat')}${adminInput(`items.${index}.category`, 'Catégorie')}</div>${adminTextarea(`items.${index}.description`, 'Description client')}<div class="admin-price-grid">${adminInput(`items.${index}.pricing.petit`, 'Prix petit', 'number', 'step="0.01"')}${adminInput(`items.${index}.pricing.grand`, 'Prix grand', 'number', 'step="0.01"')}${adminInput(`items.${index}.pricing.familial`, 'Prix familial', 'number', 'step="0.01"')}</div><div class="admin-mini-actions">${adminCheckbox(`items.${index}.available`, 'Disponible')}${adminCheckbox(`items.${index}.featured`, 'Mettre en vedette')}</div></div>`).join('')}</div>`;
  }

  function adminDeliveryPanel() {
    const zones = adminGet('zones') || [];
    return `<div class="admin-workbench"><div class="admin-card"><h3>Règles de livraison</h3><div class="admin-field-row">${adminInput('rules.minimum_order', 'Minimum', 'number')}${adminInput('rules.free_delivery_threshold', 'Livraison gratuite', 'number')}${adminInput('rules.order_notice_hours', 'Préavis heures', 'number')}</div></div>${zones.map((zone, index) => `<div class="admin-card"><h3>${escapeHtml(zone.city || `Zone ${index + 1}`)}</h3><div class="admin-field-row">${adminInput(`zones.${index}.city`, 'Ville')}${adminInput(`zones.${index}.province`, 'Province')}</div>${adminCheckbox(`zones.${index}.enabled`, 'Zone active')}</div>`).join('')}</div>`;
  }

  function adminPromotionsPanel() {
    const promos = adminGet('active') || [];
    return `<div class="admin-workbench">${promos.map((promo, index) => `<div class="admin-card"><h3>${escapeHtml(promo.title || `Promotion ${index + 1}`)}</h3><div class="admin-field-row">${adminInput(`active.${index}.title`, 'Titre')}${adminInput(`active.${index}.code`, 'Code')}</div>${adminTextarea(`active.${index}.description`, 'Description')}${adminCheckbox(`active.${index}.enabled`, 'Promotion active')}</div>`).join('') || '<div class="admin-card"><h3>Aucune promotion</h3><p>Les promotions existantes apparaîtront ici.</p></div>'}</div>`;
  }

  function adminGalleryPanel() {
    const slides = adminGet('slides') || [];
    return `<div class="admin-workbench">${slides.map((slide, index) => `<div class="admin-card"><h3>${escapeHtml(slide.title || `Image ${index + 1}`)}</h3><div class="admin-field-row">${adminInput(`slides.${index}.title`, 'Titre')}${adminInput(`slides.${index}.badge`, 'Badge')}${adminInput(`slides.${index}.image`, 'Image')}${adminInput(`slides.${index}.cta_label`, 'Bouton')}</div>${adminTextarea(`slides.${index}.subtitle`, 'Texte')}${adminCheckbox(`slides.${index}.enabled`, 'Image active')}</div>`).join('') || '<div class="admin-card"><h3>Galerie automatique</h3><p>Les images des plats disponibles alimentent déjà la galerie.</p></div>'}</div>`;
  }

  function formatMoney(cents, currency = 'cad') {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: String(currency || 'cad').toUpperCase() }).format(Number(cents || 0) / 100);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function orderStats() {
    const orders = state.admin.orders.data?.orders || [];
    const totalCents = orders.reduce((sum, order) => sum + Number(order.subtotal_cents || 0), 0);
    const itemCount = orders.reduce((sum, order) => sum + (order.items || []).reduce((lineSum, item) => lineSum + Number(item.quantity || 0), 0), 0);
    const pending = orders.filter((order) => String(order.payment_status || '').toLowerCase() !== 'paid').length;
    const nextDelivery = orders.map((order) => order.delivery?.date).filter(Boolean).sort()[0] || '—';
    return { orders, totalCents, itemCount, pending, nextDelivery };
  }

  function adminDashboardPanel() {
    const ordersState = state.admin.orders;
    const { orders, totalCents, itemCount, pending, nextDelivery } = orderStats();
    const recentOrders = [...orders].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 12);
    const statusClass = ordersState.message.includes('Erreur') ? '' : 'success-note';
    return `<div class="admin-workbench"><div class="admin-home-hero"><div><div class="kicker">Bienvenue</div><h2>Centre des commandes</h2><p>Connecté à ${escapeHtml(ordersState.owner)}/${escapeHtml(ordersState.repo)} pour lire ${escapeHtml(ordersState.path)} avec votre token GitHub. Les commandes du worker deviennent un tableau clair pour les décisions du jour.</p><div class="cta-row"><button class="btn btn-primary" data-orders-refresh ${ordersState.loading ? 'disabled' : ''}>${ordersState.loading ? 'Actualisation…' : 'Actualiser orders.json'}</button></div></div><div class="admin-home-stats"><div class="admin-stat"><span>Commandes</span><strong>${orders.length}</strong></div><div class="admin-stat"><span>Revenus</span><strong>${formatMoney(totalCents, orders[0]?.currency || 'cad')}</strong></div><div class="admin-stat"><span>Articles</span><strong>${itemCount}</strong></div><div class="admin-stat"><span>À confirmer</span><strong>${pending}</strong></div></div></div><div class="admin-card"><div class="orders-toolbar"><div><h3>Résumé opérationnel</h3><p>Prochaine livraison: <strong>${escapeHtml(nextDelivery)}</strong> • orders.json mis à jour: <strong>${escapeHtml(formatDateTime(ordersState.data?.updated_at))}</strong></p></div><span class="status-badge">${ordersState.lastFetchedAt ? `Lu ${escapeHtml(formatDateTime(ordersState.lastFetchedAt))}` : 'Prêt'}</span></div>${ordersState.message ? `<p class="notice ${statusClass}">${escapeHtml(ordersState.message)}</p>` : ''}</div><div class="orders-grid">${recentOrders.map((order) => `<article class="order-card"><div class="order-card-head"><div><h3>${escapeHtml(order.customer?.name || 'Client')}</h3><div class="order-meta"><span>${escapeHtml(order.business || '')}</span><span>${escapeHtml(formatDateTime(order.created_at))}</span></div></div><span class="status-badge ${String(order.payment_status).toLowerCase() === 'unconfirmed' ? 'closed' : ''}">${escapeHtml(order.payment_status || 'inconnu')}</span></div><div class="order-delivery"><div>Livraison<br>${escapeHtml(order.delivery?.date || '—')}</div><div>Fenêtres<br>${escapeHtml([order.delivery?.window_1, order.delivery?.window_2].filter(Boolean).join(' / ') || '—')}</div><div>Contact<br>${escapeHtml(order.customer?.phone || '—')}</div><div>Total<br>${formatMoney(order.subtotal_cents, order.currency)}</div></div><div class="order-lines">${(order.items || []).map((item) => `<div class="order-line"><span>${Number(item.quantity || 0)}× ${escapeHtml(item.title || 'Article')} <small>${escapeHtml(item.portion_label || '')}</small></span><strong>${formatMoney(item.line_total_cents, order.currency)}</strong></div>`).join('')}</div>${order.delivery?.instructions ? `<p class="notice">Instruction: ${escapeHtml(order.delivery.instructions)}</p>` : ''}</article>`).join('') || '<div class="admin-empty">Aucune commande chargée. Cliquez Actualiser orders.json pour lire les dernières commandes.</div>'}</div></div>`;
  }

  function adminPanelHtml(path) {
    if (path === 'dashboard') return adminDashboardPanel();
    if (path === 'stripe') return adminStripePanel();
    const panels = { 'assets/data/content.json': adminContentPanel, 'assets/data/settings.json': adminSettingsPanel, 'assets/data/menus.json': adminMenuPanel, 'assets/data/items.json': adminItemsPanel, 'assets/data/delivery.json': adminDeliveryPanel, 'assets/data/promotions.json': adminPromotionsPanel, 'assets/data/gallery.json': adminGalleryPanel };
    return (panels[path] || adminContentPanel)();
  }

  function adminSummaryHtml(path) {
    if (path === 'dashboard') return '';
    if (path === 'stripe') return adminStripeSummaryHtml();
    const current = state.admin.working[path];
    const original = state.admin.original[path];
    const changed = JSON.stringify(current) !== JSON.stringify(original);
    const stripeWarning = path === 'assets/data/items.json' ? `<div class="admin-warning" style="margin-bottom:12px"><strong>Action admin requise</strong>Après une modification de plat ou de prix, écrivez à <a href="mailto:rosalie.vaisica@crowdnet.33mail.com">rosalie.vaisica@crowdnet.33mail.com</a> pour synchroniser Stripe.</div>` : '';
    return `<aside class="panel admin-panel admin-preview">${stripeWarning}<div class="kicker">Aperçu</div><h2>${changed ? 'Changements détectés' : 'Aucun changement'}</h2><div class="admin-preview-box"><strong>${escapeHtml(ADMIN_FILES.find(([file]) => file === path)?.[1] || 'Section')}</strong><p>${changed ? 'Vérifiez les champs, puis cliquez Soumettre pour enregistrer.' : 'Modifiez un champ pour préparer une mise à jour.'}</p></div><div class="cta-row"><button class="btn btn-ghost" data-admin-reset>Annuler</button><button class="btn btn-primary" data-admin-submit ${state.admin.saving ? 'disabled' : ''}>${state.admin.saving ? 'Soumission…' : 'Soumettre'}</button></div>${state.admin.message ? `<p class="notice ${state.admin.message.includes('succès') ? 'success-note' : ''}">${escapeHtml(state.admin.message)}</p>` : ''}</aside>`;
  }

  function adminHtml() {
    const admin = state.admin;
    if (!admin.authenticated) {
      return `<section class="container section panel admin-panel admin-login-card"><div class="kicker">Admin console</div><h1 class="page-title">Admin console</h1><div class="field"><label for="adminToken">Access key</label><input id="adminToken" class="admin-secret" data-admin-auth="token" value="${escapeHtml(admin.token)}" type="password" autocomplete="off"></div><label class="admin-remember"><input type="checkbox" data-admin-remember ${admin.rememberKey ? 'checked' : ''}> Remember access key locally</label><div class="cta-row"><button class="btn btn-primary" data-admin-login>Login</button><button class="btn btn-secondary" data-page="home">Retour</button></div>${admin.message ? `<p class="notice">${escapeHtml(admin.message)}</p>` : ''}</section>`;
    }
    ensureAdminWorking();
    const path = admin.selectedFile;
    return `<div class="container admin-shell section"><aside class="panel admin-panel"><div class="kicker">Admin console</div><h1 class="admin-title">Modifier le site</h1><p>Choisissez une section, changez les champs importants, puis soumettez. La section Stripe synchronise le catalogue depuis GitHub.</p><div class="admin-tabs">${ADMIN_FILES.map(([file,label]) => `<button class="btn ${file === path ? 'btn-olive' : 'btn-secondary'} admin-tab" data-admin-file="${escapeHtml(file)}">${escapeHtml(label)}</button>`).join('')}</div><div class="cta-row"><button class="btn btn-secondary" data-admin-logout>Verrouiller</button></div></aside><section class="panel admin-panel"><div class="section-head"><div><div class="kicker">Éditeur simple</div><h2>${escapeHtml(ADMIN_FILES.find(([file]) => file === path)?.[1] || 'Contenu')}</h2><p>Pas de code à toucher: chaque champ correspond à un élément visible ou important du site.</p></div></div>${adminPanelHtml(path)}</section>${adminSummaryHtml(path)}</div>`;
  }

  async function githubPutJson(path, data) {
    const { token, owner, repo, branch } = state.admin;
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
    const getResponse = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    const current = getResponse.ok ? await getResponse.json() : {};
    const body = { message: `Update ${path} from RVSITE admin portal`, content: btoa(unescape(encodeURIComponent(`${JSON.stringify(data, null, 2)}\n`))), branch };
    if (current.sha) body.sha = current.sha;
    const response = await fetch(api, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `GitHub a retourné ${response.status}`);
    return result;
  }

  async function githubGetJsonFromRepo({ owner, repo, branch, path }) {
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
    const response = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${state.admin.token}`, Accept: 'application/vnd.github+json' } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `GitHub a retourné ${response.status}`);
    const encoded = String(result.content || '').replace(/\s/g, '');
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  }

  async function refreshAdminOrders() {
    const orders = state.admin.orders;
    orders.loading = true;
    orders.message = 'Lecture de orders.json dans RVSITE_BRIDGE…';
    render();
    try {
      orders.data = await githubGetJsonFromRepo(orders);
      orders.updatedAt = orders.data?.updated_at || '';
      orders.lastFetchedAt = new Date().toISOString();
      orders.message = `${orders.data?.orders?.length || 0} commande(s) chargée(s) depuis RVSITE_BRIDGE.`;
    } catch (error) {
      orders.message = `Erreur orders.json: ${error.message}`;
    } finally {
      orders.loading = false;
      render();
    }
  }


  const STRIPE_API_BASE = 'https://api.stripe.com/v1';
  const TOOL_SOURCE = 'rvsite_stripe_manager';
  const STRIPE_TOOL_VERSION = 'js-portal-1.0.0';

  function stripeOptions() {
    const stripe = state.admin.stripe;
    return { project_slug: stripe.projectSlug || 'lacuisine_rosalie', currency: (stripe.currency || 'cad').toLowerCase(), environment: stripe.environment || (stripe.apiKey.startsWith('sk_live_') ? 'live' : 'test'), archive_missing_items: true };
  }

  function centsToAmount(cents) { return Math.round(Number(cents || 0)) / 100; }
  function moneyToCents(value) {
    const amount = Number(String(value ?? '').trim().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Prix invalide: ${value}`);
    return Math.round(amount * 100);
  }
  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  async function stableHash(payload) {
    const bytes = new TextEncoder().encode(canonicalJson(payload));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  async function productHashFor(item, menuId) {
    return stableHash({ item_id: item.item_id, title: item.title, description: item.description, category: item.category, menu_id: menuId, active: item.available });
  }
  function pythonFloatString(value) {
    const number = Number(value);
    return Number.isInteger(number) ? `${number.toFixed(1)}` : `${number}`;
  }
  async function priceHashFor(itemId, portionKey, amount, currency) {
    const normalized = `{"amount":${pythonFloatString(amount)},"currency":${JSON.stringify(currency.toLowerCase())},"item_id":${JSON.stringify(itemId)},"portion_key":${JSON.stringify(portionKey)}}`;
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  async function githubGetJson(path) {
    const { token, owner, repo, branch } = state.admin;
    const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
    const response = await fetch(api, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `GitHub a retourné ${response.status}`);
    return JSON.parse(decodeURIComponent(escape(atob(String(result.content || '').replace(/\s/g, '')))));
  }

  async function loadGithubLocalCatalog() {
    const [itemsData, menusData] = await Promise.all([githubGetJson('assets/data/items.json'), githubGetJson('assets/data/menus.json')]);
    const rawItems = Array.isArray(itemsData.items) ? itemsData.items : [];
    const warnings = [];
    const lookup = new Map();
    rawItems.forEach((raw) => { if (raw?.id) lookup.set(String(raw.id).trim(), raw); else warnings.push('Un plat sans id dans items.json a été ignoré.'); });
    const menu = menusData.current_menu || { id: 'available-items', title: 'Available items', active: true };
    let orderedIds = [...(menu.item_ids || []).map((id) => [String(id), 'item_ids']), ...(menu.extra_ids || []).map((id) => [String(id), 'extra_ids'])];
    if (!orderedIds.length) orderedIds = [...lookup.entries()].filter(([, raw]) => raw.available !== false).map(([id]) => [id, 'available_items']);
    const items = [];
    const missing = [];
    for (const [itemId, source] of orderedIds) {
      const raw = lookup.get(itemId);
      if (!raw) { missing.push(itemId); continue; }
      if (raw.available === false) { warnings.push(`Plat indisponible ignoré: ${itemId}`); continue; }
      const pricing = {};
      Object.entries(raw.pricing || {}).forEach(([key, value]) => { try { if (moneyToCents(value) > 0) pricing[String(key).trim().toLowerCase()] = Number(Number(value).toFixed(2)); } catch {} });
      if (!Object.keys(pricing).length) { warnings.push(`Plat sans prix positif valide: ${itemId}`); continue; }
      const item = { item_id: itemId, title: raw.title || itemId, description: raw.description || '', category: raw.category || '', available: raw.available !== false, pricing, source };
      item.product_hash = await productHashFor(item, String(menu.id || ''));
      items.push(item);
    }
    if (missing.length) warnings.push(`Le menu référence des IDs inconnus: ${missing.join(', ')}`);
    return { menu_id: String(menu.id || ''), title: String(menu.title || ''), start_date: String(menu.start_date || ''), end_date: String(menu.end_date || ''), active: menu.active !== false, items, missing_ids: missing, warnings, source_mode: 'current_menu_only' };
  }

  async function stripeRequest(method, path, data = null) {
    const body = data ? new URLSearchParams(data) : undefined;
    const response = await fetch(`${STRIPE_API_BASE}${path}`, { method, headers: { Authorization: `Bearer ${state.admin.stripe.apiKey.trim()}`, 'Stripe-Version': '2024-06-20', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `Stripe a retourné ${response.status}`);
    return payload;
  }
  async function stripeListAll(path, params = {}) {
    const results = []; let cursor = '';
    do { const query = new URLSearchParams({ limit: 100, ...params, ...(cursor ? { starting_after: cursor } : {}) }); const page = await stripeRequest('GET', `${path}?${query}`); results.push(...(page.data || [])); cursor = page.has_more && page.data?.length ? page.data.at(-1).id : ''; } while (cursor);
    return results;
  }
  async function fetchManagedStripeCatalog() {
    const project = stripeOptions().project_slug;
    const rawProducts = await stripeListAll('/products');
    const products = rawProducts.filter((p) => p.metadata?.source === TOOL_SOURCE && p.metadata?.project === project).map((p) => ({ product_id: p.id, item_id: p.metadata.item_id || '', name: p.name || '', description: p.description || '', active: !!p.active, metadata: p.metadata || {} }));
    const productIds = new Set(products.map((p) => p.product_id));
    const rawPrices = await stripeListAll('/prices');
    const prices = rawPrices.filter((p) => productIds.has(p.product) && p.metadata?.source === TOOL_SOURCE && p.metadata?.project === project).map((p) => ({ price_id: p.id, product_id: p.product, item_id: p.metadata.item_id || '', portion_key: p.metadata.portion_key || '', amount: Number(p.unit_amount || 0), currency: (p.currency || '').toLowerCase(), active: !!p.active, metadata: p.metadata || {} }));
    const warnings = [];
    return { products, prices, ignored_external_count: rawProducts.length - products.length, warnings, raw_products: rawProducts, raw_prices: rawPrices };
  }

  async function buildStripeSyncPlan(localCatalog, stripeCatalog) {
    const options = stripeOptions(); const productsByItem = new Map(stripeCatalog.products.filter((p) => p.item_id).map((p) => [p.item_id, p]));
    const activePrices = new Map(stripeCatalog.prices.filter((p) => p.active).map((p) => [`${p.item_id}:${p.portion_key}`, p]));
    const localIds = new Set(localCatalog.items.map((i) => i.item_id));
    const actions = [];
    for (const item of localCatalog.items) {
      const product = productsByItem.get(item.item_id);
      const productPayload = { name: item.title, description: item.description, active: true, metadata: { source: TOOL_SOURCE, project: options.project_slug, item_id: item.item_id, menu_id: localCatalog.menu_id, local_hash: item.product_hash, created_by_tool_version: STRIPE_TOOL_VERSION } };
      if (!product) actions.push({ action_type: 'CREATE_PRODUCT', item_id: item.item_id, title: item.title, portion_key: null, reason: 'Local menu item does not exist in managed Stripe catalog.', payload: productPayload, risk: 'medium' });
      else if (product.name !== item.title || (item.description && product.description !== item.description) || !product.active || product.metadata.local_hash !== item.product_hash) actions.push({ action_type: 'UPDATE_PRODUCT', item_id: item.item_id, title: item.title, portion_key: null, reason: 'Product name, description, active state, or local hash changed.', payload: { ...productPayload, product_id: product.product_id }, risk: 'low' });
      for (const [portionKey, amount] of Object.entries(item.pricing)) {
        const cents = moneyToCents(amount); const price = activePrices.get(`${item.item_id}:${portionKey}`); const payload = { item_id: item.item_id, portion_key: portionKey, amount_cents: cents, currency: options.currency, local_hash: await priceHashFor(item.item_id, portionKey, amount, options.currency), ...(product ? { product_id: product.product_id } : {}) };
        if (!price) actions.push({ action_type: 'CREATE_PRICE', item_id: item.item_id, title: item.title, portion_key: portionKey, reason: 'Local portion price does not exist in Stripe.', payload, risk: 'medium', local_price: amount, stripe_price: null });
        else if (price.amount === cents && price.currency === options.currency) actions.push({ action_type: 'UNCHANGED', item_id: item.item_id, title: item.title, portion_key: portionKey, reason: 'Stripe price amount and currency match local JSON.', payload: { ...payload, price_id: price.price_id }, risk: 'none', local_price: amount, stripe_price: centsToAmount(price.amount) });
        else { actions.push({ action_type: 'CREATE_PRICE', item_id: item.item_id, title: item.title, portion_key: portionKey, reason: 'Local amount/currency changed; Stripe Prices are immutable, so create replacement price.', payload, risk: 'medium', local_price: amount, stripe_price: centsToAmount(price.amount) }); actions.push({ action_type: 'ARCHIVE_PRICE', item_id: item.item_id, title: item.title, portion_key: portionKey, reason: 'Archive replaced old managed Stripe price.', payload: { price_id: price.price_id }, risk: 'medium', local_price: amount, stripe_price: centsToAmount(price.amount) }); }
      }
    }
    stripeCatalog.products.forEach((product) => { if (!localIds.has(product.item_id)) { stripeCatalog.prices.filter((p) => p.product_id === product.product_id && p.active).forEach((price) => actions.push({ action_type: 'ARCHIVE_PRICE', item_id: product.item_id, title: product.name, portion_key: price.portion_key, reason: 'Managed Stripe product is no longer in the current local menu.', payload: { price_id: price.price_id }, risk: 'medium' })); if (product.active) actions.push({ action_type: 'ARCHIVE_PRODUCT', item_id: product.item_id, title: product.name, portion_key: null, reason: 'Managed Stripe product is no longer in the current local menu.', payload: { product_id: product.product_id }, risk: 'medium' }); } });
    if (stripeCatalog.ignored_external_count) actions.push({ action_type: 'IGNORED', item_id: '', title: 'External Stripe products', portion_key: null, reason: `${stripeCatalog.ignored_external_count} Stripe products were not created by this tool/project and will not be touched.`, payload: {}, risk: 'none' });
    const summary = Object.fromEntries(['CREATE_PRODUCT', 'UPDATE_PRODUCT', 'CREATE_PRICE', 'ARCHIVE_PRICE', 'ARCHIVE_PRODUCT', 'UNCHANGED', 'IGNORED'].map((type) => [type, actions.filter((a) => a.action_type === type).length]));
    return { actions, warnings: [...(localCatalog.warnings || []), ...(stripeCatalog.warnings || [])], errors: [], summary };
  }

  function flattenMetadata(metadata) { return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`metadata[${key}]`, String(value)])); }
  function productWritePayload(payload) { return { name: String(payload.name), active: 'true', ...(payload.description ? { description: String(payload.description) } : {}), ...flattenMetadata(payload.metadata || {}) }; }
  async function executeStripeSyncPlan() {
    const stripe = state.admin.stripe; const options = stripeOptions(); const localCatalog = stripe.repoCatalog; const plan = stripe.plan;
    const productsByItem = new Map((stripe.stripeCatalog.products || []).map((p) => [p.item_id, p.product_id])); const priceRecords = [...(stripe.stripeCatalog.prices || [])];
    const results = { started_at: new Date().toISOString(), actions: [], errors: [], archived: { products: [], prices: [] } };
    const record = (action, status, response) => results.actions.push({ action, status, response });
    for (const type of ['CREATE_PRODUCT', 'UPDATE_PRODUCT', 'CREATE_PRICE', 'ARCHIVE_PRICE', 'ARCHIVE_PRODUCT']) for (const action of plan.actions.filter((a) => a.action_type === type)) {
      try {
        let response;
        if (type === 'CREATE_PRODUCT') { response = await stripeRequest('POST', '/products', productWritePayload(action.payload)); productsByItem.set(action.item_id, response.id); }
        if (type === 'UPDATE_PRODUCT') { response = await stripeRequest('POST', `/products/${action.payload.product_id}`, productWritePayload(action.payload)); productsByItem.set(action.item_id, response.id); }
        if (type === 'CREATE_PRICE') { const productId = productsByItem.get(action.item_id) || action.payload.product_id; response = await stripeRequest('POST', '/prices', { product: productId, currency: options.currency, unit_amount: String(action.payload.amount_cents), nickname: action.portion_key || '', ...flattenMetadata({ source: TOOL_SOURCE, project: options.project_slug, item_id: action.item_id, portion_key: action.portion_key || '', local_hash: action.payload.local_hash, created_by_tool_version: STRIPE_TOOL_VERSION }) }); priceRecords.push({ price_id: response.id, product_id: productId, item_id: action.item_id, portion_key: action.portion_key || '', amount: Number(response.unit_amount || 0), currency: options.currency, active: true, metadata: response.metadata || {} }); }
        if (type === 'ARCHIVE_PRICE') { response = await stripeRequest('POST', `/prices/${action.payload.price_id}`, { active: 'false' }); results.archived.prices.push(action.payload.price_id); }
        if (type === 'ARCHIVE_PRODUCT') { response = await stripeRequest('POST', `/products/${action.payload.product_id}`, { active: 'false' }); results.archived.products.push(action.payload.product_id); }
        record(action, 'success', response);
      } catch (error) { results.errors.push({ action, error: error.message }); record(action, 'failed', error.message); break; }
      if (results.errors.length) break;
    }
    const freshCatalog = results.errors.length ? { products: stripe.stripeCatalog.products, prices: priceRecords } : await fetchManagedStripeCatalog();
    const catalog = await buildWorkerStripeCatalog(localCatalog, freshCatalog, productsByItem, results.archived, options);
    await githubPutJson('assets/data/stripe_catalog.json', catalog);
    results.finished_at = new Date().toISOString(); results.worker_catalog = catalog; stripe.results = results; stripe.stripeCatalog = freshCatalog; stripe.plan = await buildStripeSyncPlan(localCatalog, freshCatalog); return results;
  }
  async function buildWorkerStripeCatalog(localCatalog, stripeCatalog, fallbackProducts, archived, options) {
    const productsByItem = new Map((stripeCatalog.products || []).filter((p) => p.active).map((p) => [p.item_id, p.product_id])); fallbackProducts.forEach((v, k) => { if (!productsByItem.has(k)) productsByItem.set(k, v); });
    const prices = new Map((stripeCatalog.prices || []).filter((p) => p.active && p.currency === options.currency).map((p) => [`${p.item_id}:${p.portion_key}`, p])); const items = {};
    for (const item of localCatalog.items) { const pricesOut = {}; for (const [portion, amount] of Object.entries(item.pricing)) { const rec = prices.get(`${item.item_id}:${portion}`); pricesOut[portion] = { price_id: rec?.price_id || '', amount, currency: options.currency, active: !!rec, local_hash: await priceHashFor(item.item_id, portion, amount, options.currency) }; } items[item.item_id] = { title: item.title, category: item.category, product_id: productsByItem.get(item.item_id) || '', active: true, local_hash: item.product_hash, prices: pricesOut }; }
    return { app: 'RVSITE Stripe Manager', version: STRIPE_TOOL_VERSION, project: options.project_slug, environment: options.environment, currency: options.currency, synced_at: new Date().toISOString(), source_files: { items_json: 'assets/data/items.json', menus_json: 'assets/data/menus.json' }, menu: { id: localCatalog.menu_id, title: localCatalog.title, start_date: localCatalog.start_date, end_date: localCatalog.end_date }, items, archived };
  }

  function adminStripePanel() {
    const s = state.admin.stripe; const summary = s.plan?.summary || {}; const actionRows = (s.plan?.actions || []).slice(0, 80).map((a) => `<tr><td>${escapeHtml(a.action_type)}</td><td>${escapeHtml(a.item_id)}</td><td>${escapeHtml(a.portion_key || '—')}</td><td>${escapeHtml(a.reason)}</td></tr>`).join('');
    return `<div class="admin-workbench"><div class="admin-card"><h3>Synchronisation Stripe</h3><p>Entrez la clé Stripe; le portail lit ensuite assets/data/items.json et assets/data/menus.json directement dans le dépôt RVSITE avec le token GitHub déjà fourni.</p><div class="admin-field-row"><div class="field"><label>Stripe API key</label><input data-stripe-field="apiKey" class="admin-secret" type="password" value="${escapeHtml(s.apiKey)}" placeholder="sk_test_..."></div><div class="field"><label>Projet</label><input data-stripe-field="projectSlug" value="${escapeHtml(s.projectSlug)}"></div><div class="field"><label>Devise</label><input data-stripe-field="currency" value="${escapeHtml(s.currency)}"></div><div class="field"><label>Mode</label><select data-stripe-field="environment"><option value="test" ${s.environment === 'test' ? 'selected' : ''}>test</option><option value="live" ${s.environment === 'live' ? 'selected' : ''}>live</option></select></div></div><div class="cta-row"><button class="btn btn-secondary" data-stripe-fetch ${s.loading ? 'disabled' : ''}>${s.loading ? 'Chargement…' : 'Charger catalogue + plan'}</button><button class="btn btn-primary" data-stripe-update ${(!s.plan || s.updating) ? 'disabled' : ''}>${s.updating ? 'Mise à jour…' : 'UPDATE Stripe'}</button></div>${s.message ? `<p class="notice ${s.message.includes('succès') ? 'success-note' : ''}">${escapeHtml(s.message)}</p>` : ''}</div><div class="admin-card"><h3>Plan</h3><p>${Object.entries(summary).map(([k,v]) => `${escapeHtml(k)}: <strong>${v}</strong>`).join(' • ') || 'Aucun plan chargé.'}</p><div style="overflow:auto"><table><tbody>${actionRows || '<tr><td>Aucune action.</td></tr>'}</tbody></table></div></div></div>`;
  }
  function adminStripeSummaryHtml() {
    const s = state.admin.stripe; return `<aside class="panel admin-panel admin-preview"><div class="kicker">Stripe</div><h2>${s.stripeCatalog ? `${s.stripeCatalog.products.length} produits gérés` : 'Catalogue non chargé'}</h2><div class="admin-preview-box"><strong>Source GitHub</strong><p>${escapeHtml(state.admin.owner)}/${escapeHtml(state.admin.repo)}@${escapeHtml(state.admin.branch)} → assets/data/items.json + menus.json</p><p>${s.repoCatalog ? `${s.repoCatalog.items.length} plats locaux prêts.` : 'Cliquez Charger pour créer le plan.'}</p></div></aside>`;
  }

  function footerHtml() {
    return `<footer class="footer container"><div class="footer-grid"><div><strong>La cuisine de Rosalie</strong><p>Repas faits maison • Livraison locale • Portions Petit / Grand / Familial</p></div><div><strong>Commande</strong><p>72h à l’avance<br>Minimum ${formatCurrency(getSettingRules().minimum_order || 35)}</p></div><div><strong>Contact</strong><p>${escapeHtml(state.data.settings.business.phone)}<br><a href="${escapeHtml(state.data.settings.business.facebook_url)}">Facebook</a></p></div></div></footer>`;
  }

  function mobileCartBarHtml() {
    const totals = cartTotals();
    return `<div class="mobile-cart-bar ${totals.count ? '' : 'empty'}"><span>${totals.count} article${totals.count > 1 ? 's' : ''} • ${formatCurrency(totals.subtotal)}</span><button data-page="commander">Voir le panier</button></div>`;
  }

  function render() {
    const root = document.getElementById('webframe-root');
    const pages = { home: homeHtml, menu: menuPageHtml, commander: commanderHtml, traiteur: traiteurHtml, livraison: livraisonHtml, contact: contactHtml, admin: adminHtml };
    root.innerHTML = `<div class="site">${navHtml()}<main>${(pages[state.page] || homeHtml)()}</main>${footerHtml()}${mobileCartBarHtml()}${adminLaunchHtml()}<div class="toast" role="status" aria-live="polite"></div></div>`;
    bindEvents(root);
    bindGalleryEvents(root);
  }

  function bindEvents(root) {
    root.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
    root.querySelector('[data-menu-toggle]')?.addEventListener('click', (event) => {
      const topbar = root.querySelector('#topbar');
      topbar.classList.toggle('open');
      event.currentTarget.setAttribute('aria-expanded', topbar.classList.contains('open'));
    });
    root.querySelectorAll('[data-portion]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, portion] = button.dataset.portion.split(':'); state.selectedPortions[itemId] = portion; render();
    }));
    root.querySelectorAll('[data-menu-qty]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, delta] = button.dataset.menuQty.split(':'); state.quantities[itemId] = Math.max(1, (state.quantities[itemId] || 1) + Number(delta)); render();
    }));
    root.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => {
      const item = getItemById(button.dataset.add); if (!item) return;
      const portion = state.selectedPortions[item.id] || getPortions(item)[0]?.key; addToCart(item, portion, state.quantities[item.id] || 1);
    }));
    root.querySelectorAll('[data-line-qty]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, portion, delta] = button.dataset.lineQty.split(':'); changeLineQty(itemId, portion, Number(delta));
    }));
    root.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      const [itemId, portion] = button.dataset.remove.split(':'); removeLine(itemId, portion);
    }));
    root.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => {
      const status = isDateAvailable(parseLocalDate(button.dataset.date));
      if (!status.ok) {
        const messages = { too_soon: `Cette date ne respecte pas le délai minimal de préparation de 72h.`, weekend: 'La livraison n’est pas offerte les samedis et dimanches.', invalid: 'Cette date n’est pas disponible.' };
        state.dateMessage = messages[status.reason] || 'Cette date n’est pas disponible.';
        render();
        return;
      }
      state.dateMessage = ''; state.cart.deliveryDate = button.dataset.date; saveCart(); render();
    }));
    root.querySelectorAll('[data-cart-field]').forEach((field) => field.addEventListener('input', () => { state.cart[field.dataset.cartField] = field.value; saveCart(); }));
    root.querySelectorAll('[data-cart-field]').forEach((field) => field.addEventListener('change', () => { state.cart[field.dataset.cartField] = field.value; saveCart(); render(); }));
    root.querySelectorAll('[data-cart-checkbox]').forEach((field) => field.addEventListener('change', () => { state.cart[field.dataset.cartCheckbox] = field.checked; saveCart(); render(); }));
    root.querySelectorAll('[data-customer]').forEach((field) => field.addEventListener('input', () => {
      const key = field.dataset.customer; state.cart.customer[key] = key === 'postalCode' ? field.value.toUpperCase() : field.value; saveCart();
    }));
    root.querySelectorAll('[data-customer]').forEach((field) => field.addEventListener('change', () => {
      const key = field.dataset.customer; state.cart.customer[key] = key === 'postalCode' ? field.value.toUpperCase() : field.value; saveCart(); render();
    }));

    root.querySelectorAll('[data-admin-auth]').forEach((field) => field.addEventListener('input', () => { state.admin[field.dataset.adminAuth] = field.value.trim(); }));
    root.querySelector('[data-admin-remember]')?.addEventListener('change', (event) => { state.admin.rememberKey = event.currentTarget.checked; });
    root.querySelector('[data-admin-login]')?.addEventListener('click', () => {
      if (!state.admin.token || !state.admin.owner || !state.admin.repo || !state.admin.branch) { state.admin.message = 'Access key requise.'; render(); return; }
      if (state.admin.rememberKey) localStorage.setItem(ADMIN_ACCESS_KEY_STORAGE_KEY, state.admin.token);
      else localStorage.removeItem(ADMIN_ACCESS_KEY_STORAGE_KEY);
      state.admin.authenticated = true; state.admin.message = ''; ensureAdminWorking(); render(); refreshAdminOrders();
    });
    root.querySelector('[data-admin-logout]')?.addEventListener('click', () => { state.admin.authenticated = false; if (!state.admin.rememberKey) state.admin.token = ''; state.admin.message = 'Console verrouillée.'; render(); });
    root.querySelectorAll('[data-admin-file]').forEach((button) => button.addEventListener('click', () => { state.admin.selectedFile = button.dataset.adminFile; state.admin.message = ''; state.admin.editorValid = true; render(); }));
    root.querySelector('[data-orders-refresh]')?.addEventListener('click', refreshAdminOrders);
    root.querySelectorAll('[data-admin-field]').forEach((field) => field.addEventListener('input', () => {
      let value = field.dataset.adminType === 'boolean' ? field.checked : field.value;
      if (field.type === 'number') value = field.value === '' ? null : Number(field.value);
      adminSet(field.dataset.adminField, value);
    }));
    root.querySelectorAll('[data-admin-field][data-admin-type="boolean"]').forEach((field) => field.addEventListener('change', () => { adminSet(field.dataset.adminField, field.checked); render(); }));
    root.querySelector('[data-admin-reset]')?.addEventListener('click', () => { state.admin.working = cloneJson(state.admin.original); state.admin.editorValid = true; state.admin.message = 'Changements annulés.'; render(); });
    root.querySelector('[data-admin-submit]')?.addEventListener('click', async () => {
      state.admin.saving = true; state.admin.message = 'Soumission en cours…'; render();
      try { await githubPutJson(state.admin.selectedFile, state.admin.working[state.admin.selectedFile]); state.admin.original[state.admin.selectedFile] = cloneJson(state.admin.working[state.admin.selectedFile]); state.admin.message = 'Soumission réussie avec succès.'; }
      catch (error) { state.admin.message = `Erreur de soumission: ${error.message}`; }
      finally { state.admin.saving = false; render(); }
    });
    root.querySelectorAll('[data-stripe-field]').forEach((field) => field.addEventListener('input', () => { state.admin.stripe[field.dataset.stripeField] = field.value.trim(); }));
    root.querySelectorAll('select[data-stripe-field]').forEach((field) => field.addEventListener('change', () => { state.admin.stripe[field.dataset.stripeField] = field.value.trim(); render(); }));
    root.querySelector('[data-stripe-fetch]')?.addEventListener('click', async () => {
      const stripe = state.admin.stripe;
      if (!state.admin.token) { stripe.message = 'Token GitHub requis.'; render(); return; }
      if (!stripe.apiKey) { stripe.message = 'Clé Stripe requise.'; render(); return; }
      stripe.loading = true; stripe.message = 'Lecture du dépôt RVSITE et du catalogue Stripe…'; render();
      try { stripe.repoCatalog = await loadGithubLocalCatalog(); stripe.stripeCatalog = await fetchManagedStripeCatalog(); stripe.plan = await buildStripeSyncPlan(stripe.repoCatalog, stripe.stripeCatalog); stripe.message = 'Plan Stripe prêt.'; }
      catch (error) { stripe.message = `Erreur Stripe/GitHub: ${error.message}`; }
      finally { stripe.loading = false; render(); }
    });
    root.querySelector('[data-stripe-update]')?.addEventListener('click', async () => {
      const stripe = state.admin.stripe;
      if (!stripe.plan) { stripe.message = 'Chargez un plan avant UPDATE.'; render(); return; }
      stripe.updating = true; stripe.message = 'Mise à jour Stripe en cours…'; render();
      try { const results = await executeStripeSyncPlan(); stripe.message = results.errors.length ? `Mise à jour terminée avec ${results.errors.length} erreur(s).` : 'Mise à jour Stripe réussie avec succès.'; }
      catch (error) { stripe.message = `Erreur de mise à jour Stripe: ${error.message}`; }
      finally { stripe.updating = false; render(); }
    });
    root.querySelector('[data-checkout]')?.addEventListener('click', checkout);
  }

  async function init() {
    injectStyles();
    await clearLegacyBrowserCaches();
    loadCart();
    const rememberedAdminKey = localStorage.getItem(ADMIN_ACCESS_KEY_STORAGE_KEY);
    if (rememberedAdminKey) { state.admin.token = rememberedAdminKey; state.admin.rememberKey = true; }
    state.data = await loadData();
    setSeo(state.data.content);
    const first = firstAvailableDate();
    if (!state.cart.deliveryDate && first) state.cart.deliveryDate = first;
    render();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
