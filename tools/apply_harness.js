/**
 * Loads plugin/dsh-touch/client.js the way the browser module loader does and
 * runs its `apply` against a faithful fake Client context.
 *
 * The bundle is a browser artifact that registers itself through
 * `window.__ModuleLoader__.load({ id, factory })`, so this harness supplies
 * that one global plus the DOM globals `apply` touches, then calls the real
 * `apply` with a mock ctx whose services record what the plugin registered.
 * An exception that would fail the plugin's fiber shows up as a thrown error
 * here instead of at Harness boot.
 */
const fs = require('fs');
const path = require('path');

const BUNDLE = process.argv[2] || path.join(__dirname, '..', 'plugin', 'dsh-touch', 'client.js');

/* ---------- minimal DOM ---------- */

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = new Map();
    this.attributes = new Map();
    this.classList = {
      _set: new Set(),
      add: (c) => this.classList._set.add(c),
      remove: (c) => this.classList._set.delete(c),
      contains: (c) => this.classList._set.has(c),
    };
    this.className = '';
    this.isConnected = true;
    this.textContent = '';
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
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
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return null;
  }
  contains() {
    return false;
  }
  getClientRects() {
    return [];
  }
  scrollIntoView() {}
  addEventListener() {}
  removeEventListener() {}
}

class FakeNode {}
Object.setPrototypeOf(FakeElement.prototype, FakeNode.prototype);

const documentStub = {
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  createElement: (tag) => new FakeElement(tag),
  querySelector: () => null,
  querySelectorAll: () => [],
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
global.navigator = { language: 'zh-CN', userAgent: 'node-harness', vibrate() {} };
global.Node = FakeNode;
global.Element = FakeElement;
global.HTMLElement = FakeElement;
global.localStorage = {
  _map: new Map(),
  getItem(k) {
    return this._map.has(k) ? this._map.get(k) : null;
  },
  setItem(k, v) {
    this._map.set(k, String(v));
  },
  removeItem(k) {
    this._map.delete(k);
  },
};
global.MutationObserver = undefined;

/* ---------- capture the registered factory ---------- */

let captured = null;
global.window.__ModuleLoader__ = {
  load(definition) {
    captured = definition;
  },
};
global.__ModuleLoader__ = global.window.__ModuleLoader__;

/* React stand-in: enough to build and *render* the module's components.
 * `useSyncExternalStore` is deliberately undefined by default to reproduce the
 * degraded-React path, and can be enabled with HARNESS_HAS_SYNC=1. */
let storeBump = null;
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
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useSyncExternalStore:
    process.env.HARNESS_HAS_SYNC === '1'
      ? (subscribe, get) => get()
      : undefined,
};

const source = fs.readFileSync(BUNDLE, 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'localStorage', 'MutationObserver', source)(
  global.window,
  global.document,
  global.navigator,
  global.Node,
  global.Element,
  global.HTMLElement,
  global.localStorage,
  global.MutationObserver,
);

if (captured === null) {
  console.error('FAIL: bundle never called window.__ModuleLoader__.load');
  process.exit(1);
}
console.log('module id:', captured.id);

const exportsObject = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

console.log('exports.name  :', exportsObject.name);
console.log('exports.inject:', JSON.stringify(exportsObject.inject));

/* ---------- the fake client context ---------- */

const registrations = [];
const effects = [];
const translations = new Map();

const locale = {
  bind: (ns) => (key, params) => {
    translations.set(ns + '/' + key, true);
    return '<' + ns + ':' + key + '>';
  },
  getSnapshot: () => ({ locale: 'zh-CN', id: 'zh-CN' }),
  subscribe: () => () => {},
};

const slots = {
  inject(key, callback) {
    registrations.push({ kind: 'inject', key });
    const disposer = callback();
    registrations.push({ kind: 'register-effect', key, disposer });
    return () => {};
  },
  register(options, component) {
    registrations.push({ kind: 'register', name: options.name, id: options.id, order: options.order, component });
    // Force the registrant's label thunk, the way a navigation projection would.
    if (typeof options.label === 'function') options.label();
    return () => {};
  },
};

/* ------------------------------------------------------------------ *
 * Cordis inject contract
 *
 * The real Client context throws
 *   Error: cannot get property "<name>" without inject
 * for any service a plugin did not declare, and that throw fails the plugin's
 * fiber — which the Web boot audit reports as a fatal boot failure. Mirroring
 * that here is what makes this harness able to catch the bug class that crashed
 * the app, instead of reporting a clean run for a bundle that cannot boot.
 * ------------------------------------------------------------------ */

const declaredInject = Array.isArray(exportsObject.inject) ? exportsObject.inject.slice() : [];
const SERVICE_NAMES = new Set([...declaredInject, 'locale', 'slots', 'uiWorkspace', 'sessions', 'workspaces']);

const ctx = new Proxy(
  {
    locale,
    slots,
    uiWorkspace: {
      openSession() {},
      archiveSession: async () => {},
      unarchiveSession: async () => {},
      pinSession: async () => {},
      unpinSession: async () => {},
    },
    sessions: {
      using: async (target, options, operation) => operation({ binding: { session: { rename: async () => {} } } }),
    },
    effect(callback, label) {
      effects.push(label);
      const disposer = callback();
      return () => {
        if (typeof disposer === 'function') disposer();
      };
    },
  },
  {
    get(bag, prop, receiver) {
      if (typeof prop === 'symbol' || prop in bag) return Reflect.get(bag, prop, receiver);
      if (SERVICE_NAMES.has(String(prop))) {
        throw new Error(`cannot get property "${String(prop)}" without inject`);
      }
      return Reflect.get(bag, prop, receiver);
    },
  },
);

console.log('--- inject contract ---');
console.log('   declared:', JSON.stringify(declaredInject));
console.log('   mock ctx exposes:', JSON.stringify(Object.keys(ctx)));

let failure = null;
try {
  exportsObject.apply(ctx);
} catch (error) {
  failure = error;
}

console.log('--- effects ---');
for (const label of effects) console.log('  ', label);
console.log('--- registrations ---');
for (const r of registrations) {
  if (r.kind === 'register') console.log('   register', r.name, 'id=' + r.id, 'order=' + r.order);
  else if (r.kind === 'inject') console.log('   inject  ', r.key);
}
console.log('--- result ---');
if (failure === null) {
  console.log('apply() did NOT throw');
} else {
  console.log('apply() THREW: ' + failure.constructor.name + ': ' + failure.message);
  console.log(failure.stack.split('\n').slice(0, 8).join('\n'));
}

/* ---------- render the registered components ---------- */

/**
 * Walk a React-element tree the way the renderer would, invoking function
 * components and class `render()` methods. This is the check that the earlier
 * harness lacked: `apply` can succeed while the render still throws.
 */
function renderElement(element, depth = 0) {
  if (element === null || element === undefined || typeof element === 'boolean') return null;
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map((child) => renderElement(child, depth + 1)).join('');
  if (typeof element !== 'object') return null;

  const { type, props } = element;
  if (typeof type === 'symbol') {
    // Fragment
    return (element.children || []).map((child) => renderElement(child, depth + 1)).join('');
  }
  if (typeof type === 'function') {
    const isClass = type.prototype && typeof type.prototype.render === 'function';
    if (isClass) {
      const instance = new type(props);
      const derived = typeof type.getDerivedStateFromError === 'function' ? null : null;
      void derived;
      return renderElement(instance.render(), depth + 1);
    }
    const children = type(Object.assign({}, props, { children: element.children }));
    return renderElement(children, depth + 1);
  }
  // Host element: render its children.
  return (element.children || []).map((child) => renderElement(child, depth + 1)).join('');
}

console.log('--- diagnostics global ---');
if (global.window.__dshTouch) {
  console.log('   window.__dshTouch published');
  console.log('   status:', JSON.stringify(global.window.__dshTouch.status));
  try {
    console.log('   __dshTouch.open() with no rows -> ' + global.window.__dshTouch.open());
  } catch (error) {
    console.log('   __dshTouch.open() THREW: ' + error.message);
  }
} else {
  console.log('   window.__dshTouch MISSING (diagnostics step failed)');
}

console.log('--- render registered components ---');
let rendered = 0;
for (const r of registrations) {
  if (r.kind !== 'register' || typeof r.component !== 'function') continue;
  rendered += 1;
  const label = r.name + '#' + r.id;
  try {
    const markup = renderElement(React.createElement(r.component, {}));
    console.log('   render OK   ' + label + (markup ? '  (' + markup.length + ' chars)' : '  (empty)'));
  } catch (error) {
    console.log('   render THREW ' + label + ' -> ' + error.constructor.name + ': ' + error.message);
    console.log(error.stack.split('\n').slice(1, 6).join('\n'));
  }
}
if (rendered === 0) console.log('   (no components were registered)');
