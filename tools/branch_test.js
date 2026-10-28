/**
 * Branch test: a workspace header and a Session row must produce DIFFERENT
 * action sheets.
 *
 * The shipped markup is the authority (ui-workspace `Rows.js`):
 *
 *   workspace row   <div data-row-key="workspace:<key>" class="...projectRow..."
 *                     role="treeitem" aria-expanded="true">
 *                     <span class="...slot...folder...">
 *                     <span class="...slot...chevron...">
 *                     <span class="...projectText..."><span class="...title...">NAME</span></span>
 *                     <span class="...rowActions...">
 *                       <button aria-label='工作区"NAME"的操作'>   ← "..." menu trigger
 *                       <button aria-label='在"NAME"中新建会话'>   ← new session
 *                     </span>
 *                   </div>
 *
 *   session row     <div data-row-key="session:<id>" class="...sessionRow...">
 *                     <span class="...slot...">
 *                     <span class="...title...">TITLE</span>
 *                     <span class="...time...">2m</span>
 *                     <span class="...rowActions..."><button aria-label='会话"TITLE"的操作'></button></span>
 *                   </div>
 *
 * This script builds both shapes, loads the real bundle, opens the sheet for
 * each, and prints which actions each one offers. It fails if a workspace sheet
 * ever shows a session-only action (archive/pin) or vice versa.
 */
const fs = require('fs');
const path = require('path');

const BUNDLE = process.argv[2] || path.join(__dirname, '..', 'plugin', 'dsh-touch', 'client.js');

/* ---------- DOM ---------- */

class El {
  constructor(tag, className, attrs) {
    this.tagName = String(tag).toUpperCase();
    this.className = className || '';
    this.attributes = new Map(Object.entries(attrs || {}));
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.style = new Map();
    this._listeners = new Map();
    this._set = new Set(String(this.className).split(/\s+/).filter(Boolean));
    const self = this;
    this.classList = {
      add: (c) => {
        self._set.add(c);
        self.className = [...self._set].join(' ');
      },
      remove: (c) => {
        self._set.delete(c);
        self.className = [...self._set].join(' ');
      },
      contains: (c) => self._set.has(c),
    };
  }
  setAttribute(n, v) {
    this.attributes.set(n, String(v));
  }
  getAttribute(n) {
    return this.attributes.has(n) ? this.attributes.get(n) : null;
  }
  hasAttribute(n) {
    return this.attributes.has(n);
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === documentStub.body || node === documentStub.documentElement;
  }
  descendants() {
    const out = [];
    for (const child of this.children) {
      out.push(child);
      out.push(...child.descendants());
    }
    return out;
  }
  matches(selector) {
    for (const part of String(selector).split(',')) {
      const sel = part.trim();
      if (sel.startsWith('[data-row-key^="') && sel.endsWith('"]')) {
        const prefix = sel.slice('[data-row-key^="'.length, -2);
        const value = this.getAttribute('data-row-key') || '';
        if (value.startsWith(prefix)) return true;
        continue;
      }
      if (sel.startsWith('[role="') && sel.endsWith('"]')) {
        if (this.getAttribute('role') === sel.slice(7, -2)) return true;
        continue;
      }
    }
    return false;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) {
    const want = String(selector);
    const out = [];
    for (const node of this.descendants()) {
      if (want === '[role="menuitem"]') {
        if (node.getAttribute('role') === 'menuitem') out.push(node);
        continue;
      }
      if (want === 'button') {
        if (node.tagName === 'BUTTON') out.push(node);
        continue;
      }
      if (want === 'span[class]') {
        if (node.tagName === 'SPAN' && node.className) out.push(node);
        continue;
      }
      if (want.startsWith('span[class*="') && want.endsWith('"]')) {
        const needle = want.slice('span[class*="'.length, -2);
        if (node.tagName === 'SPAN' && String(node.className).includes(needle)) out.push(node);
        continue;
      }
      if (want === '[data-row-key]') {
        if (node.hasAttribute('data-row-key')) out.push(node);
        continue;
      }
      if (want.startsWith('[data-row-key^=')) {
        if (node.matches(want)) out.push(node);
        continue;
      }
    }
    return out;
  }
  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
  getClientRects() {
    return [{ width: 200, height: 34 }];
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 200, height: 34 };
  }
  scrollIntoView() {}
  click() {
    const handlers = this._listeners.get('click') || [];
    for (const handler of handlers) handler({ target: this, preventDefault() {}, stopPropagation() {} });
  }
  focus() {}
  addEventListener(type, handler) {
    const list = this._listeners.get(type) || [];
    list.push(handler);
    this._listeners.set(type, list);
  }
  removeEventListener() {}
}

const documentStub = {
  body: new El('body', '', {}),
  head: new El('head', '', {}),
  documentElement: new El('html', '', {}),
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  createElement: (tag) => new El(tag, '', {}),
  querySelector: (sel) => documentStub.body.querySelector(sel),
  querySelectorAll: (sel) => {
    const found = documentStub.body.querySelectorAll(sel);
    if (sel === '[role="menuitem"]') {
      // menuitems live in the portalled menu, which this stub keeps on body
      return found;
    }
    return found;
  },
};

global.window = {
  document: documentStub,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  addEventListener() {},
  removeEventListener() {},
  setInterval: () => 0,
  clearInterval() {},
};
global.document = documentStub;
global.navigator = { language: 'zh-CN', userAgent: 'node', vibrate() {} };
global.Node = El;
global.Element = El;
global.HTMLElement = El;
global.localStorage = { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); } };
global.setTimeout = (fn) => {
  // The harness runs the menu search immediately by returning a fake timer.
  if (typeof fn === 'function') pendingTimers.push(fn);
  return pendingTimers.length;
};
global.clearTimeout = () => {};
const pendingTimers = [];
function flushTimers(rounds = 30) {
  for (let i = 0; i < rounds && pendingTimers.length > 0; i += 1) {
    const batch = pendingTimers.splice(0, pendingTimers.length);
    for (const fn of batch) fn();
  }
}

/* ---------- React ---------- */

let hookState = {};
const React = {
  createElement(type, props, ...children) {
    const merged = Object.assign({}, props || {});
    if (children.length === 1) merged.children = children[0];
    else if (children.length > 1) merged.children = children;
    return { type, props: merged, children };
  },
  Fragment: Symbol('Fragment'),
  Component: class Component {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(next) {
      this.state = Object.assign({}, this.state, next);
    }
  },
  useState: (initial) => {
    const key = 'h' + Object.keys(hookState).length;
    if (!(key in hookState)) hookState[key] = typeof initial === 'function' ? initial() : initial;
    return [hookState[key], (v) => { hookState[key] = typeof v === 'function' ? v(hookState[key]) : v; }];
  },
  useEffect: () => {},
  useCallback: (fn) => fn,
  useSyncExternalStore: (subscribe, get) => get(),
};

/* ---------- load the bundle ---------- */

let captured = null;
global.window.__ModuleLoader__ = { load(def) { captured = def; } };
global.__ModuleLoader__ = global.window.__ModuleLoader__;

const source = fs.readFileSync(BUNDLE, 'utf8');
new Function('window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'localStorage', source)(
  global.window, global.document, global.navigator, global.Node, global.Element, global.HTMLElement, global.localStorage,
);

const mod = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require ' + name);
});

/* ---------- faithful mock ctx (enforces inject) ---------- */
const declared = mod.inject || [];
const SERVICE_NAMES = new Set([...declared, 'locale', 'slots', 'uiWorkspace', 'sessions', 'workspaces']);
const registrations = [];
const locale = {
  bind: () => (key) => key,
  getSnapshot: () => ({ locale: 'zh-CN' }),
  subscribe: () => () => {},
};
const slots = {
  inject(key, cb) { registrations.push({ key, ...(cb() || {}) }); },
  register(options, component) {
    registrations.push({ register: options.name, id: options.id, component });
    if (typeof options.label === 'function') options.label();
    return () => {};
  },
};
const ctx = new Proxy(
  {
    locale,
    slots,
    uiWorkspace: { openSession() {}, archiveSession: async () => {}, unarchiveSession: async () => {}, pinSession: async () => {}, unpinSession: async () => {} },
    sessions: { using: async (t, o, op) => op({ binding: { session: { rename: async () => {} } } }) },
    effect(cb) { return cb() || (() => {}); },
  },
  {
    get(bag, prop, receiver) {
      if (typeof prop === 'symbol' || prop in bag) return Reflect.get(bag, prop, receiver);
      if (SERVICE_NAMES.has(String(prop))) throw new Error(`cannot get property "${String(prop)}" without inject`);
      return Reflect.get(bag, prop, receiver);
    },
  },
);

mod.apply(ctx);
const api = global.window.__dshTouch;
if (!api) {
  console.error('FAIL __dshTouch was not published');
  process.exit(1);
}

/* ---------- build the row shapes ---------- */

function button(label) {
  const b = new El('button', 'hIlkoa_iconButton', { 'aria-label': label });
  b.addEventListener('click', () => {
    b._clicked = true;
  });
  return b;
}

/**
 * A real workspace group header: the "..." trigger wrapped in the Menu's own
 * relative root span (`.root`, position: relative; display: inline-flex), and a
 * "new session" button beside it.
 */
function buildWorkspaceRow(name, expanded) {
  const row = new El('div', 'hIlkoa_projectRow', {
    'data-row-key': 'workspace:' + name,
    role: 'treeitem',
    'aria-expanded': String(expanded),
  });
  row.appendChild(new El('span', 'hIlkoa_slot hIlkoa_folder', {}));
  row.appendChild(new El('span', 'hIlkoa_slot hIlkoa_chevron', {}));
  const text = new El('span', 'hIlkoa_projectText', {});
  const title = new El('span', 'hIlkoa_title', {});
  title.textContent = name;
  text.appendChild(title);
  row.appendChild(text);

  const actions = new El('span', 'hIlkoa_rowActions', {});
  const menuRoot = new El('span', 'hIlkoa_root', {});
  const trigger = button('工作区“' + name + '”的操作');
  menuRoot.appendChild(trigger);
  actions.appendChild(menuRoot);
  const plus = button('在“' + name + '”中新建会话');
  actions.appendChild(plus);
  row.appendChild(actions);

  row._trigger = trigger;
  row._plus = plus;
  return row;
}

/**
 * The ungrouped-sessions header. `actions` is undefined for a group without a
 * workspaceId, so the host renders no "..." at all — only the "+" button.
 * Clicking that button on long press would create a session, so it must never
 * be treated as a menu trigger.
 */
function buildUngroupedRow() {
  const row = new El('div', 'hIlkoa_projectRow', {
    'data-row-key': 'workspace:__ungrouped',
    role: 'treeitem',
    'aria-expanded': 'true',
  });
  row.appendChild(new El('span', 'hIlkoa_slot hIlkoa_folder', {}));
  const text = new El('span', 'hIlkoa_projectText', {});
  const title = new El('span', 'hIlkoa_title', {});
  title.textContent = '未分组';
  text.appendChild(title);
  row.appendChild(text);
  const actions = new El('span', 'hIlkoa_rowActions', {});
  const plus = button('在“未分组”中新建会话');
  actions.appendChild(plus);
  row.appendChild(actions);
  row._plus = plus;
  return row;
}

function buildSessionRow(id, titleText, archived) {
  const row = new El('div', 'hIlkoa_sessionRow' + (archived ? ' hIlkoa_archived' : ''), {
    'data-row-key': 'session:' + id,
    role: 'treeitem',
  });
  row.appendChild(new El('span', 'hIlkoa_slot', {}));
  const title = new El('span', 'hIlkoa_title', {});
  title.textContent = titleText;
  row.appendChild(title);
  const time = new El('span', 'hIlkoa_time', {});
  time.textContent = '2 分钟前';
  row.appendChild(time);
  const actions = new El('span', 'hIlkoa_rowActions', {});
  actions.appendChild(button('会话“' + titleText + '”的操作'));
  row.appendChild(actions);
  return row;
}

/* ---------- render helper ---------- */
function render(element, depth = 0) {
  if (element === null || element === undefined || typeof element === 'boolean') return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map((c) => render(c, depth + 1)).join('');
  if (typeof element !== 'object') return '';
  const { type, props } = element;
  if (typeof type === 'symbol') return (element.children || []).map((c) => render(c, depth + 1)).join('');
  if (typeof type === 'function') {
    const isClass = type.prototype && typeof type.prototype.render === 'function';
    if (isClass) return render(new type(props).render(), depth + 1);
    return render(type(Object.assign({}, props, { children: element.children })), depth + 1);
  }
  return (element.children || []).map((c) => render(c, depth + 1)).join('');
}

function layerComponent() {
  const found = registrations.find((r) => r.register === 'shell.overlay');
  return found ? found.component : null;
}

/** Install one row as the only row, then take the exact path the gesture takes. */
function runRow(row) {
  documentStub.body.children = [row];
  row.parentNode = documentStub.body;
  hookState = {};
  const described = api.describe(0);
  if (described === null) {
    return { described: null, openResult: null, text: null, triggerClicked: false, plusClicked: false };
  }
  const openResult = api.open(0);
  const sheet = layerComponent();
  const text = render(React.createElement(sheet, {}));
  api.close();
  return {
    described,
    openResult,
    text,
    triggerClicked: !!(row._trigger && row._trigger._clicked),
    plusClicked: !!(row._plus && row._plus._clicked),
  };
}

/* ---------- assertions ---------- */
const SESSION_SHAPE = ['归档', '置顶', '重命名', 'sheet.archive', 'sheet.pin'];
const WORKSPACE_SHAPE = ['重命名工作区', '删除工作区', '新建会话', 'sheet.renameWorkspace', 'sheet.deleteWorkspace'];

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
  if (!condition) failures += 1;
}

console.log('=== workspace header: delegates to the host "..." menu ===');
const workspaceRow = buildWorkspaceRow('my-project', true);
const ws = runRow(workspaceRow);
console.log('   describe:', JSON.stringify(ws.described));
check(ws.described.isWorkspace === true, 'detected as a workspace');
check((ws.described.title || '') === 'my-project', 'title read from projectText > title');
check(ws.described.archived === false, 'not reported as archived (that is a Session state)');
check(ws.described.expanded === true, 'expansion state read from aria-expanded');
check(ws.described.hasMenuTrigger === true, '"..." trigger located');
check(ws.openResult === 'opened native menu', 'long press opens the native menu');
check(ws.triggerClicked === true, 'the "..." trigger was clicked');
check(ws.plusClicked === false, 'the "new session" button was NOT clicked');
// The overlay always renders its stylesheet; the close glyph only exists while
// the dialog itself is mounted, so it is the reliable "is a sheet open" marker.
check((ws.text || '').includes(String.fromCharCode(0x2715)) === false, 'no sheet dialog is rendered for a workspace');
for (const bad of SESSION_SHAPE) {
  check(!(ws.text || '').includes(bad), `no session action "${bad}" leaks in`);
}

console.log('');
console.log('=== ungrouped header: no "..." exists, so nothing happens ===');
const ungrouped = runRow(buildUngroupedRow());
console.log('   describe:', JSON.stringify(ungrouped.described));
check(ungrouped.described.isWorkspace === true, 'detected as a workspace');
check(ungrouped.described.hasMenuTrigger === false, 'no "..." trigger on an ungrouped header');
check(ungrouped.openResult === 'row had no target', 'long press does nothing');
check(ungrouped.plusClicked === false, 'critical: the "+" button was NOT clicked (no accidental session)');
check((ungrouped.text || '').includes(String.fromCharCode(0x2715)) === false, 'no sheet dialog is rendered');

console.log('');
console.log('=== session row: keeps the custom sheet ===');
const session = runRow(buildSessionRow('session-abc', '会话标题', false));
console.log('   describe:', JSON.stringify(session.described));
const sessionText = session.text || '';
check(session.described.isWorkspace === false, 'detected as a session');
check((session.described.title || '') === '会话标题', 'title read from the row title span');
check(session.openResult === 'opened sheet', 'long press opens the sheet');
check(sessionText.includes('归档'), 'offers "archive"');
check(sessionText.includes('置顶'), 'offers "pin"');
check(sessionText.includes('重命名'), 'offers "rename"');
for (const bad of WORKSPACE_SHAPE) {
  check(!sessionText.includes(bad), `does NOT offer workspace action "${bad}"`);
}

console.log('');
console.log('=== archived session flips its actions ===');
const archived = runRow(buildSessionRow('session-def', '旧会话', true));
const archivedText = archived.text || '';
check(archived.described.archived === true, 'archived state detected');
check(archivedText.includes('取消归档'), 'offers "unarchive"');
check(!archivedText.includes('置顶'), 'does not offer "pin" while archived');

console.log('');
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('all branch checks passed');
