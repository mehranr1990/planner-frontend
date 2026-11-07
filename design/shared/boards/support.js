/* Minimal stand-alone renderer for the Mehran Planner design boards (*.dc.html).
   Lets you open a board directly in a browser. Supports: <x-dc>, <helmet>, {{holes}},
   <sc-for list as>, <sc-if value>, onClick="{{ fn }}", and a DCLogic class with setState().
   Known limits: <dc-import> renders a placeholder; tables built with <sc-for> inside <tbody>
   may render out of place (browser HTML parsing rules). */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); if (this.__render) this.__render(); }
  }
  window.DCLogic = DCLogic;

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    const parts = path.split('.');
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i] && Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) {
        let v = scopes[i][parts[0]];
        for (let j = 1; j < parts.length; j++) v = v == null ? undefined : v[parts[j]];
        return v;
      }
    }
    return undefined;
  }
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const interp = (s, scopes) => s.replace(HOLE, (_, p) => { const v = lookup(p, scopes); return v == null ? '' : String(v); });

  function processChildren(src, dst, scopes) {
    src.childNodes.forEach((n) => processNode(n, dst, scopes));
  }
  function processNode(n, dst, scopes) {
    if (n.nodeType === 3) { dst.appendChild(document.createTextNode(interp(n.nodeValue, scopes))); return; }
    if (n.nodeType !== 1) return;
    const tag = n.localName;
    if (tag === 'sc-for') {
      const m = (n.getAttribute('list') || '').match(/\{\{\s*([^}]+?)\s*\}\}/);
      const list = m ? lookup(m[1], scopes) : [];
      const as = n.getAttribute('as') || 'item';
      (Array.isArray(list) ? list : []).forEach((item, i) => processChildren(n, dst, scopes.concat([{ [as]: item, index: i }])));
      return;
    }
    if (tag === 'sc-if') {
      const m = (n.getAttribute('value') || '').match(/\{\{\s*([^}]+?)\s*\}\}/);
      if (m && lookup(m[1], scopes)) processChildren(n, dst, scopes);
      return;
    }
    if (tag === 'dc-import') {
      const ph = document.createElement('div');
      ph.textContent = 'Embedded board: ' + (n.getAttribute('name') || '') + ' (open that board separately)';
      ph.style.cssText = 'padding:24px;border:1.5px dashed #A9A9A1;border-radius:24px;font:600 14px Urbanist,sans-serif;color:#5E5E58';
      dst.appendChild(ph); return;
    }
    const el = n.cloneNode(false);
    Array.from(n.attributes).forEach((a) => {
      if (a.name.startsWith('hint-placeholder')) { el.removeAttribute(a.name); return; }
      const m = a.value.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
      if (a.name.startsWith('on') && m) {
        el.removeAttribute(a.name);
        const fn = lookup(m[1], scopes);
        if (typeof fn === 'function') el.addEventListener(a.name.slice(2), (e) => fn(e));
        return;
      }
      if (a.value.indexOf('{{') >= 0) {
        if (m) {
          const v = lookup(m[1], scopes);
          if (v === null || v === undefined || v === false && (a.name === 'disabled' || a.name === 'checked')) { el.removeAttribute(a.name); return; }
          el.setAttribute(a.name, String(v));
        } else el.setAttribute(a.name, interp(a.value, scopes));
      }
    });
    if (tag === 'textarea') { el.textContent = interp(n.textContent, scopes); dst.appendChild(el); return; }
    processChildren(n, el, scopes);
    dst.appendChild(el);
  }

  function boot() {
    const host = document.querySelector('x-dc');
    if (!host) return;
    const helmet = host.querySelector('helmet');
    if (helmet) { Array.from(helmet.childNodes).forEach((c) => document.head.appendChild(c)); helmet.remove(); }
    const tpl = document.createElement('template');
    tpl.innerHTML = host.innerHTML;
    host.innerHTML = '';
    host.style.display = 'block';
    const sc = document.querySelector('script[data-dc-script]');
    let inst = null;
    if (sc) {
      let props = {};
      try { props = JSON.parse(sc.getAttribute('data-props') || '{}'); } catch (e) {}
      const Comp = new Function('DCLogic', sc.textContent + '\n;return Component;')(DCLogic);
      inst = new Comp(props);
    }
    const render = () => {
      const vals = inst ? inst.renderVals() : {};
      const frag = document.createDocumentFragment();
      processChildren(tpl.content, frag, [vals]);
      host.innerHTML = '';
      host.appendChild(frag);
    };
    if (inst) inst.__render = render;
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
