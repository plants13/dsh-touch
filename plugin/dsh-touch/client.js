window.__ModuleLoader__.load({
	id: '@local/dsh-touch',
	factory(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		var react = require('react');
		var h = react.createElement;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useCallback = react.useCallback;
		var useSyncExternalStore = react.useSyncExternalStore;

		var NS = 'settings.dsh-touch';
		var ID_PREFIX = 'dsht';

		/**
		 * Live self-report, also published as `window.__dshTouch`.
		 *
		 * Without this the only way to tell "the gesture never ran" from "the sheet
		 * opened but did not paint" is guesswork, because the two look identical
		 * from the outside.
		 */
		var status = {
			version: '1.1.0',
			activated: false,
			steps: 0,
			errors: [],
			presses: 0,
			contextMenus: 0,
			openings: 0,
			lastPointerType: '',
			lastRowKey: '',
		};

		/* ------------------------------------------------------------------ *
		 * Tunables
		 * ------------------------------------------------------------------ */

		var CONFIG = {
			longPressMs: 420,
			moveTolerancePx: 12,
			haptics: true,
		};

		var STORAGE_KEY = 'dsh-touch.settings.v1';

		function loadSettings() {
			try {
				if (typeof localStorage === 'undefined') return {};
				var raw = localStorage.getItem(STORAGE_KEY);
				if (raw === null || raw === '') return {};
				var parsed = JSON.parse(raw);
				return parsed !== null && typeof parsed === 'object' ? parsed : {};
			} catch (error) {
				return {};
			}
		}

		function saveSettings(patch) {
			try {
				if (typeof localStorage === 'undefined') return;
				var next = loadSettings();
				for (var key of Object.keys(patch)) next[key] = patch[key];
				localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			} catch (error) {
				/* A full or unavailable store must not break the gesture. */
			}
		}

		/** The complete effective config: defaults, then the user's saved patch. */
		function settings() {
			var saved = loadSettings();
			return {
				longPressMs: clampNumber(saved.longPressMs, 200, 1200, CONFIG.longPressMs),
				moveTolerancePx: CONFIG.moveTolerancePx,
				haptics: saved.haptics === undefined ? CONFIG.haptics : saved.haptics === true,
			};
		}

		function clampNumber(value, min, max, fallback) {
			var n = typeof value === 'number' ? value : Number(value);
			if (!isFinite(n)) return fallback;
			return Math.min(max, Math.max(min, Math.round(n)));
		}

		/* ------------------------------------------------------------------ *
		 * Locale
		 * ------------------------------------------------------------------ */

		var en = {
			'sheet.actions': 'Actions',
			'sheet.close': 'Close',
			'sheet.open': 'Open',
			'sheet.archive': 'Archive',
			'sheet.unarchive': 'Unarchive',
			'sheet.pin': 'Pin',
			'sheet.unpin': 'Unpin',
			'sheet.rename': 'Rename',
			'sheet.copy': 'Copy title',
			'sheet.copied': 'Copied',
			'sheet.archived': 'Archived',
			'sheet.pinned': 'Pinned',
			'sheet.workspace': 'Workspace',
			'sheet.session': 'Session',
			'sheet.expand': 'Expand',
			'sheet.collapse': 'Collapse',
			'sheet.newSession': 'New session here',
			'sheet.renameWorkspace': 'Rename workspace',
			'sheet.deleteWorkspace': 'Delete workspace',
			'sheet.copyName': 'Copy name',
			'sheet.noNewSession': 'No new-session button on this workspace',
			'sheet.working': 'Working',
			'sheet.failed': 'Action failed',
			'sheet.unknownTitle': 'Untitled session',
			'sheet.hint': 'Long-press a session row to open these actions.',
			'sheet.renameTitle': 'Rename session',
			'sheet.renameConfirm': 'Save',
			'sheet.renameCancel': 'Cancel',
			'sheet.renameFailed': 'Rename failed',
			'settings.title': 'Touch',
			'settings.description': 'Touchscreen gestures and hit-area sizing.',
			'settings.longPress': 'Long-press delay',
			'settings.longPressHint': 'How long a press must hold before the action sheet opens.',
			'settings.haptics': 'Haptic feedback',
			'settings.hapticsHint': 'Vibrate briefly when the action sheet opens, if the device supports it.',
			'settings.largerTargets': 'Larger touch targets',
			'settings.largerTargetsHint': 'Keep row actions visible and enlarge controls on coarse pointers.'
		};

		var zh = {
			'sheet.actions': '会话操作',
			'sheet.close': '关闭',
			'sheet.open': '打开',
			'sheet.archive': '归档',
			'sheet.unarchive': '取消归档',
			'sheet.pin': '置顶',
			'sheet.unpin': '取消置顶',
			'sheet.rename': '重命名',
			'sheet.copy': '复制标题',
			'sheet.copied': '已复制',
			'sheet.archived': '已归档',
			'sheet.pinned': '已置顶',
			'sheet.workspace': '工作区',
			'sheet.session': '会话',
			'sheet.expand': '展开',
			'sheet.collapse': '收起',
			'sheet.newSession': '在此新建会话',
			'sheet.renameWorkspace': '重命名工作区',
			'sheet.deleteWorkspace': '删除工作区',
			'sheet.copyName': '复制名称',
			'sheet.noNewSession': '这个工作区没有新建会话按钮',
			'sheet.working': '进行中',
			'sheet.failed': '操作失败',
			'sheet.unknownTitle': '未命名会话',
			'sheet.hint': '长按会话行即可呼出这些操作。',
			'sheet.renameTitle': '重命名会话',
			'sheet.renameConfirm': '保存',
			'sheet.renameCancel': '取消',
			'sheet.renameFailed': '重命名失败',
			'settings.title': '触屏',
			'settings.description': '触屏手势与命中区尺寸。',
			'settings.longPress': '长按延迟',
			'settings.longPressHint': '按住多久后弹出操作面板。',
			'settings.haptics': '触感反馈',
			'settings.hapticsHint': '弹出操作面板时轻微震动（设备支持时）。',
			'settings.largerTargets': '放大触控目标',
			'settings.largerTargetsHint': '在触屏设备上常显行操作按钮并放大控件。'
		};

		var dictionaries = { en: en, 'zh-CN': zh, zh: zh };
		var localeService = null;

		function t(key, params) {
			var text = key;
			if (localeService !== null) {
				try {
					var hit = localeService.t(key, params);
					if (typeof hit === 'string' && hit !== '' && hit !== key) return hit;
				} catch (error) {
					/* Fall through to the bundled dictionary. */
				}
			}
			var table = dictionaries[currentLocale()] || en;
			text = table[key] || en[key] || key;
			if (params !== undefined && params !== null) {
				text = text.replace(/\{(\w+)\}/g, function (match, name) {
					return params[name] === undefined ? match : String(params[name]);
				});
			}
			return text;
		}

		function currentLocale() {
			if (localeService !== null) {
				try {
					var snapshot = localeService.getSnapshot();
					if (snapshot && typeof snapshot.locale === 'string') return snapshot.locale;
					if (snapshot && typeof snapshot.id === 'string') return snapshot.id;
				} catch (error) {
					/* Fall through. */
				}
			}
			try {
				if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) return 'zh-CN';
			} catch (error) {
				/* Fall through. */
			}
			return 'en';
		}

		/* ------------------------------------------------------------------ *
		 * Gesture target registry
		 *
		 * The shipped workspace and session rows are host components with no
		 * extension slot for a press gesture, so the plugin observes pointer
		 * events that bubble to the document. Only the elements themselves are
		 * touched: the action sheet renders through `shell.overlay`, and no
		 * host DOM is moved, removed, or rewritten.
		 *
		 * Two row kinds carry the gesture, and they are nothing alike:
		 *   `workspace:<key>` — a workspace group header. Clicking it expands or
		 *      collapses the group, and its "..." menu offers rename and delete.
		 *   `session:<id>`    — one Session. Clicking it opens the Session, and
		 *      its "..." menu offers pin, rename, fork and archive.
		 * The action sheet therefore shows a different action set per kind.
		 * ------------------------------------------------------------------ */

		var GESTURE_SELECTOR = '[data-row-key^="session:"],[data-row-key^="workspace:"]';

		var LONG_PRESS_CLASS = ID_PREFIX + '-pressing';

		/* ------------------------------------------------------------------ *
		 * Action sheet store
		 * ------------------------------------------------------------------ */

		var listeners = new Set();
		var EMPTY_STATE = { open: false, target: null, epoch: 0 };
		var state = EMPTY_STATE;
		var epoch = 0;

		function emit() {
			for (var listener of Array.from(listeners)) {
				try {
					listener();
				} catch (error) {
					/* One bad subscriber must not stop the others. */
				}
			}
		}

		function replaceState(next) {
			state = next;
			emit();
		}

		var sheetStore = {
			subscribe: function (listener) {
				listeners.add(listener);
				return function () {
					listeners.delete(listener);
				};
			},
			getSnapshot: function () {
				return state;
			},
			open: function (target) {
				epoch += 1;
				replaceState({ open: true, target: target, epoch: epoch });
			},
			close: function () {
				if (state === EMPTY_STATE) return;
				replaceState(EMPTY_STATE);
			},
			/**
			 * Re-publish the snapshot so subscribers re-read localization. The
			 * epoch advances too: visible text derived at open time, such as the
			 * action labels, must be rebuilt rather than kept.
			 */
			refresh: function () {
				if (state === EMPTY_STATE) return;
				epoch += 1;
				replaceState({ open: state.open, target: state.target, epoch: epoch });
			},
		};

		/* ------------------------------------------------------------------ *
		 * DOM helpers
		 * ------------------------------------------------------------------ */

		function rowOf(element) {
			if (!(element instanceof Element)) return null;
			return element.closest(GESTURE_SELECTOR);
		}

		/**
		 * The row's title element.
		 *
		 * A workspace header wraps its label in `projectText > title`, while a
		 * Session row has `title` directly, so a plain `[class*="title"]` search
		 * finds the intended node for both. Class names are content-hashed, so
		 * the match is on the substring.
		 */
		function titleNode(row) {
			var className = typeof row.className === 'string' ? row.className : '';
			var scope = row;
			if (/projectRow/i.test(className)) {
				var wrapper = row.querySelector('span[class*="projectText"]');
				if (wrapper !== null) scope = wrapper;
			}
			var nodes = scope.querySelectorAll('span[class]');
			for (var node of nodes) {
				var nodeClass = typeof node.className === 'string' ? node.className : '';
				if (/(^|\s)\S*title\S*(\s|$)/i.test(nodeClass)) return node;
			}
			return null;
		}

		/** The actions cell holding the "..." menu trigger and quick buttons. */
		function actionsCell(row) {
			var cells = row.querySelectorAll('span[class]');
			for (var cell of cells) {
				var cellClass = typeof cell.className === 'string' ? cell.className : '';
				if (/rowActions/i.test(cellClass)) return cell;
			}
			return null;
		}

		function readTarget(row) {
			if (row === null || row === undefined) return null;
			var key = row.getAttribute('data-row-key') || '';
			var separator = key.indexOf(':');
			var kind = separator === -1 ? 'session' : key.slice(0, separator);
			var id = separator === -1 ? key : key.slice(separator + 1);
			var titleNodeRef = titleNode(row);
			var title = titleNodeRef === null ? '' : (titleNodeRef.textContent || '').trim();
			var className = typeof row.className === 'string' ? row.className : '';
			var isWorkspace = kind === 'workspace';
			return {
				id: id,
				kind: kind,
				isWorkspace: isWorkspace,
				title: title,
				/* A workspace header is never itself archived or pinned; those are
				 * Session states, and reading them here would report nonsense. */
				archived: !isWorkspace && /archived/i.test(className),
				pinned:
					!isWorkspace &&
					(/pinIndicator/i.test(className) || row.querySelector('[class*="pinIndicator"]') !== null),
				expanded: isWorkspace ? row.getAttribute('aria-expanded') === 'true' : undefined,
				element: row,
			};
		}

		function isVisible(element) {
			if (!(element instanceof Element)) return false;
			var style = window.getComputedStyle(element);
			if (style.display === 'none' || style.visibility === 'hidden') return false;
			return element.getClientRects().length > 0;
		}

		function displayName(target) {
			if (!target) return t('sheet.unknownTitle');
			if (target.title !== '') return target.title;
			var row = target.element;
			if (row !== null && row.isConnected) {
				var node = titleNode(row);
				var live = node === null ? '' : (node.textContent || '').trim();
				if (live !== '') return live;
			}
			return t('sheet.unknownTitle');
		}

		/* ------------------------------------------------------------------ *
		 * Long-press gesture
		 * ------------------------------------------------------------------ */

		/* The row whose synthetic click the last gesture must swallow. */
		var suppressedRow = null;

		/**
		 * Raise the action sheet for one row. Shared by the gesture and by the
		 * manual `__dshTouch.open()` trigger so both take the identical path.
		 * Returns false when the row cannot produce a target.
		 */
		function fire(row, config) {
			if (row === null || row === undefined) return false;
			if (!row.isConnected) return false;
			var target = readTarget(row);
			if (target === null) return false;
			suppressedRow = target.element;
			pulse(config);
			status.openings += 1;
			status.lastRowKey = (target.kind || '') + ':' + (target.id || '');
			sheetStore.open(target);
			return true;
		}

		function pulse(config) {
			if (config === undefined || !config.haptics) return;
			/* Chromium blocks this until the frame has seen a real tap and logs a
			 * warning when it does, so only try it on a genuine touch press. */
			if (status.lastPointerType !== 'touch' && status.lastPointerType !== 'pen') return;
			try {
				if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
					navigator.vibrate(12);
				}
			} catch (error) {
				/* Vibration is a nicety; unsupported devices just skip it. */
			}
		}

		function attachLongPress() {
			if (typeof document === 'undefined') return function () {};

			var timer = null;
			var pending = null;
			var activePointer = null;
			var startX = 0;
			var startY = 0;
			var pressStartedAt = 0;

			function clearTimer() {
				if (timer !== null) {
					clearTimeout(timer);
					timer = null;
				}
			}

			function clearPending() {
				clearTimer();
				if (pending !== null) pending.classList.remove(LONG_PRESS_CLASS);
				pending = null;
				activePointer = null;
			}

			function arm(row, config) {
				pending = row;
				row.classList.add(LONG_PRESS_CLASS);
				/* Drive the progress cue from the real configured duration. */
				row.style.setProperty('--' + ID_PREFIX + '-lp', config.longPressMs + 'ms');
				timer = setTimeout(function () {
					timer = null;
					var held = pending;
					clearPending();
					fire(held, config);
				}, config.longPressMs);
			}

			function onPointerDown(event) {
				/* A press supersedes any pending click suppression from the last one. */
				suppressedRow = null;
				if (event.button !== undefined && event.button > 0) return;
				if (!pressPointerType(event)) return;
				if (isInteractive(event.target)) return;
				var row = rowOf(event.target);
				if (row === null || !isVisible(row)) return;
				var config = settings();
				clearPending();
				activePointer = event.pointerId;
				startX = event.clientX;
				startY = event.clientY;
				pressStartedAt = Date.now();
				status.presses += 1;
				status.lastPointerType = typeof event.pointerType === 'string' ? event.pointerType : '(none)';
				arm(row, config);
			}

			/**
			 * Accept a finger, a pen, and a real primary-button mouse press.
			 *
			 * `pointerType` can also arrive as an empty string — synthetic events and
			 * some remote/automation surfaces do that — and refusing those would
			 * make the gesture untestable, so an unset type is allowed too.
			 */
			function pressPointerType(event) {
				if (typeof event.pointerType !== 'string') return true;
				if (event.pointerType === '') return true;
				return event.pointerType === 'touch' || event.pointerType === 'pen' || event.pointerType === 'mouse';
			}

			function isInteractive(element) {
				if (!(element instanceof Element)) return false;
				return element.closest('button,input,textarea,select,[role="menu"],[contenteditable="true"]') !== null;
			}

			function onPointerMove(event) {
				if (pending === null || event.pointerId !== activePointer) return;
				var dx = event.clientX - startX;
				var dy = event.clientY - startY;
				var distance = Math.sqrt(dx * dx + dy * dy);
				/* More movement than the tolerance means a scroll or drag. */
				if (distance > settings().moveTolerancePx) clearPending();
			}

			function onPointerEnd(event) {
				if (pending === null || event.pointerId !== activePointer) return;
				/* A cancelled pointer usually precedes the platform's own
				 * long-press signal, so give `contextmenu` a moment to arrive
				 * before discarding the press. */
				var heldFor = Date.now() - pressStartedAt;
				if (event.type === 'pointercancel' && heldFor >= 250) {
					var held = pending;
					clearTimer();
					setTimeout(function () {
						if (pending === held) clearPending();
					}, 250);
					return;
				}
				clearPending();
			}

			/**
			 * Platform long-press signal. Chromium fires this for a finger held on
			 * a row, independently of our own timer, so honoring it makes the
			 * gesture work even where `pointercancel` beats the timer.
			 */
			function onContextMenu(event) {
				if (sheetStore.getSnapshot().open) return;
				var row = rowOf(event.target);
				if (row === null || !isVisible(row)) return;
				status.contextMenus += 1;
				if (fire(row, settings())) event.preventDefault();
			}

			function onClickCapture(event) {
				if (suppressedRow === null) return;
				if (!(event.target instanceof Node)) {
					suppressedRow = null;
					return;
				}
				if (!suppressedRow.contains(event.target)) return;
				/* Swallow the synthetic click the long press would otherwise fire. */
				event.preventDefault();
				event.stopPropagation();
				suppressedRow = null;
			}

			function onAuxClickCapture(event) {
				if (suppressedRow === null) return;
				event.stopPropagation();
				suppressedRow = null;
			}

			var options = { capture: true };
			document.addEventListener('pointerdown', onPointerDown, options);
			document.addEventListener('pointermove', onPointerMove, options);
			document.addEventListener('pointerup', onPointerEnd, options);
			document.addEventListener('pointercancel', onPointerEnd, options);
			document.addEventListener('contextmenu', onContextMenu, options);
			document.addEventListener('click', onClickCapture, options);
			document.addEventListener('auxclick', onAuxClickCapture, options);

			return function () {
				clearPending();
				document.removeEventListener('pointerdown', onPointerDown, options);
				document.removeEventListener('pointermove', onPointerMove, options);
				document.removeEventListener('pointerup', onPointerEnd, options);
				document.removeEventListener('pointercancel', onPointerEnd, options);
				document.removeEventListener('contextmenu', onContextMenu, options);
				document.removeEventListener('click', onClickCapture, options);
				document.removeEventListener('auxclick', onAuxClickCapture, options);
			};
		}

		/* ------------------------------------------------------------------ *
		 * Styles
		 * ------------------------------------------------------------------ */

		var CSS = [
			/* --- overlay + backdrop --- */
			'.' + ID_PREFIX + '-layer{position:fixed;inset:0;z-index:1200;display:flex;align-items:flex-end;justify-content:center;pointer-events:none}',
			'.' + ID_PREFIX + '-backdrop{position:absolute;inset:0;pointer-events:auto;background:color-mix(in srgb,var(--dsw-alias-bg-base) 62%,transparent);animation:' + ID_PREFIX + '-fade .16s ease-out}',
			'.' + ID_PREFIX + '-sheet{position:relative;pointer-events:auto;box-sizing:border-box;width:100%;max-width:560px;margin:0 8px calc(8px + env(safe-area-inset-bottom,0px));padding:8px 10px 12px;border-radius:16px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 12px 32px rgba(0,0,0,.28);animation:' + ID_PREFIX + '-rise .2s cubic-bezier(.2,.8,.3,1)}',
			'@keyframes ' + ID_PREFIX + '-fade{from{opacity:0}to{opacity:1}}',
			'@keyframes ' + ID_PREFIX + '-rise{from{transform:translateY(14px);opacity:.4}to{transform:translateY(0);opacity:1}}',
			'@media (prefers-reduced-motion:reduce){.' + ID_PREFIX + '-sheet,.' + ID_PREFIX + '-backdrop{animation:none}}',

			/* --- grabber + header --- */
			'.' + ID_PREFIX + '-grab{width:36px;height:4px;border-radius:2px;background:var(--dsw-alias-border-l2);margin:2px auto 10px}',
			'.' + ID_PREFIX + '-head{display:flex;align-items:center;gap:8px;padding:0 2px 10px}',
			'.' + ID_PREFIX + '-headText{flex:1;min-width:0}',
			'.' + ID_PREFIX + '-title{font-size:15px;line-height:22px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.' + ID_PREFIX + '-meta{display:flex;align-items:center;gap:6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
			'.' + ID_PREFIX + '-badge{display:inline-flex;align-items:center;border-radius:999px;padding:1px 7px;font-size:10px;line-height:15px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
			'.' + ID_PREFIX + '-close{flex:none;width:32px;height:32px;border-radius:50%;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;cursor:pointer}',

			/* --- rows --- */
			'.' + ID_PREFIX + '-rows{display:flex;flex-direction:column;gap:2px}',
			'.' + ID_PREFIX + '-row{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:0 12px;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font-size:15px;line-height:22px;text-align:left;cursor:pointer}',
			'.' + ID_PREFIX + '-row:active{background:var(--dsw-alias-interactive-bg-hover)}',
			'.' + ID_PREFIX + '-row[disabled]{opacity:.45}',
			'.' + ID_PREFIX + '-row.is-danger{color:var(--dsw-alias-state-error-primary)}',
			'.' + ID_PREFIX + '-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.' + ID_PREFIX + '-sep{height:1px;margin:6px 4px;background:var(--dsw-alias-border-l1)}',
			'.' + ID_PREFIX + '-hint{padding:2px 4px 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',

			/* --- rename form --- */
			'.' + ID_PREFIX + '-form{display:flex;gap:8px;align-items:center;padding:2px 2px 4px}',
			'.' + ID_PREFIX + '-input{flex:1;min-width:0;min-height:44px;box-sizing:border-box;padding:0 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:16px}',
			'.' + ID_PREFIX + '-primary{flex:none;min-height:44px;padding:0 16px;border-radius:10px;border:none;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-size:15px;cursor:pointer}',
			'.' + ID_PREFIX + '-ghost{flex:none;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;cursor:pointer}',

			/* --- long-press progress cue on the pressed row --- */
			'@keyframes ' + ID_PREFIX + '-fill{from{width:0}to{width:100%}}',
			'@keyframes ' + ID_PREFIX + '-ring{from{transform:scale(.55);opacity:.75}to{transform:scale(1.55);opacity:0}}',
			'.' + ID_PREFIX + '-pressing{position:relative;overflow:hidden}',
			'.' + ID_PREFIX + '-pressing::after{content:"";position:absolute;left:0;bottom:0;height:2px;width:100%;background:var(--dsw-alias-brand-primary);animation:' + ID_PREFIX + '-fill var(--' + ID_PREFIX + '-lp,420ms) linear forwards;pointer-events:none}',
			'.' + ID_PREFIX + '-pressing::before{content:"";position:absolute;right:2px;top:50%;width:16px;height:16px;margin-top:-8px;border-radius:50%;border:2px solid var(--dsw-alias-brand-primary);animation:' + ID_PREFIX + '-ring var(--' + ID_PREFIX + '-lp,420ms) ease-out forwards;pointer-events:none}',
			'@media (prefers-reduced-motion:reduce){.' + ID_PREFIX + '-pressing::before{display:none}}',

			/* --- coarse-pointer ergonomics: keep actions reachable without hover --- */
			'@media (hover:none),(pointer:coarse){',
			'[data-row-key^="session:"] span[class*="rowActions"],[data-row-key^="workspace:"] span[class*="rowActions"]{display:inline-flex !important}',
			'[data-row-key^="session:"] span[class*="time"],[data-row-key^="workspace:"] span[class*="time"]{display:none !important}',
			'[data-row-key^="session:"] button[class*="iconButton"],[data-row-key^="workspace:"] button[class*="iconButton"]{width:26px !important;height:26px !important}',
			'[data-row-key]{min-height:44px;touch-action:pan-y;-webkit-touch-callout:none}',
			'button[class*="iconButton"]{min-width:26px;min-height:26px}',
			'textarea{font-size:16px !important}',
			'}',
		].join('\n');

		/* ------------------------------------------------------------------ *
		 * Action sheet component
		 * ------------------------------------------------------------------ */

		function useSheetState() {
			/* No useSyncExternalStore (older React, or a stripped build): fall back to
			 * a plain subscription with a manual bump rather than crashing the render. */
			if (typeof useSyncExternalStore !== 'function') {
				var bumpState = useState(0);
				var bump = bumpState[1];
				useEffect(function () {
					return sheetStore.subscribe(function () {
						bump(function (value) {
							return value + 1;
						});
					});
				}, []);
				return sheetStore.getSnapshot();
			}
			return useSyncExternalStore(sheetStore.subscribe, sheetStore.getSnapshot, sheetStore.getSnapshot);
		}

		function Row(props) {
			return h(
				'button',
				{
					type: 'button',
					className: ID_PREFIX + '-row' + (props.danger ? ' is-danger' : ''),
					disabled: props.disabled === true,
					onClick: props.onClick,
				},
				h('span', { className: ID_PREFIX + '-label' }, props.label),
			);
		}

		/* `React.Component` is part of the platform baseline, but the boundary's own
		 * definition must not be the thing that breaks module evaluation, so fall
		 * back to a minimal base when the class is absent. */
		var ComponentBase = typeof react.Component === 'function' ? react.Component : createFallbackComponent();

		function createFallbackComponent() {
			function Base(props) {
				this.props = props || {};
				this.state = {};
			}
			Base.prototype.setState = function (next) {
				this.state = Object.assign({}, this.state, next);
			};
			return Base;
		}

		/**
		 * Emergency stop for this plugin's own render tree.
		 *
		 * A throw during React render is not a boot-audit failure — the fiber is
		 * already ACTIVE by then — so an unguarded crash takes the whole renderer
		 * down instead. This boundary converts any such crash into a no-op that
		 * reports itself, which keeps the application usable.
		 */
		class SafeBoundary extends ComponentBase {
			constructor(props) {
				super(props);
				this.state = { dead: false };
			}

			static getDerivedStateFromError() {
				return { dead: true };
			}

			componentDidCatch(error) {
				try {
					console.error('[dsh-touch] ' + this.props.label + ' crashed:', error);
				} catch (ignored) {
					/* Logging must never be the thing that fails. */
				}
			}

			render() {
				if (this.state.dead) return null;
				return this.props.children === undefined ? null : this.props.children;
			}
		}

		/**
		 * The overlay occupant. It stays mounted for the plugin's whole life so the
		 * stylesheet it carries is present whenever the gesture runs, and renders
		 * the dialog itself only while the sheet is open.
		 */
		function Layer() {
			var snapshot = useSheetState();
			if (!snapshot.open) return h('style', { 'data-dsh-touch': '1' }, CSS);
			return h(
				react.Fragment,
				null,
				h('style', { 'data-dsh-touch': '1' }, CSS),
				h(SafeBoundary, { label: 'action sheet' }, h(Sheet, { snapshot: snapshot })),
			);
		}

		function Sheet(props) {
			var snapshot = props.snapshot;
			var target = snapshot.target;
			var busyState = useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var noticeState = useState('');
			var notice = noticeState[0];
			var setNotice = noticeState[1];
			var renameState = useState(null);
			var renameDraft = renameState[0];
			var setRenameDraft = renameState[1];

			var close = useCallback(function () {
				setBusy(false);
				setNotice('');
				setRenameDraft(null);
				sheetStore.close();
			}, []);

			/* Escape mirrors the host's own modal behavior. */
			useEffect(function () {
				if (!snapshot.open) return undefined;
				function onKeyDown(event) {
					if (event.key !== 'Escape') return;
					event.preventDefault();
					if (renameDraft !== null) {
						setRenameDraft(null);
						return;
					}
					close();
				}
				document.addEventListener('keydown', onKeyDown, true);
				return function () {
					document.removeEventListener('keydown', onKeyDown, true);
				};
			}, [snapshot.open, renameDraft, close]);

			/* Reset transient state once per open, or when the locale changed. */
			useEffect(function () {
				if (!snapshot.open) return;
				setBusy(false);
				setNotice('');
				setRenameDraft(null);
			}, [snapshot.open, snapshot.epoch]);

			if (!snapshot.open || target === null) return null;

			var live = target.element !== null && target.element.isConnected;
			var current = live ? readTarget(target.element) : target;
			var title = displayName(current);
			var actions = sheetActions();

			function run(operation, options) {
				var opts = options || {};
				return function () {
					if (busy) return;
					setBusy(true);
					setNotice('');
					var result;
					try {
						result = operation();
					} catch (error) {
						setBusy(false);
						setNotice(t('sheet.failed'));
						return;
					}
					Promise.resolve(result).then(function () {
						if (opts.keepOpen === true) {
							setBusy(false);
							setNotice(opts.notice || '');
							return;
						}
						close();
					}, function () {
						setBusy(false);
						setNotice(opts.errorNotice || t('sheet.failed'));
					});
				};
			}

			function startRename() {
				setRenameDraft(title);
			}

			function submitRename() {
				var next = (renameDraft || '').trim();
				if (next === '') return;
				run(actions.rename(next), { errorNotice: t('sheet.renameFailed') })();
			}

			var header = h(
				'div',
				{ className: ID_PREFIX + '-head' },
				h(
					'div',
					{ className: ID_PREFIX + '-headText' },
					h('div', { className: ID_PREFIX + '-title' }, title),
					h(
						'div',
						{ className: ID_PREFIX + '-meta' },
						h('span', null, t(current.isWorkspace ? 'sheet.workspace' : 'sheet.session')),
						current.archived ? h('span', { className: ID_PREFIX + '-badge' }, t('sheet.archived')) : null,
						!current.archived && current.pinned ? h('span', { className: ID_PREFIX + '-badge' }, t('sheet.pinned')) : null,
					),
				),
				h(
					'button',
					{
						type: 'button',
						className: ID_PREFIX + '-close',
						'aria-label': t('sheet.close'),
						onClick: close,
					},
					'\u2715',
				),
			);

			var body;
			if (renameDraft !== null) {
				body = h(
					'div',
					null,
					h('div', { className: ID_PREFIX + '-hint' }, t('sheet.renameTitle')),
					h(
						'div',
						{ className: ID_PREFIX + '-form' },
						h('input', {
							className: ID_PREFIX + '-input',
							value: renameDraft,
							autoFocus: true,
							'aria-label': t('sheet.renameTitle'),
							onChange: function (event) {
								setRenameDraft(event.target.value);
							},
							onKeyDown: function (event) {
								if (event.key === 'Enter') {
									event.preventDefault();
									submitRename();
								}
							},
						}),
						h(
							'button',
							{ type: 'button', className: ID_PREFIX + '-primary', disabled: busy, onClick: submitRename },
							t('sheet.renameConfirm'),
						),
						h(
							'button',
							{ type: 'button', className: ID_PREFIX + '-ghost', onClick: function () { setRenameDraft(null); } },
							t('sheet.renameCancel'),
						),
					),
				);
			} else if (current.isWorkspace) {
				/* A workspace header is a container, not a Session: it has no
				 * archive/pin state, and its rename and delete belong to the host's
				 * own workspace menu (which also owns the confirmation dialogs and
				 * the default-workspace rules). */
				body = h(
					'div',
					{ className: ID_PREFIX + '-rows' },
					h(Row, {
						key: 'toggle',
						label: t(current.expanded ? 'sheet.collapse' : 'sheet.expand'),
						onClick: run(actions.open),
					}),
					h(Row, {
						key: 'newSession',
						label: t('sheet.newSession'),
						onClick: run(actions.workspaceMenu('newSession'), { errorNotice: t('sheet.noNewSession') }),
					}),
					h(Row, { key: 'rename', label: t('sheet.renameWorkspace'), onClick: run(actions.workspaceMenu('rename')) }),
					h(Row, {
						key: 'delete',
						label: t('sheet.deleteWorkspace'),
						danger: true,
						onClick: run(actions.workspaceMenu('delete')),
					}),
				);
			} else {
				var rows = [];
				rows.push(h(Row, { key: 'open', label: t('sheet.open'), onClick: run(actions.open) }));
				rows.push(
					h(Row, {
						key: 'archive',
						label: t(current.archived ? 'sheet.unarchive' : 'sheet.archive'),
						onClick: run(current.archived ? actions.unarchive : actions.archive),
					}),
				);
				if (!current.archived) {
					rows.push(
						h(Row, {
							key: 'pin',
							label: t(current.pinned ? 'sheet.unpin' : 'sheet.pin'),
							onClick: run(current.pinned ? actions.unpin : actions.pin),
						}),
					);
				}
				rows.push(h(Row, { key: 'rename', label: t('sheet.rename'), onClick: startRename }));
				body = h('div', { className: ID_PREFIX + '-rows' }, rows);
			}

			return h(
				'div',
				{ className: ID_PREFIX + '-layer', role: 'presentation' },
				h('div', {
					className: ID_PREFIX + '-backdrop',
					role: 'presentation',
					onClick: close,
				}),
				h(
					'div',
					{
						className: ID_PREFIX + '-sheet',
						role: 'dialog',
						'aria-modal': 'true',
						'aria-label': t('sheet.actions'),
					},
					h('div', { className: ID_PREFIX + '-grab', 'aria-hidden': 'true' }),
					header,
					body,
					notice !== '' ? h('div', { className: ID_PREFIX + '-hint' }, notice) : null,
					h('div', { className: ID_PREFIX + '-sep', role: 'presentation' }),
					h(Row, {
						key: 'copy',
						label: notice === t('sheet.copied') ? t('sheet.copied') : t(current.isWorkspace ? 'sheet.copyName' : 'sheet.copy'),
						onClick: run(actions.copy, { keepOpen: true, notice: t('sheet.copied') }),
					}),
				),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Action implementations
		 * ------------------------------------------------------------------ */

		var services = {
			uiWorkspace: null,
			sessions: null,
		};

		/* ------------------------------------------------------------------ *
		 * Driving the host's own row menu
		 *
		 * A workspace's rename and delete are not exposed on any Client service
		 * this plugin may inject — the `workspaces` service exists, but using the
		 * host's own menu keeps the confirmation dialogs, the default-workspace
		 * rules, and the toast feedback exactly as shipped, and needs no new
		 * inject entry. So for workspace actions the sheet clicks the host's
		 * menu: open the row's "..." trigger, then click the item whose label
		 * matches.
		 * ------------------------------------------------------------------ */

		/** Label variants for a host menu item, Chinese first (this desktop is zh-CN). */
		var MENU_LABELS = {
			rename: ['重命名', '重命名工作区', 'Rename', 'Rename workspace'],
			delete: ['删除工作区', 'Delete workspace'],
			newSession: ['新会话', '新建会话', 'New session'],
		};

		function normalizeLabel(text) {
			return String(text || '')
				.replace(/\s+/g, ' ')
				.replace(/…/g, '')
				.trim()
				.toLowerCase();
		}

		function menuItemNodes() {
			try {
				return Array.prototype.slice.call(document.querySelectorAll('[role="menuitem"]'));
			} catch (error) {
				return [];
			}
		}

		/** The host menu row whose text matches one of `variants`. */
		function findMenuItem(variants) {
			var wanted = variants.map(normalizeLabel);
			var items = menuItemNodes();
			for (var item of items) {
				var text = normalizeLabel(item.textContent);
				for (var want of wanted) {
					if (text === want || text.indexOf(want) !== -1) return item;
				}
			}
			return null;
		}

		/**
		 * Click one item in the pressed row's own menu.
		 *
		 * `waitForMenu` matters because the menu is rendered by React after the
		 * trigger click, so the item does not exist on the same tick. A menu that
		 * never appears resolves to `null` and the sheet reports it.
		 */
		function clickRowMenuItem(row, variants, waitForMenu) {
			var cell = actionsCell(row);
			if (cell === null) return Promise.resolve(null);
			var trigger = cell.querySelector('button');
			if (trigger === null) return Promise.resolve(null);
			trigger.click();
			if (waitForMenu !== true) {
				var immediate = findMenuItem(variants);
				if (immediate !== null) immediate.click();
				return Promise.resolve(immediate);
			}
			return new Promise(function (resolve) {
				var attempts = 0;
				var step2 = function () {
					var item = findMenuItem(variants);
					if (item !== null) {
						item.click();
						resolve(item);
						return;
					}
					attempts += 1;
					if (attempts >= 24) {
						resolve(null);
						return;
					}
					setTimeout(step2, 25);
				};
				setTimeout(step2, 25);
			});
		}

		/**
		 * Click the workspace row's "new session" button.
		 *
		 * The actions cell holds the "..." menu trigger first and the new-session
		 * button second (see the shipped `workspaceMenuItems` markup), so the
		 * second button is the target. Its `aria-label` is the localized
		 * `actions.newSession.aria`, matched as a fallback in case the order
		 * ever changes.
		 */
		function clickRowActionButton(row) {
			var cell = actionsCell(row);
			if (cell === null) return Promise.resolve(false);
			var buttons = Array.prototype.slice.call(cell.querySelectorAll('button'));
			if (buttons.length === 0) return Promise.resolve(false);
			var target = buttons.length > 1 ? buttons[1] : null;
			if (target === null) {
				for (var button of buttons) {
					var aria = button.getAttribute('aria-label') || '';
					if (MENU_LABELS.newSession.some(function (label) { return aria.indexOf(label) !== -1; })) {
						target = button;
						break;
					}
				}
			}
			if (target === null) return Promise.resolve(false);
			target.click();
			return Promise.resolve(true);
		}

		function workspaceRowOf(target) {
			var row = target === null ? null : target.element;
			if (row === null || !row.isConnected) return null;
			return row;
		}

		function sheetActions() {
			return {
				open: function () {
					var target = sheetStore.getSnapshot().target;
					if (target === null) return undefined;
					if (target.isWorkspace) {
						/* A workspace header has no "open"; expanding it in place is
						 * the closest meaningful action, so reuse the row's own click. */
						var row = workspaceRowOf(target);
						if (row !== null) row.click();
						return undefined;
					}
					if (services.uiWorkspace === null) return undefined;
					services.uiWorkspace.openSession(target.id);
					return undefined;
				},
				archive: function () {
					var target = sheetStore.getSnapshot().target;
					if (target === null || services.uiWorkspace === null) return undefined;
					return services.uiWorkspace.archiveSession(target.id);
				},
				unarchive: function () {
					var target = sheetStore.getSnapshot().target;
					if (target === null || services.uiWorkspace === null) return undefined;
					return services.uiWorkspace.unarchiveSession(target.id);
				},
				pin: function () {
					var target = sheetStore.getSnapshot().target;
					if (target === null) return undefined;
					var workspace = services.uiWorkspace;
					if (workspace === null || typeof workspace.pinSession !== 'function') return undefined;
					return workspace.pinSession(target.id);
				},
				unpin: function () {
					var target = sheetStore.getSnapshot().target;
					if (target === null) return undefined;
					var workspace = services.uiWorkspace;
					if (workspace === null || typeof workspace.unpinSession !== 'function') return undefined;
					return workspace.unpinSession(target.id);
				},
				rename: function (next) {
					return function () {
						var target = sheetStore.getSnapshot().target;
						if (target === null || services.sessions === null) return undefined;
						return services.sessions.using(target.id, { source: 'workspaceOperation' }, function (reference) {
							return reference.binding.session.rename(next);
						});
					};
				},
				/** Workspace rename/delete/new-session all ride the host's row menu. */
				workspaceMenu: function (action) {
					return function () {
						var target = sheetStore.getSnapshot().target;
						if (target === null) return undefined;
						var row = workspaceRowOf(target);
						if (row === null) return Promise.reject(new Error('workspace row is gone'));
						if (action === 'newSession') {
							return clickRowActionButton(row).then(function (clicked) {
								if (!clicked) throw new Error('no "new session" button on this workspace row');
								return undefined;
							});
						}
						return clickRowMenuItem(row, MENU_LABELS[action] || [], true).then(function (item) {
							if (item === null) throw new Error('menu item not found: ' + action);
							return undefined;
						});
					};
				},
				copy: function () {
					var target = sheetStore.getSnapshot().target;
					var text = displayName(target);
					if (text === '') return undefined;
					try {
						if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
							return navigator.clipboard.writeText(text);
						}
					} catch (error) {
						/* Fall through to the legacy path. */
					}
					try {
						var area = document.createElement('textarea');
						area.value = text;
						area.setAttribute('readonly', '');
						area.style.position = 'fixed';
						area.style.opacity = '0';
						document.body.appendChild(area);
						area.select();
						document.execCommand('copy');
						document.body.removeChild(area);
					} catch (error) {
						/* Nothing else to try. */
					}
					return undefined;
				},
			};
		}

		/* ------------------------------------------------------------------ *
		 * Settings section
		 * ------------------------------------------------------------------ */

		function SettingsForm() {
			var versionState = useState(0);
			var bump = versionState[1];
			var config = settings();

			function update(patch) {
				saveSettings(patch);
				bump(function (value) {
					return value + 1;
				});
			}

			return h(
				'div',
				{ className: ID_PREFIX + '-settings' },
				h('style', { 'data-dsh-touch-settings': '1' }, SETTINGS_CSS),
				h('p', { className: ID_PREFIX + '-hint' }, t('settings.description')),
				h(
					'label',
					{ className: ID_PREFIX + '-setting' },
					h('span', { className: ID_PREFIX + '-settingLabel' }, t('settings.longPress'), ' · ', config.longPressMs, 'ms'),
					h('input', {
						type: 'range',
						min: 200,
						max: 1200,
						step: 20,
						value: config.longPressMs,
						onChange: function (event) {
							update({ longPressMs: clampNumber(event.target.value, 200, 1200, CONFIG.longPressMs) });
						},
					}),
					h('span', { className: ID_PREFIX + '-hint' }, t('settings.longPressHint')),
				),
				h(
					'label',
					{ className: ID_PREFIX + '-setting' },
					h(
						'span',
						{ className: ID_PREFIX + '-settingLabel' },
						h('input', {
							type: 'checkbox',
							checked: config.haptics,
							onChange: function (event) {
								update({ haptics: event.target.checked });
							},
						}),
						t('settings.haptics'),
					),
					h('span', { className: ID_PREFIX + '-hint' }, t('settings.hapticsHint')),
				),
			);
		}

		/* ------------------------------------------------------------------ *
		 * Plugin
		 * ------------------------------------------------------------------ */

		/**
		 * Never let this plugin's activation fail.
		 *
		 * The Web boot audit treats a FAILED plugin fiber as a boot failure, so an
		 * exception anywhere below would blank the whole application. Each part is
		 * therefore isolated: a broken part disables only itself and reports to the
		 * console, while the rest of the plugin keeps working.
		 */
		function step(label, run) {
			try {
				status.steps += 1;
				return run();
			} catch (error) {
				status.errors.push(label + ': ' + (error && error.message ? error.message : String(error)));
				try {
					console.error('[dsh-touch] ' + label + ' failed:', error);
				} catch (ignored) {
					/* Logging must never be the thing that fails. */
				}
				return undefined;
			}
		}

		function apply(ctx) {
			step('locale bridge', function () {
				localeService = createTranslator(ctx);
			});
			step('services', function () {
				services.uiWorkspace = ctx.uiWorkspace || null;
				services.sessions = ctx.sessions || null;
			});

			step('locale subscription', function () {
				observeLocale(ctx);
			});

			step('long-press gesture', function () {
				ctx.effect(attachLongPress, 'dsh-touch: long-press gesture');
			});

			/* The occupant itself carries the stylesheet, so nothing here writes head. */
			step('action sheet slot', function () {
				ctx.slots.inject('shell.overlay', function () {
					return ctx.slots.register(
						{
							name: 'shell.overlay',
							id: 'dsh-touch-sheet',
							order: 60,
						},
						Layer,
					);
				});
			});

			step('diagnostics', function () {
				status.activated = true;
				/* Manual trigger: `__dshTouch.open()` raises the sheet for the
				 * focused or first session row, which separates a gesture problem
				 * from a sheet problem. `describe()` reports what a row reads as
				 * without raising anything, which is how the workspace/session
				 * branch selection is checked. */
				window.__dshTouch = {
					status: status,
					settings: settings,
					rows: function () {
						return Array.prototype.slice.call(document.querySelectorAll(GESTURE_SELECTOR)).filter(isVisible);
					},
					describe: function (index) {
						var row = this.rows()[index === undefined ? 0 : index] || null;
						var target = readTarget(row);
						if (target === null) return null;
						return {
							kind: target.kind,
							isWorkspace: target.isWorkspace,
							id: target.id,
							title: target.title,
							displayName: displayName(target),
							archived: target.archived,
							pinned: target.pinned,
							expanded: target.expanded,
							hasActionsCell: row === null ? false : actionsCell(row) !== null,
						};
					},
					open: function (index) {
						var row = this.rows()[index === undefined ? 0 : index] || null;
						if (row === null) return 'no visible row found';
						return fire(row, settings()) ? 'opened' : 'row had no target';
					},
					close: function () {
						sheetStore.close();
					},
				};
			});
		}

		function createTranslator(ctx) {
			var bind = ctx.locale && typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : null;
			if (bind === null) return null;
			return {
				t: function (key, params) {
					return bind(key, params);
				},
				getSnapshot: function () {
					return ctx.locale.getSnapshot();
				},
				subscribe: function (listener) {
					return ctx.locale.subscribe(listener);
				},
			};
		}

		/**
		 * The Client locale service owns the active locale. Four visible strings
		 * cannot be reached through it: the slot's own `label` thunk (a
		 * registration option, not a render prop) and the action row labels,
		 * which live in a store snapshot rather than in a render. Both are
		 * re-derived here, and only when the locale actually changes.
		 */
		function observeLocale(ctx) {
			var locale = ctx.locale;
			if (!locale || typeof locale.subscribe !== 'function') return;
			ctx.effect(function () {
				var last = currentLocaleKey(locale);
				return locale.subscribe(function () {
					var next = currentLocaleKey(locale);
					if (next === last) return;
					last = next;
					sheetStore.refresh();
				});
			}, 'dsh-touch: locale bridge');
		}

		function currentLocaleKey(locale) {
			try {
				var snapshot = locale.getSnapshot();
				if (snapshot && typeof snapshot.locale === 'string') return snapshot.locale;
				if (snapshot && typeof snapshot.id === 'string') return snapshot.id;
			} catch (error) {
				/* Fall through to the unknown marker. */
			}
			return '';
		}

		var SETTINGS_CSS = [
			'.' + ID_PREFIX + '-settings{display:flex;flex-direction:column;gap:12px}',
			'.' + ID_PREFIX + '-setting{display:flex;flex-direction:column;gap:6px}',
			'.' + ID_PREFIX + '-settingLabel{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--dsw-alias-label-primary)}',
		].join('\n');

		function registerSettings(ctx) {
			if (!ctx.slots || typeof ctx.slots.inject !== 'function') return;
			ctx.slots.inject('settings.section', function () {
				return ctx.slots.register(
					{
						name: 'settings.section',
						id: 'dsh-touch',
						order: 900,
						label: function () {
							return t('settings.title');
						},
					},
					function SettingsSection() {
						return h(SafeBoundary, { label: 'settings section' }, h(SettingsForm));
					},
				);
			});
		}

		exports.name = '@local/dsh-touch';
		/*
		 * Every `ctx.<name>` read below MUST be listed here. The Cordis Client
		 * context throws `cannot get property "<name>" without inject` for a
		 * service a plugin did not declare, and that throw fails the plugin's
		 * fiber — which the Web boot audit then treats as a fatal boot failure.
		 *
		 * All four are long-lived Client services (see the Client Service
		 * catalog): `slots` and `locale` are always present, `uiWorkspace` owns
		 * session archive/unarchive, and `sessions` carries the rename binding.
		 * Optional behaviour, such as pin, is probed on the service at call time
		 * instead of being declared.
		 */
		exports.inject = ['slots', 'locale', 'uiWorkspace', 'sessions'];
		exports.apply = function (ctx) {
			/* Belt and braces: `apply` must never throw, whatever a part does. */
			try {
				apply(ctx);
				step('settings section', function () {
					registerSettings(ctx);
				});
			} catch (error) {
				try {
					console.error('[dsh-touch] activation failed:', error);
				} catch (ignored) {
					/* Nothing left to do. */
				}
			}
		};

		return module.exports;
	},
});
