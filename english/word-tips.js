/* word-tips: 원문 속 <span class="w" data-k="표제어">…</span>에 마우스를 올리거나 탭하면
   vocab.js(window.VOCAB)의 뜻과 메모를 보여준다. code-tips.js와 같은 모양의 말풍선. */
(function () {
  const dict = {};
  (window.VOCAB || []).forEach(function (v) { dict[v.en] = v; });

  const s = document.createElement('style');
  s.textContent =
    '.w{text-decoration:underline dotted;text-underline-offset:4px;text-decoration-thickness:1px;cursor:help;border-radius:3px}' +
    '.w:hover,.w:focus,.w.on{background:rgba(127,127,127,.18);outline:none}' +
    '#wt-pop{position:fixed;z-index:50;max-width:min(320px,calc(100vw - 24px));padding:8px 12px;border-radius:8px;' +
    'font:14px/1.55 var(--sans,system-ui,sans-serif);background:var(--fg,#1b2230);color:var(--bg,#fff);' +
    'pointer-events:none;opacity:0;transition:opacity .08s}' +
    '#wt-pop.show{opacity:1}#wt-pop b{font-weight:500}#wt-pop i{font-style:normal;opacity:.75;font-size:13px}';
  document.head.appendChild(s);

  const pop = document.createElement('div');
  pop.id = 'wt-pop';
  pop.setAttribute('role', 'tooltip');
  document.body.appendChild(pop);
  let cur = null;

  document.querySelectorAll('.w[data-k]').forEach(function (el) {
    el.tabIndex = 0;
    if (!dict[el.dataset.k]) el.classList.remove('w');
  });

  function show(el) {
    const v = dict[el.dataset.k];
    if (!v) return;
    if (cur && cur !== el) cur.classList.remove('on');
    cur = el;
    el.classList.add('on');
    pop.textContent = '';
    const b = document.createElement('b'); b.textContent = v.en; pop.appendChild(b);
    pop.appendChild(document.createElement('br'));
    pop.appendChild(document.createTextNode(v.ko));
    if (v.note) {
      pop.appendChild(document.createElement('br'));
      const i = document.createElement('i'); i.textContent = v.note; pop.appendChild(i);
    }
    pop.classList.add('show');
    const r = el.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    let x = Math.min(Math.max(8, r.left), window.innerWidth - pr.width - 8);
    let y = r.bottom + 6;
    if (y + pr.height > window.innerHeight - 8) y = r.top - pr.height - 6;
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  function hide() { if (cur) cur.classList.remove('on'); cur = null; pop.classList.remove('show'); }

  document.addEventListener('mouseover', function (e) { const el = e.target.closest && e.target.closest('.w'); if (el) show(el); });
  document.addEventListener('mouseout', function (e) { const el = e.target.closest && e.target.closest('.w'); if (el && !el.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('w')) show(e.target); });
  document.addEventListener('focusout', function (e) { if (e.target.classList && e.target.classList.contains('w')) hide(); });
  document.addEventListener('click', function (e) { const el = e.target.closest && e.target.closest('.w'); if (el) show(el); else hide(); });
  window.addEventListener('scroll', hide, { passive: true });
})();
