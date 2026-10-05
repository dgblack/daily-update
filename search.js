// Keyword search across all daily reports linked from index.html.
// Reports are fetched on first use and split into items (cards, list entries, paragraphs).
(function () {
  var input = document.getElementById('q');
  var status = document.getElementById('status');
  var out = document.getElementById('results');
  var list = document.getElementById('reports');
  if (!input || !out || !list) return;

  var items = null, loading = null, timer = null;

  function reportLinks() {
    return Array.prototype.map.call(list.querySelectorAll('a[href$=".html"]'), function (a) {
      return { href: a.getAttribute('href'), date: a.textContent.trim() };
    });
  }

  function sectionOf(el) {
    for (var n = el; n && n.tagName !== 'MAIN'; n = n.parentElement) {
      for (var s = n.previousElementSibling; s; s = s.previousElementSibling) {
        if (s.tagName === 'H2') return s.textContent.trim();
      }
    }
    return '';
  }

  function parse(report, html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var main = doc.querySelector('main');
    if (!main) return [];
    var nodes = main.querySelectorAll('.card, li, main > p:not(:first-child)');
    var res = [];
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.closest('nav') || (el.tagName === 'LI' && el.closest('.card'))) return;
      var clean = function (s) { return s.replace(/\s+/g, ' ').trim(); };
      var isCard = el.classList.contains('card');
      // Cards: search title + meta + body, but show only the body paragraphs in the snippet.
      var parts = isCard ? Array.prototype.map.call(el.children, function (c) { return clean(c.textContent); }) : [clean(el.textContent)];
      var all = parts.join(' ');
      if (!all) return;
      var body = isCard ? Array.prototype.filter.call(el.querySelectorAll('p'), function (p) { return !p.classList.contains('meta'); })
        .map(function (p) { return clean(p.textContent); }).join(' ') : all;
      var head = el.querySelector('h3 a') || el.querySelector('h3') || el.querySelector('a[href^="http"]');
      res.push({
        date: report.date,
        page: report.href,
        section: el.classList.contains('sub') ? 'Summary' : sectionOf(el),
        title: head ? clean(head.textContent) : '',
        url: head && /^https?:/.test(head.getAttribute('href') || '') ? head.getAttribute('href') : '',
        text: body || all,
        lower: all.toLowerCase()
      });
    });
    return res;
  }

  function load() {
    if (loading) return loading;
    status.textContent = 'Loading reports…';
    loading = Promise.all(reportLinks().map(function (r) {
      return fetch(r.href).then(function (resp) { return resp.ok ? resp.text() : ''; })
        .then(function (html) { return parse(r, html); })
        .catch(function () { return []; });
    })).then(function (lists) {
      items = [].concat.apply([], lists);
      status.textContent = '';
      return items;
    }).catch(function () {
      status.textContent = 'Could not load reports (search only works when served over http, e.g. on GitHub Pages).';
      items = [];
      return items;
    });
    return loading;
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function snippet(text, terms) {
    var lower = text.toLowerCase(), pos = lower.indexOf(terms[0]);
    var start = Math.max(0, pos - 90), end = Math.min(text.length, start + 280);
    var s = (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
    var re = new RegExp('(' + terms.map(reEsc).join('|') + ')', 'gi');
    return esc(s).replace(re, '<mark>$1</mark>');
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    var terms = q.split(/\s+/).filter(Boolean);
    try { history.replaceState(null, '', q ? '#q=' + encodeURIComponent(input.value.trim()) : location.pathname); } catch (e) {}
    if (!terms.length) { out.innerHTML = ''; status.textContent = ''; list.parentElement.hidden = false; return; }
    load().then(function () {
      var hits = items.filter(function (it) { return terms.every(function (t) { return it.lower.indexOf(t) !== -1; }); });
      list.parentElement.hidden = true;
      var nRep = new Set(hits.map(function (h) { return h.date; })).size;
      status.textContent = hits.length ? hits.length + (hits.length === 1 ? ' match' : ' matches') +
        ' in ' + nRep + (nRep === 1 ? ' report' : ' reports') : 'No matches';
      out.innerHTML = hits.map(function (h) {
        var title = h.title ? (h.url ? '<a href="' + esc(h.url) + '" target="_blank" rel="noopener">' + esc(h.title) + '</a>' : esc(h.title)) : '';
        return '<div class="card hit">' + (title ? '<h3>' + title + '</h3>' : '') +
          '<p class="meta"><a href="' + esc(h.page) + '">' + esc(h.date) + '</a>' + (h.section ? ' &middot; ' + esc(h.section) : '') + '</p>' +
          '<p>' + snippet(h.text, terms) + '</p></div>';
      }).join('');
    });
  }

  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(render, 150); });
  input.addEventListener('focus', load, { once: true });
  var m = location.hash.match(/^#q=(.*)$/);
  if (m) { input.value = decodeURIComponent(m[1]); render(); }
})();
