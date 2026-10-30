/* code-tips: hover (or tap) a symbol inside <pre>/<code> to see what it means.
   Usage on a page:
     <script src="../assets/code-tips.js"></script>
     <script>CodeTips({ "N": "종이 윗면 방향", "dot": "내적 …" });</script>
   Keys are matched as whole words, case-sensitive. Longer keys win (e.g. "N.z" before "N"). */
(function () {
  function css() {
    if (document.getElementById('code-tips-css')) return;
    const s = document.createElement('style');
    s.id = 'code-tips-css';
    s.textContent =
      '.ct{text-decoration:underline dotted;text-underline-offset:3px;text-decoration-thickness:1px;cursor:help;border-radius:3px}' +
      '.ct:hover,.ct:focus,.ct.on{background:rgba(127,127,127,.18);outline:none}' +
      '#ct-pop{position:fixed;z-index:50;max-width:min(320px,calc(100vw - 24px));padding:8px 12px;border-radius:8px;' +
      'font:14px/1.55 var(--sans,system-ui,sans-serif);background:var(--fg,#1b2230);color:var(--bg,#fff);' +
      'pointer-events:none;opacity:0;transition:opacity .08s;white-space:normal}' +
      '#ct-pop.show{opacity:1}' +
      '#ct-pop b{font-weight:500;font-family:var(--mono,monospace)}' +
      '.ct-off .ct{text-decoration:none;cursor:auto;background:none}' +
      '#ct-toggle{position:fixed;right:16px;bottom:16px;z-index:40;font:13px var(--sans,system-ui,sans-serif);padding:6px 12px;border-radius:999px;' +
      'border:1px solid var(--line,#d9dde4);background:var(--panel,#fff);color:var(--fg,#1b2230);cursor:pointer}' +
      '#ct-toggle:hover{border-color:var(--muted,#5d6676)}' +
      '#ct-toggle:focus-visible{outline:2px solid var(--fwd,#2f6fd0);outline-offset:2px}';
    document.head.appendChild(s);
  }

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  window.CodeTips = function (dict) {
    css();
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    if (!keys.length) return;
    const re = new RegExp('(?<![A-Za-z0-9_.])(' + keys.map(esc).join('|') + ')(?![A-Za-z0-9_])', 'g');

    let off = false;
    try { off = localStorage.getItem('codeTipsOff') === '1'; } catch (e) {}

    function wrapRoot(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (tn) {
        if (tn.parentElement && tn.parentElement.classList.contains('ct')) return;
        const text = tn.nodeValue;
        re.lastIndex = 0;
        if (!re.test(text)) return;
        re.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m;
        while ((m = re.exec(text))) {
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          const sp = document.createElement('span');
          sp.className = 'ct';
          sp.tabIndex = off ? -1 : 0;
          sp.dataset.key = m[1];
          sp.textContent = m[1];
          frag.appendChild(sp);
          last = m.index + m[1].length;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      });
    }
    function codeRoot(node) {
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el) return null;
      return el.closest('pre') || el.closest('code');
    }

    document.querySelectorAll('pre, code').forEach(function (root) {
      if (root.tagName === 'CODE' && root.closest('pre')) return;
      wrapRoot(root);
    });

    // pages that redraw code text (sliders, step buttons) get tips again
    const pending = new Set();
    let queued = false;
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        const r = codeRoot(m.target);
        if (r && !(m.target.classList && m.target.classList.contains('ct'))) pending.add(r);
      });
      if (pending.size && !queued) {
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          const roots = Array.from(pending);
          pending.clear();
          roots.forEach(function (r) { if (r.isConnected) wrapRoot(r); });
        });
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });

    let pop = document.getElementById('ct-pop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'ct-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop); }
    let cur = null;

    const btn = document.createElement('button');
    btn.id = 'ct-toggle';
    btn.type = 'button';
    function paint() {
      document.body.classList.toggle('ct-off', off);
      btn.textContent = off ? '코드 설명 꺼짐' : '코드 설명 켜짐';
      btn.setAttribute('aria-pressed', String(!off));
      document.querySelectorAll('.ct').forEach(function (s) { s.tabIndex = off ? -1 : 0; });
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      off = !off;
      try { localStorage.setItem('codeTipsOff', off ? '1' : '0'); } catch (err) {}
      hide();
      paint();
    });
    document.body.appendChild(btn);
    paint();

    function show(sp) {
      if (off) return;
      if (cur && cur !== sp) cur.classList.remove('on');
      cur = sp;
      sp.classList.add('on');
      pop.innerHTML = '<b></b><br>';
      pop.firstChild.textContent = sp.dataset.key;
      pop.appendChild(document.createTextNode(dict[sp.dataset.key]));
      pop.classList.add('show');
      const r = sp.getBoundingClientRect(), pr = pop.getBoundingClientRect();
      let x = Math.min(Math.max(8, r.left), window.innerWidth - pr.width - 8);
      let y = r.bottom + 6;
      if (y + pr.height > window.innerHeight - 8) y = r.top - pr.height - 6;
      pop.style.left = x + 'px';
      pop.style.top = y + 'px';
    }
    function hide() { if (cur) cur.classList.remove('on'); cur = null; pop.classList.remove('show'); }

    document.addEventListener('mouseover', function (e) { const sp = e.target.closest && e.target.closest('.ct'); if (sp) show(sp); });
    document.addEventListener('mouseout', function (e) { const sp = e.target.closest && e.target.closest('.ct'); if (sp && !sp.contains(e.relatedTarget)) hide(); });
    document.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('ct')) show(e.target); });
    document.addEventListener('focusout', function (e) { if (e.target.classList && e.target.classList.contains('ct')) hide(); });
    document.addEventListener('click', function (e) { const sp = e.target.closest && e.target.closest('.ct'); if (sp) { show(sp); } else hide(); });
    window.addEventListener('scroll', hide, { passive: true });
  };
})();
