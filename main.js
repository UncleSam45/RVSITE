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

  function localAssetPath(path) {
    if (/^(https?:)?\/\//.test(path) || path.startsWith('/')) return path;
    return `${STATIC_ASSET_BASE}${path}`;
  }

  const CART_STORAGE_KEY = 'lacuisine_rosalie_cart_v2';
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const WEEKDAY_LABELS = {
    sunday: 'dimanche', monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi',
    thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi',
  };
  const PORTION_LABELS = { petit: 'Petit', grand: 'Grand', familial: 'Familial', standard: 'Format unique' };
  const DATE_REASONS = {
    available: 'Disponible', too_soon: 'Trop tôt', outside_menu_period: 'Hors période du menu',
    no_delivery: 'Pas de livraison', full: 'Complet', closed: 'Fermé', invalid: 'Date invalide',
  };

  const state = {
    page: 'home',
    data: null,
    cart: {
      items: [],
      deliveryDate: '',
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
  };

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700;800&display=swap');
      :root{--bg:#FFF2B8;--card:#FFF6CF;--text:#24382F;--muted:#66766E;--olive:#72A982;--deep-olive:#2F6F55;--gold:#F7CA4D;--brown:#C56E8B;--border:#F1E6B8;--success:#3F8B63;--warning:#D99A25;--error:#B85050;--shadow:0 18px 45px rgba(82,105,69,.10);--soft:0 8px 22px rgba(82,105,69,.08)}
      *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:radial-gradient(circle at 10% 0%,rgba(255,218,234,.78) 0,transparent 30%),radial-gradient(circle at 90% 8%,rgba(201,241,210,.82) 0,transparent 32%),linear-gradient(135deg,#FFF2B8 0,#FFEFA7 45%,#EAF8D7 100%);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased} button,input,select,textarea{font:inherit} button{min-height:44px} a{color:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .site{min-height:100vh;padding:12px 12px 92px}.container{width:min(1180px,100%);margin-inline:auto}.topbar{position:sticky;top:10px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border:1px solid rgba(228,216,200,.9);border-radius:24px;background:rgba(255,253,248,.92);backdrop-filter:blur(16px);box-shadow:var(--soft)}.brand{display:flex;align-items:center;gap:10px;min-width:0}.brand-mark{display:inline-flex;align-items:center;justify-content:center;width:96px;height:68px;flex:0 0 96px;border-radius:20px;background:linear-gradient(135deg,var(--deep-olive),var(--olive));color:#fff;font-family:'Playfair Display',Georgia,serif;font-size:1.2rem;font-weight:700;box-shadow:0 10px 22px rgba(47,66,30,.18);overflow:hidden}.brand-mark img{display:block;width:100%;height:100%;object-fit:contain;border-radius:inherit}.brand-fallback{display:none}.brand-copy{display:block}.brand-name{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.18rem;font-weight:700;line-height:1.05}.brand-tagline{display:block;color:var(--muted);font-size:.82rem;margin-top:3px}.nav{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}.nav-btn{border:1px solid transparent;background:transparent;color:var(--muted);border-radius:999px;padding:9px 12px;font-size:.9rem;font-weight:800;cursor:pointer}.nav-btn:hover,.nav-btn[aria-current=true]{background:#f3eadf;border-color:#dccbb7;color:var(--deep-olive)}.cart-nav{background:var(--deep-olive);color:#fff;border-color:var(--deep-olive)}.cart-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;margin-left:5px;padding:0 6px;border-radius:99px;background:var(--gold);color:#fff;font-size:.78rem}.mobile-menu{display:none;border:1px solid var(--border);border-radius:999px;background:#fff;padding:8px 12px;font-weight:800;color:var(--deep-olive)}
      main{padding-top:18px}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:24px;align-items:center;border:1px solid var(--border);border-radius:32px;padding:clamp(22px,4vw,52px);background:linear-gradient(135deg,rgba(255,255,255,.96),rgba(251,245,236,.94));box-shadow:var(--shadow);overflow:hidden}.kicker{color:var(--olive);text-transform:uppercase;letter-spacing:.1em;font-size:.78rem;font-weight:900}.hero h1,.page-title{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2.15rem,5vw,4.65rem);line-height:1.02;margin:10px 0;color:var(--text)}.lead{font-size:clamp(1rem,2vw,1.18rem);line-height:1.75;color:var(--muted);max-width:62ch}.cta-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:999px;border:1px solid transparent;padding:12px 18px;font-weight:900;cursor:pointer;text-decoration:none;transition:transform .15s ease,filter .15s ease}.btn:hover{transform:translateY(-1px);filter:brightness(1.03)}.btn-primary{background:linear-gradient(180deg,#c08d50,#9f682f);color:#fff;box-shadow:0 12px 24px rgba(184,132,66,.24)}.btn-secondary{background:#fff;color:var(--deep-olive);border-color:#d8c8b5}.btn-olive{background:var(--deep-olive);color:#fff}.btn-ghost{background:#fff8ef;color:var(--brown);border-color:#ead9c5}.trust-chips,.chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:#fffdf8;border-radius:999px;padding:8px 11px;color:#5f554b;font-size:.88rem;font-weight:700}.hero-visual{position:relative;min-height:390px;border-radius:28px;overflow:hidden;background:linear-gradient(135deg,#efe1cd,#fff)}.hero-visual img{width:100%;height:100%;min-height:390px;object-fit:cover;display:block}.hero-card{position:absolute;left:18px;right:18px;bottom:18px;border:1px solid rgba(255,255,255,.72);border-radius:22px;padding:16px;background:rgba(255,253,248,.9);backdrop-filter:blur(12px);box-shadow:var(--soft)}.hero-card strong{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.35rem}.section{margin-top:26px}.section-head{display:flex;justify-content:space-between;align-items:end;gap:18px;margin-bottom:14px}.section h2{font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.7rem,3vw,2.6rem);margin:0}.section p{color:var(--muted);line-height:1.65}.grid{display:grid;gap:16px}.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}.card,.panel{border:1px solid var(--border);border-radius:24px;background:rgba(255,255,255,.94);box-shadow:var(--soft)}.panel{padding:20px}.mini-card{padding:18px}.mini-card strong{display:block;margin-bottom:6px;color:var(--deep-olive)}.menu-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}.menu-header{border:1px solid #dac6ad;border-radius:28px;padding:24px;background:linear-gradient(135deg,#fff8ef,#fff);box-shadow:var(--soft)}.menu-header h1{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2rem,4vw,3.4rem);margin:4px 0}.promo{border-left:5px solid var(--gold);background:#fff7eb}.menu-section-title{display:flex;align-items:center;gap:10px;margin:24px 0 12px}.menu-section-title h2{font-size:1.7rem}.menu-card{display:grid;grid-template-columns:160px 1fr;overflow:hidden}.menu-card img{width:100%;height:100%;min-height:210px;object-fit:cover;background:#eee0d2}.menu-card-body{padding:18px;display:grid;gap:12px}.badge{width:fit-content;padding:5px 9px;border-radius:999px;background:#edf2e7;color:var(--deep-olive);font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;font-weight:900}.menu-card h3{margin:0;font-size:1.25rem}.menu-card p{margin:0;color:var(--muted);line-height:1.55}.portion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.portion-btn{border:1px solid #d8c8b6;border-radius:16px;background:#fffdf8;padding:10px 8px;cursor:pointer;text-align:center;color:var(--text);font-weight:900}.portion-btn small{display:block;color:var(--muted);font-weight:800;margin-top:2px}.portion-btn.active{background:var(--deep-olive);border-color:var(--deep-olive);color:#fff}.portion-btn.active small{color:#efe6d9}.item-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.qty{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;overflow:hidden;background:#fff}.qty button{border:0;background:transparent;width:42px;cursor:pointer;font-weight:900;color:var(--deep-olive)}.qty span{min-width:34px;text-align:center;font-weight:900}.unavailable{opacity:.62}.unavailable .btn,.unavailable .portion-btn{pointer-events:none}.cart-panel{position:sticky;top:108px;padding:18px}.cart-panel h2{font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.55rem,5vw,2.15rem);line-height:1.08;margin:0 0 10px;overflow-wrap:anywhere;hyphens:auto}.cart-empty{padding:14px;border:1px dashed #d8c8b6;border-radius:16px;color:var(--muted);background:#fffaf2}.cart-lines{display:grid;gap:10px}.cart-line{border:1px solid #eadfd2;border-radius:16px;padding:12px;background:#fffdf8}.line-top{display:flex;justify-content:space-between;gap:10px}.line-title{font-weight:900}.line-meta{color:var(--muted);font-size:.86rem;margin-top:2px}.line-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.remove-btn{border:0;background:transparent;color:var(--error);font-weight:900;cursor:pointer}.cart-total,.summary-row{display:flex;justify-content:space-between;gap:12px;padding-top:12px;margin-top:12px;border-top:1px dashed #d7c7b6;font-weight:900}.notice{padding:12px;border-radius:16px;border:1px solid #efd9b8;background:#fff8e9;color:var(--warning);font-weight:800;line-height:1.45}.success-note{border-color:#cfe2d5;background:#f0f8f2;color:var(--success)}.checkout-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px;align-items:start}.step{padding:20px}.step h2{display:flex;gap:10px;align-items:center;margin:0 0 12px;font-size:1.3rem}.step-number{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--deep-olive);color:#fff;font-size:.9rem}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:.88rem;font-weight:900;color:#4b3a2a}.field input,.field select,.field textarea{width:100%;min-height:46px;border:1px solid #d9cab8;border-radius:14px;background:#fffdf8;padding:10px 12px;color:var(--text)}.field textarea{min-height:96px;resize:vertical}.date-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.date-btn{border:1px solid var(--border);border-radius:16px;background:#fffdf8;padding:10px 4px;cursor:pointer;color:var(--text)}.date-btn strong{display:block}.date-btn span{display:block;font-size:.73rem;color:var(--muted);margin-top:2px}.date-btn.disabled{background:#f0e6d9;color:#8a7b6d;cursor:not-allowed}.date-btn.selected{background:var(--deep-olive);border-color:var(--deep-olive);color:#fff}.date-btn.selected span{color:#f1e7d8}.quote-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.quote-item{padding:16px;border:1px solid var(--border);border-radius:18px;background:#fffdf8;font-weight:900;color:var(--deep-olive)}.zone-map{min-height:300px;border-radius:28px;background:radial-gradient(circle at 50% 45%,rgba(184,132,66,.45),transparent 24%),radial-gradient(circle at 35% 35%,rgba(80,107,47,.35),transparent 18%),linear-gradient(135deg,#f4e7d6,#fffaf2);display:grid;place-items:center;text-align:center;padding:24px;color:var(--deep-olive);font-weight:900}.footer{margin-top:30px;padding:24px;color:#f8f3ea;background:linear-gradient(135deg,var(--deep-olive),#203015);border-radius:28px}.footer-grid{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:18px}.footer a{color:#fff}.toast{position:fixed;right:18px;bottom:86px;z-index:80;background:var(--deep-olive);color:#fff;border-radius:999px;padding:12px 16px;box-shadow:var(--shadow);font-weight:900;transform:translateY(16px);opacity:0;pointer-events:none;transition:.2s}.toast.show{transform:translateY(0);opacity:1}.mobile-cart-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:75;display:none;align-items:center;justify-content:space-between;gap:12px;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:var(--deep-olive);color:#fff;padding:10px 12px 10px 16px;box-shadow:var(--shadow);font-weight:900}.mobile-cart-bar button{border:0;border-radius:999px;background:var(--gold);color:#fff;padding:9px 14px;font-weight:900;cursor:pointer}.mobile-cart-bar.empty{display:none}.final-cta{background:linear-gradient(135deg,var(--deep-olive),#273816);color:#fff;text-align:center;overflow:hidden}.final-cta h2{color:#fff}.final-cta p{color:#efe3d4;margin-inline:auto}.emotional-card{background:linear-gradient(135deg,#fffdf8,#f4e5d2)}.stepper{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}.step-pill{border:1px solid var(--border);border-radius:999px;background:#fffdf8;padding:10px 12px;font-weight:900;color:var(--muted);text-align:center;line-height:1.2;overflow-wrap:anywhere;hyphens:auto}.step-pill.active{background:var(--deep-olive);color:#fff;border-color:var(--deep-olive)}.status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:8px 12px;font-weight:900;background:#edf7ef;color:var(--success);border:1px solid #cfe2d5}.status-badge.closed{background:#fff0e9;color:var(--error);border-color:#edc8bd}.food-placeholder{min-height:210px;display:grid;place-items:center;text-align:center;background:linear-gradient(135deg,#f4e5d2,#fffaf2);color:var(--olive);font-weight:900}.food-placeholder span{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.35rem}.btn[disabled]{opacity:.55;cursor:not-allowed;filter:saturate(.6)}.btn[disabled]:hover{transform:none}.btn.added{animation:pulse .45s ease;background:var(--success)}@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.035)}100%{transform:scale(1)}}.date-btn.disabled{cursor:pointer}.date-feedback{margin-top:10px}.menu-empty{padding:18px;border:1px dashed var(--border);border-radius:18px;background:#fffdf8;color:var(--muted);font-weight:800}.availability-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:22px;background:rgba(255,253,248,.92);box-shadow:var(--soft)}.availability-strip span{padding:10px 12px;border-radius:16px;background:#fffaf2;color:var(--muted)}.availability-strip strong{color:var(--deep-olive)}.showcase-carousel{position:relative}.showcase-carousel .section-head p{max-width:760px}.showcase-shell{position:relative;overflow:hidden;border-radius:32px;background:radial-gradient(circle at 20% 0,rgba(184,132,66,.28),transparent 38%),linear-gradient(135deg,#fffaf2,#f0dfcb);border:1px solid var(--border);box-shadow:var(--shadow);padding:14px}.showcase-track{display:flex;transition:transform .55s cubic-bezier(.22,1,.36,1);will-change:transform}.showcase-slide{min-width:100%;padding:4px;opacity:.72;transform:scale(.985);transition:opacity .35s ease,transform .35s ease}.showcase-slide.active{opacity:1;transform:scale(1)}.showcase-image-wrap{position:relative;min-height:520px;border-radius:26px;overflow:hidden;background:#eadccc}.showcase-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.showcase-overlay{position:absolute;inset:0;background:linear-gradient(90deg,rgba(36,26,18,.76),rgba(36,26,18,.28) 48%,rgba(36,26,18,.08)),linear-gradient(0deg,rgba(36,26,18,.5),transparent 50%)}.showcase-badge{position:absolute;top:22px;left:22px;z-index:2;display:inline-flex;padding:9px 13px;border-radius:999px;background:rgba(255,253,248,.92);color:var(--deep-olive);font-weight:900;border:1px solid rgba(255,255,255,.5)}.showcase-copy{position:absolute;left:clamp(22px,5vw,58px);right:clamp(22px,5vw,58px);bottom:clamp(24px,5vw,58px);z-index:2;color:#fff;max-width:680px}.showcase-title{font-family:'Playfair Display',Georgia,serif;font-size:clamp(2rem,4vw,4rem);line-height:1;margin:0 0 10px}.showcase-subtitle{font-size:1.08rem;line-height:1.65;color:#fff3e4;margin:0 0 18px}.showcase-controls{position:absolute;inset:50% 24px auto;display:flex;justify-content:space-between;transform:translateY(-50%);pointer-events:none}.showcase-controls button{pointer-events:auto;width:52px;height:52px;border-radius:999px;border:1px solid rgba(255,255,255,.55);background:rgba(255,253,248,.9);color:var(--deep-olive);font-size:2rem;font-weight:900;cursor:pointer;box-shadow:var(--soft)}.showcase-dots{position:absolute;left:0;right:0;bottom:24px;display:flex;justify-content:center;gap:8px;z-index:3}.showcase-dots button{width:11px;height:11px;min-height:11px;padding:0;border-radius:99px;border:0;background:rgba(255,255,255,.55);cursor:pointer}.showcase-dots button[aria-selected=true]{width:30px;background:#fff}.showcase-slide.image-missing .showcase-image{display:none}.catering-callout{display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#fffdf8,#f7e8d4)}

      /* Soft Easter palette: sunny yellows, fresh mint, and gentle blush accents without stark white surfaces. */
      .topbar{border-color:rgba(232,211,133,.95);background:rgba(255,246,204,.92)}.brand-mark{background:linear-gradient(135deg,#F7CA4D,#CFEFA9 52%,#93D7B0);color:#24382F;box-shadow:0 12px 26px rgba(247,202,77,.24)}.nav-btn:hover,.nav-btn[aria-current=true]{background:#FFF4BC;border-color:#F3DC7A;color:var(--deep-olive)}.cart-nav,.btn-olive,.step-pill.active{background:linear-gradient(135deg,#2F6F55,#5DBB7B);color:#fff;border-color:#2F6F55}.cart-badge{background:#FFE889;color:#24382F}.hero{background:radial-gradient(circle at 5% 0%,rgba(255,221,235,.72),transparent 38%),linear-gradient(135deg,rgba(255,249,218,.98),rgba(255,238,164,.92) 55%,rgba(225,246,207,.9));border-color:#E8D385}.btn-primary{background:linear-gradient(180deg,#FFE889,#F7CA4D);color:#24382F;box-shadow:0 14px 26px rgba(247,202,77,.32);border-color:#EEC33F}.btn-secondary{background:#FFF4C9;color:var(--deep-olive);border-color:#D9E9B7}.btn-ghost{background:#FFF3F8;color:#A24D6A;border-color:#FFD7E6}.chip{background:rgba(255,248,211,.94);border-color:#EAD99B;color:#5E7168}.hero-visual{background:linear-gradient(135deg,#FFF4BC,#E1F7D2 58%,#FFE5EF)}.hero-card{border-color:rgba(255,250,224,.92);background:rgba(255,246,204,.92)}.card,.panel{background:rgba(255,249,218,.95);border-color:#E8D385}.menu-header{border-color:#F1E6B8;background:radial-gradient(circle at 8% 0%,rgba(255,229,239,.72),transparent 40%),linear-gradient(135deg,#fffef4,#fff6c9 58%,#effbe8)}.promo{border-left-color:#F7CA4D;background:#FFF9D9}.menu-banner{overflow:hidden;margin-bottom:18px;border:1px solid #E8D385;border-radius:28px;background:#FFF6CF;box-shadow:var(--soft);line-height:0}.menu-banner img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}.menu-card,.cart-panel,.step,.order-summary,.quote-card{background:rgba(255,248,211,.96);border-color:#E8D385}.portion-btn,.date-btn,input,select,textarea{border-color:#E4D28D;background:#FFFBE7}.portion-btn.active,.date-btn.available.active{border-color:#F7CA4D;background:#FFF3A8;color:#24382F;box-shadow:0 8px 18px rgba(247,202,77,.22)}.date-btn.available{background:#F3FFE9}.mobile-cart-bar{background:linear-gradient(135deg,#2F6F55,#69BE7D);border-color:#2F6F55}.food-placeholder{background:linear-gradient(135deg,#FFF4BC,#F4FFE9 65%,#FFE5EF);color:var(--deep-olive)}.availability-strip,.menu-empty{background:rgba(255,246,204,.94);border-color:#E8D385}.availability-strip span{background:#FFF8CD}.showcase-shell{background:radial-gradient(circle at 15% 0,rgba(255,229,239,.72),transparent 35%),radial-gradient(circle at 95% 12%,rgba(218,247,226,.82),transparent 34%),linear-gradient(135deg,#fffdf1,#fff4bc);border-color:#F1E6B8}.showcase-image-wrap{background:#FFF4BC}.showcase-overlay{background:linear-gradient(90deg,rgba(47,111,85,.70),rgba(47,111,85,.30) 48%,rgba(247,202,77,.10)),linear-gradient(0deg,rgba(47,111,85,.48),transparent 55%)}.showcase-subtitle{color:#FFFBE8}.showcase-badge,.showcase-controls button{background:rgba(255,246,204,.94);color:var(--deep-olive);border-color:rgba(255,250,224,.78)}.showcase-dots button[aria-selected=true]{background:#FFE889}.catering-callout{background:linear-gradient(135deg,#fffef4,#fff3bd 55%,#eafbe3)}
      @media(max-width:980px){.availability-strip{grid-template-columns:1fr 1fr}.showcase-image-wrap{min-height:430px}.showcase-controls{inset:auto 18px 18px}.catering-callout{display:block}.nav{display:none}.mobile-menu{display:inline-flex}.topbar.open .nav{display:flex;position:absolute;left:10px;right:10px;top:76px;padding:12px;border:1px solid var(--border);border-radius:20px;background:#fffdf8;box-shadow:var(--shadow)}.hero,.menu-layout,.checkout-grid{grid-template-columns:1fr}.cart-panel{position:static}.grid-3,.grid-4,.footer-grid{grid-template-columns:1fr 1fr}.mobile-cart-bar{display:flex}.menu-card{grid-template-columns:130px 1fr}.site{padding-bottom:92px}}
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

  function formatCurrency(value) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: state.data?.settings?.ordering?.currency || 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0).replace(/\u00a0/g, ' ');
  }

  function parseLocalDate(dateLike, hour = 12) {
    if (dateLike instanceof Date) return new Date(dateLike.getFullYear(), dateLike.getMonth(), dateLike.getDate(), hour, 0, 0, 0);
    const [year, month, day] = String(dateLike || '').split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1, hour, 0, 0, 0);
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
      if (parsed.customer && typeof parsed.customer === 'object') state.cart.customer = { ...state.cart.customer, ...parsed.customer };
    } catch (error) {
      console.warn('Panier local illisible.', error);
    }
  }

  function addToCart(item, portionKey, qty = 1) {
    const portion = getPortions(item).find((option) => option.key === portionKey);
    if (!portion || item.available === false) return;
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

  function isDateAvailable(date) {
    const rules = getSettingRules();
    const menu = getCurrentMenu();
    const noticeHours = Number(rules.order_notice_hours || 48);
    const threshold = new Date(Date.now() + noticeHours * 60 * 60 * 1000);
    if (menu.active === false) return { ok: false, reason: 'closed' };
    const deliveryCutoff = parseLocalDate(date);
    if (deliveryCutoff < threshold) return { ok: false, reason: 'too_soon' };
    if (menu.start_date && deliveryCutoff < parseLocalDate(menu.start_date, 0)) return { ok: false, reason: 'outside_menu_period' };
    if (menu.end_date && deliveryCutoff > parseLocalDate(menu.end_date, 23)) return { ok: false, reason: 'outside_menu_period' };
    const weekday = WEEKDAYS[date.getDay()];
    if (Array.isArray(menu.delivery_days) && menu.delivery_days.length && !menu.delivery_days.includes(weekday)) return { ok: false, reason: 'no_delivery' };
    const iso = toLocalIsoDate(date);
    if (Array.isArray(menu.full_dates) && menu.full_dates.includes(iso)) return { ok: false, reason: 'full' };
    if (Array.isArray(menu.closed_dates) && menu.closed_dates.includes(iso)) return { ok: false, reason: 'closed' };
    return { ok: true, reason: 'available' };
  }

  function firstAvailableDate() {
    const menu = getCurrentMenu();
    const start = menu.start_date ? parseLocalDate(menu.start_date) : new Date();
    const date = new Date(Math.max(start.getTime(), Date.now()));
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
    if (!state.cart.items.length) errors.push('Ajoutez au moins un plat au panier.');
    if (totals.subtotal < Number(rules.minimum_order || 0)) errors.push(`Minimum de commande: ${formatCurrency(rules.minimum_order || 0)}.`);
    if (!state.cart.deliveryDate || !isDateAvailable(parseLocalDate(state.cart.deliveryDate)).ok) errors.push('Choisissez une date de livraison disponible.');
    if (!customer.name.trim()) errors.push('Le nom complet est requis.');
    if (!customer.phone.trim()) errors.push('Le téléphone est requis.');
    if (!customer.streetNumber.trim() || !customer.streetName.trim()) errors.push('L’adresse de livraison est requise.');
    if (!customer.city.trim()) errors.push('La ville est requise.');
    const allowed = getEnabledZones().map((zone) => zone.city.toLowerCase());
    if (customer.city && !allowed.includes(customer.city.toLowerCase())) errors.push('La ville choisie n’est pas dans la zone de livraison.');
    return errors;
  }

  function buildCheckoutPayload() {
    const customer = state.cart.customer;
    return {
      items: state.cart.items.map((line) => ({ item_id: line.itemId, portion: line.portion, qty: line.qty })),
      delivery_date: state.cart.deliveryDate,
      customer: {
        name: customer.name, phone: customer.phone, email: customer.email, street_number: customer.streetNumber,
        street_name: customer.streetName, apartment: customer.apartment, city: customer.city, province: customer.province || 'QC',
        postal_code: (customer.postalCode || '').toUpperCase(), notes: customer.notes,
      },
    };
  }

  async function checkout() {
    const errors = validateOrder();
    if (errors.length) {
      showToast(errors[0]);
      render();
      return;
    }
    const endpoint = state.data?.settings?.ordering?.checkout_endpoint || '/api/create-checkout-session';
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildCheckoutPayload()) });
      const payload = await response.json();
      if (!response.ok || !payload.checkout_url) throw new Error(payload.error || 'Session Stripe indisponible.');
      window.location.assign(payload.checkout_url);
    } catch (error) {
      showToast('Paiement sécurisé bientôt disponible. La commande est prête à être envoyée.');
      console.warn('Checkout non configuré:', error, buildCheckoutPayload());
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
    const currentAvailableItems = getMenuItems().filter((item) => item.available !== false);
    const featuredItems = currentAvailableItems.filter((item) => item.featured === true);
    const menuItems = (featuredItems.length ? featuredItems : currentAvailableItems).slice(0, 3);
    const zones = getEnabledZones().map((zone) => zone.city).join(', ');
    const heroItems = getCurrentMenuImageItems();
    const activeHeroItem = heroItems.length ? heroItems[state.carousel.index % heroItems.length] : null;
    const heroImage = itemImagePath(activeHeroItem, 'hero') || state.data.content.home?.hero_image || 'assets/images/hero/homepage-hero.webp';
    return `
      <section class="hero container">
        <div>
          <div class="kicker">Menu de la semaine • Livraison locale</div>
          <h1>${escapeHtml(state.data.content.home?.headline || 'Repas faits maison livrés dans votre secteur')}</h1>
          <p class="lead">${escapeHtml(state.data.content.home?.subheadline || 'Une cuisine simple, généreuse et préparée avec soin pour simplifier vos repas de semaine.')}</p>
          <div class="cta-row"><button class="btn btn-primary" data-page="menu">Voir le menu de la semaine</button><button class="btn btn-secondary" data-page="commander">Planifier ma commande</button></div>
          <div class="trust-chips"><span class="chip">Fait maison</span><span class="chip">Livraison locale</span><span class="chip">Commande ${rules.order_notice_hours || 48} h à l’avance</span><span class="chip">Portions Petit / Grand / Familial</span></div>
        </div>
        <div class="hero-visual">
          <img src="${escapeHtml(heroImage)}" alt="${escapeHtml(activeHeroItem?.title || 'Repas maison préparé avec soin')}" loading="eager" onerror="this.src='https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1400&q=82'">
          <div class="hero-card"><strong>${escapeHtml(activeHeroItem?.title || menu.title || 'Menu de la semaine')}</strong><span>${activeHeroItem ? 'Disponible cette semaine • ' : ''}Petit / Grand / Familial • livraison à céduler avec le client</span></div>
        </div>
      </section>
      <section class="availability-strip container" aria-label="Disponibilité du menu">
        <span><strong>Période:</strong> ${formatDate(menu.start_date)} au ${formatDate(menu.end_date)}</span>
        <span><strong>Préavis:</strong> ${rules.order_notice_hours || 48} h</span>
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
        <div class="section-head"><div><div class="kicker">Confiance</div><h2>Fait maison, local et pensé pour les familles.</h2><p>Portions familiales, livraison dans les secteurs desservis, préavis de ${rules.order_notice_hours || 48} h et préparation soignée. Zones: ${escapeHtml(zones)}.</p></div><button class="btn btn-primary" data-page="livraison">Voir les conditions</button></div>
      </section>
      <section class="section container panel catering-callout"><div><div class="kicker">Demandes spéciales</div><h2>Vous avez vu un plat qui vous intéresse?</h2><p>Écrivez-nous pour une demande spéciale ou un événement. Les créations passées de la galerie peuvent inspirer votre prochaine commande traiteur.</p></div><button class="btn btn-primary" data-page="contact">Faire une demande</button></section>
      <section class="section container panel final-cta"><div class="kicker">Prêt à commander?</div><h2>Voir le menu de la semaine</h2><p>Le menu actuel affiche les plats disponibles, les portions, les prix et les dates de livraison.</p><div class="cta-row" style="justify-content:center"><button class="btn btn-primary" data-page="menu">Voir le menu de la semaine</button><button class="btn btn-secondary" data-page="commander">Planifier ma commande</button></div></section>`;
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
    const isOpen = Boolean(menu.active) && Boolean(firstAvailableDate());
    return `
      <div class="container menu-layout">
        <div>
          ${menuBannerHtml()}
          <section class="menu-header">
            <div class="kicker">Menu en rotation</div><h1>${escapeHtml(menu.title || 'Menu de la semaine')}</h1><span class="status-badge ${isOpen ? '' : 'closed'}">${isOpen ? 'Commande ouverte' : 'Commandes fermées'}</span>
            <p class="lead">${escapeHtml(menu.description || 'Menu disponible pour commandes planifiées.')}</p>
            <div class="chip-row"><span class="chip">Commande ${rules.order_notice_hours || 48} h à l’avance</span><span class="chip">Livraison locale disponible</span><span class="chip">Petit / Grand / Familial</span><span class="chip">Minimum ${formatCurrency(rules.minimum_order || 35)}</span></div>
          </section>
          ${!menu.active ? `<section class="section menu-empty">Le prochain menu arrive bientôt.</section>` : ''}${menu.active && !isOpen ? `<section class="section menu-empty">Les commandes pour ce menu sont maintenant fermées. Le prochain menu arrive bientôt.</section>` : ''}${promos.length ? `<section class="section panel promo"><strong>${escapeHtml(promos[0].title)}</strong><p>${escapeHtml(promos[0].description)}</p></section>` : ''}
          ${menuSectionHtml('Plats principaux', getMenuItems('items'))}
          ${menuSectionHtml('Accompagnements & extras', getMenuItems('extras'))}
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
          <button class="btn btn-primary ${state.lastAddedKey === `${item.id}:${selected}` ? 'added' : ''}" data-add="${item.id}" ${item.available === false ? 'disabled' : ''}>${state.lastAddedKey === `${item.id}:${selected}` ? 'Ajouté ✓' : 'Ajouter au panier'}</button>
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
      ${includeButton ? `<button class="btn btn-primary" data-page="commander" style="width:100%;margin-top:12px">Voir le panier</button>` : ''}
    </aside>`;
  }

  function cartLineHtml(line) {
    return `<div class="cart-line"><div class="line-top"><div><div class="line-title">${escapeHtml(line.title)}</div><div class="line-meta">${escapeHtml(line.portionLabel)} • ${formatCurrency(line.price)}</div></div><strong>${formatCurrency(line.price * line.qty)}</strong></div><div class="line-actions"><div class="qty"><button data-line-qty="${line.itemId}:${line.portion}:-1" aria-label="Réduire">−</button><span>${line.qty}</span><button data-line-qty="${line.itemId}:${line.portion}:1" aria-label="Augmenter">+</button></div><button class="remove-btn" data-remove="${line.itemId}:${line.portion}">Retirer</button></div></div>`;
  }

  function commanderHtml() {
    if (!state.cart.deliveryDate) state.cart.deliveryDate = firstAvailableDate();
    const errors = validateOrder();
    const totals = cartTotals();
    return `<div class="container"><div class="stepper" aria-label="Étapes de commande"><span class="step-pill active">1 Votre commande</span><span class="step-pill">2 Livraison</span><span class="step-pill">3 Coordonnées</span><span class="step-pill">4 Confirmation</span></div></div><div class="container checkout-grid">
      <div class="grid">
        <section class="card step"><h2><span class="step-number">1</span>Votre commande</h2>${cartPanelHtml(false)}</section>
        <section class="card step"><h2><span class="step-number">2</span>Date de livraison</h2>${dateSelectorHtml()}</section>
        <section class="card step"><h2><span class="step-number">3</span>Coordonnées</h2>${customerFormHtml()}</section>
      </div>
      <aside class="card cart-panel checkout-confirmation"><h2>Confirmation</h2><p class="line-meta">Date: ${state.cart.deliveryDate ? formatDate(state.cart.deliveryDate) : 'Aucune date disponible'}</p><div class="summary-row"><span>Total</span><span>${formatCurrency(totals.subtotal)}</span></div>${errors.length ? `<div class="notice">${errors.map(escapeHtml).join('<br>')}</div>` : `<div class="notice success-note">Commande prête pour le paiement sécurisé.</div>`}<button class="btn btn-primary" data-checkout ${errors.length ? 'disabled' : ''} style="width:100%;margin-top:12px">Passer au paiement sécurisé</button><p class="line-meta">Vous serez redirigé vers un paiement sécurisé. Aucune information de carte n’est conservée sur ce site.</p></aside>
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
    return `<p>${first ? `Prochaine livraison disponible: <strong>${formatDate(first)}</strong>.` : 'Aucune date disponible dans la période du menu avec le délai de 48 h.'}</p><div class="date-grid">${buttons.join('')}</div>${state.dateMessage ? `<p class="notice date-feedback">${escapeHtml(state.dateMessage)}</p>` : ''}<p class="line-meta">Jours de livraison: ${(getCurrentMenu().delivery_days || []).map((day) => WEEKDAY_LABELS[day] || day).join(', ') || 'à confirmer'}.</p>`;
  }

  function customerFormHtml() {
    const c = state.cart.customer;
    const zones = getEnabledZones();
    const input = (key, label, attrs = '') => `<div class="field"><label for="${key}">${label}</label><input id="${key}" data-customer="${key}" value="${escapeHtml(c[key] || '')}" ${attrs}></div>`;
    return `<div class="form-grid">
      ${input('name', 'Nom complet', 'autocomplete="name"')}${input('phone', 'Téléphone', 'autocomplete="tel"')}${input('email', 'Courriel (optionnel)', 'autocomplete="email" type="email"')}${input('streetNumber', 'Numéro civique')}${input('streetName', 'Rue', 'autocomplete="address-line1"')}${input('apartment', 'Appartement')}
      <div class="field"><label for="city">Ville</label><select id="city" data-customer="city"><option value="">Choisir une ville</option>${zones.map((zone) => `<option value="${escapeHtml(zone.city)}" ${c.city === zone.city ? 'selected' : ''}>${escapeHtml(zone.city)}</option>`).join('')}</select></div>
      ${input('postalCode', 'Code postal', 'autocomplete="postal-code"')}
      <div class="field full"><label for="notes">Instructions, allergies ou commentaires</label><textarea id="notes" data-customer="notes">${escapeHtml(c.notes || '')}</textarea></div>
    </div>`;
  }

  function traiteurHtml() {
    const services = ['Événements familiaux', 'Petits groupes', 'Repas préparés', 'Plateaux / formats familiaux', 'Menus personnalisés'];
    return `<section class="container hero"><div><div class="kicker">Traiteur & événements</div><h1>Des repas faits maison pour vos moments importants.</h1><p class="lead">Repas familiaux, événements privés, réunions et repas corporatifs: Rosalie peut préparer une proposition adaptée à votre groupe.</p><div class="quote-list">${services.map((service) => `<div class="quote-item">${service}</div>`).join('')}</div></div><div class="panel"><h2>Demander une soumission</h2><form class="form-grid" action="mailto:${escapeHtml(state.data.settings.business.email || state.data.settings.business.phone)}" method="post" enctype="text/plain"><div class="field"><label>Nom</label><input name="nom"></div><div class="field"><label>Téléphone / courriel</label><input name="contact"></div><div class="field"><label>Date de l’événement</label><input name="date" type="date"></div><div class="field"><label>Nombre de personnes</label><input name="personnes" type="number" min="1"></div><div class="field"><label>Ville</label><input name="ville"></div><div class="field"><label>Type d’événement</label><input name="type"></div><div class="field full"><label>Message</label><textarea name="message"></textarea></div><button class="btn btn-primary" type="submit">Demander une soumission</button></form></div></section>`;
  }

  function livraisonHtml() {
    const rules = getSettingRules();
    const zones = getEnabledZones();
    return `<div class="container grid grid-2"><section class="panel"><div class="kicker">Livraison</div><h1 class="page-title">Nous desservons plusieurs municipalités.</h1><p>Les commandes doivent être placées au moins ${rules.order_notice_hours || 48} h à l’avance afin de garantir la préparation.</p><div class="grid grid-2">${zones.map((zone) => `<div class="mini-card card"><strong>${escapeHtml(zone.city)}</strong><span>${escapeHtml(zone.province)}</span></div>`).join('')}</div><div class="chip-row"><span class="chip">Minimum ${formatCurrency(rules.minimum_order || 35)}</span><span class="chip">Livraison gratuite ${formatCurrency(rules.free_delivery_threshold || 35)} et plus</span><span class="chip">Livraison à céduler avec le client</span></div></section><aside class="zone-map"><div>Zone locale<br><span style="font-size:2.4rem">Contrecoeur • Sorel • Varennes • Verchères</span><br>Saint-Roch-de-Richelieu</div></aside></div>`;
  }

  function contactHtml() {
    const business = state.data.settings.business;
    const zones = getEnabledZones().map((zone) => zone.city).join(', ');
    return `<section class="container grid grid-2"><div class="panel"><div class="kicker">Contact</div><h1 class="page-title">Une question ou une commande spéciale?</h1><p>Réponse locale et humaine pour vos repas de la semaine, formats familiaux et demandes traiteur.</p><div class="grid"><a class="btn btn-primary" href="tel:${escapeHtml(business.phone)}">Téléphone: ${escapeHtml(business.phone)}</a><a class="btn btn-secondary" href="${escapeHtml(business.facebook_url)}" target="_blank" rel="noopener">Facebook</a><a class="btn btn-secondary" href="${escapeHtml(business.messenger_url || business.facebook_url)}" target="_blank" rel="noopener">Messenger</a></div></div><div class="panel"><h2>Informations utiles</h2><p><strong>Zones:</strong> ${escapeHtml(zones)}.</p><p><strong>Commande:</strong> au moins ${getSettingRules().order_notice_hours || 48} h à l’avance.</p><p><strong>Confiance:</strong> ${escapeHtml(state.data.settings.trust.hygiene_statement)}</p><p class="notice success-note">Merci de soutenir une entreprise locale.</p></div></section>`;
  }

  function footerHtml() {
    return `<footer class="footer container"><div class="footer-grid"><div><strong>La cuisine de Rosalie</strong><p>Repas faits maison • Livraison locale • Portions Petit / Grand / Familial</p></div><div><strong>Commande</strong><p>48 h à l’avance<br>Minimum ${formatCurrency(getSettingRules().minimum_order || 35)}</p></div><div><strong>Contact</strong><p>${escapeHtml(state.data.settings.business.phone)}<br><a href="${escapeHtml(state.data.settings.business.facebook_url)}">Facebook</a></p></div></div></footer>`;
  }

  function mobileCartBarHtml() {
    const totals = cartTotals();
    return `<div class="mobile-cart-bar ${totals.count ? '' : 'empty'}"><span>${totals.count} article${totals.count > 1 ? 's' : ''} • ${formatCurrency(totals.subtotal)}</span><button data-page="commander">Voir le panier</button></div>`;
  }

  function render() {
    const root = document.getElementById('webframe-root');
    const pages = { home: homeHtml, menu: menuPageHtml, commander: commanderHtml, traiteur: traiteurHtml, livraison: livraisonHtml, contact: contactHtml };
    root.innerHTML = `<div class="site">${navHtml()}<main>${(pages[state.page] || homeHtml)()}</main>${footerHtml()}${mobileCartBarHtml()}<div class="toast" role="status" aria-live="polite"></div></div>`;
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
        const noticeHours = getSettingRules().order_notice_hours || 48;
        const messages = { too_soon: `Cette date n’est pas disponible, car les commandes doivent être placées ${noticeHours} h à l’avance.`, no_delivery: 'Aucune livraison n’est prévue ce jour-là.', outside_menu_period: 'Cette date est hors de la période du menu actuel.', full: 'Cette date est complète.', closed: 'Les commandes sont fermées pour ce menu.' };
        state.dateMessage = messages[status.reason] || 'Cette date n’est pas disponible.';
        render();
        return;
      }
      state.dateMessage = ''; state.cart.deliveryDate = button.dataset.date; saveCart(); render();
    }));
    root.querySelectorAll('[data-customer]').forEach((field) => field.addEventListener('input', () => {
      const key = field.dataset.customer; state.cart.customer[key] = key === 'postalCode' ? field.value.toUpperCase() : field.value; saveCart();
    }));
    root.querySelectorAll('[data-customer]').forEach((field) => field.addEventListener('change', () => {
      const key = field.dataset.customer; state.cart.customer[key] = key === 'postalCode' ? field.value.toUpperCase() : field.value; saveCart(); render();
    }));
    root.querySelector('[data-checkout]')?.addEventListener('click', checkout);
  }

  async function init() {
    injectStyles();
    loadCart();
    state.data = await loadData();
    setSeo(state.data.content);
    const first = firstAvailableDate();
    if (!state.cart.deliveryDate && first) state.cart.deliveryDate = first;
    render();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
