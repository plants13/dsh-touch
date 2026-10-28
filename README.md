# dsh-touch

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **触屏适配插件**:长按会话行或工作区行,在底部弹出操作面板。

桌面端的会话列表、工作区列表原本都依赖鼠标悬停来露出操作按钮(`...` 菜单、归档、置顶)。触屏上既没有 hover,长按也只会触发文本选择或系统菜单。这个插件把「长按」变成一等交互,并按 **行类型** 给出不同的操作集。

许可证:[MPL-2.0](LICENSE)。

---

## 功能

### 长按会话行 → 会话操作

| 操作 | 说明 |
|---|---|
| 打开 | 打开该会话 |
| 归档 / 取消归档 | 按当前状态自动切换 |
| 置顶 / 取消置顶 | 已归档的会话不提供置顶 |
| 重命名 | 面板内直接输入,Enter 保存、Esc 取消 |
| 复制标题 | 剪贴板 |

### 长按工作区行 → 工作区操作

| 操作 | 说明 |
|---|---|
| 展开 / 收起 | 工作区头部本身没有「打开」语义,点击行就是切换展开 |
| 在此新建会话 | 复用该行自己的「+」按钮 |
| 重命名工作区 | 走宿主自己的菜单 |
| 删除工作区 | 走宿主自己的菜单,红色显示;`default-workspace` 不可删由宿主规则保证 |
| 复制名称 | 剪贴板 |

两种行**不会互相串味**:工作区面板永远不会出现「归档/置顶」,会话面板永远不会出现「重命名工作区/删除工作区」。这一点有自动化断言守着(见下方[验证](#验证))。

### 触屏命中区

只在 `(hover:none)` 或 `(pointer:coarse)` 下生效,不影响鼠标桌面:

- 行操作按钮常显(原本只在 hover 时出现,触屏根本摸不到)
- 行最小高度 44px,图标按钮 26px
- 输入框 16px(避免 iOS 聚焦缩放)
- `touch-action: pan-y` + 关闭长按文本选择

### 设置

`设置 → 触屏`:

- **长按延迟**:200–1200ms,默认 420ms
- **触感反馈**:真实触摸按压时轻微震动(设备支持时)

设置存 `localStorage` 的 `dsh-touch.settings.v1`,不写宿主配置。

---

## 安装

前置:已安装 DeepSeek Harness(桌面版或 Web 版)。

```powershell
git clone https://github.com/plants13/dsh-touch.git
```

然后用 Harness 的 `plugin_manager` 安装本地包目录(目录路径指向 `plugin/dsh-touch`,那里才是包本体):

```
plugin_manager  action: install_bundle
                target: <克隆路径>\plugin\dsh-touch
```

安装会由 Plugin Manager 自动完成这些事,不要手动改 profile:

- 把包加入 profile 的 `package.json` 依赖
- 把 `@local/dsh-touch` 加进 `dsh.profile.bundles`
- 应用 `plugin/dsh-touch/cordis.patch.yml`

装好后**重载页面或重启 Harness**。客户端模块图在启动时快照,新插件需要一次重新加载。

不想用了:`plugin_manager` 的 `remove_bundle`,目标 `@local/dsh-touch`。

---

## 仓库结构

```
plugin/dsh-touch/          插件本体(可安装包)
├── package.json           bundle 清单 + dsh.client 声明
├── cordis.patch.yml       插入插件行
├── index.js               Host 半边(空实现)
├── client.js              页面半边:手势 + 面板 + 触屏 CSS
├── icon.svg               插件卡片图标
└── locale/{en,zh-CN}.json 插件卡片文案

tools/                     验证与排障脚本
├── verify.ps1             一键跑全部检查
├── check-inject.js        静态检查 ctx 服务声明
├── apply_harness.js       真实执行 apply() 并渲染组件
├── branch_test.js         工作区/会话两种面板的分支断言
├── diagnose-touch.js      浏览器 Console 诊断脚本
├── disable-bundle.ps1     启动崩溃时的凭外恢复
├── asar_extract.py        Electron asar 解包(研究宿主 API 用)
├── css_rules.py           从产物 CSS 里抽取规则
└── count_identifiers.js   死代码统计
```

`dsh-touch` 这个名字带 `@local/` 前缀是有意的:它不发布到 npm,由用户本地安装。

---

## 实现要点

### Host 半边是空的

全部逻辑在页面侧(`client.js`)。Host 只需有一个可被 Loader 解析的入口,所以 `index.js` 只导出空的 `apply()`。

### 为什么不复用宿主那个 `...` 菜单

会话行的 `...` 菜单是 `closeOnPointerLeave` + 200ms 延迟关闭的。触屏上手指一抬就会收到 `pointerleave`,菜单会自己关掉,没法点。而且它是 `dsh-client-ui-primitives` 里的私有组件,插件不允许 `require` 宿主 Client 包。

所以插件自己做面板:

- **会话操作**直接调 Client 服务(`ctx.uiWorkspace.archiveSession()` 等),一步到位。
- **工作区操作**点开宿主自己的行菜单,再按文案匹配点中菜单项。这样保留了宿主的确认弹窗、`default-workspace` 规则和 toast 反馈,并且不需要额外声明服务。

### 手势怎么挂上去

宿主的会话/工作区行**没有为手势预留 slot**,所以只能在 `document` 上捕获 `pointerdown`。插件只观察事件,不改写宿主 DOM:面板通过 `shell.overlay` 这个 slot 渲染。

行身份来自宿主自己带的语义锚点:

| 行 | 锚点 |
|---|---|
| 会话 | `[data-row-key="session:<id>"]` |
| 工作区 | `[data-row-key="workspace:<key>"]` |

三种触发路径,互为兜底:

1. `pointerdown` + 420ms 定时器(移动超过 12px 视为滚动并取消)
2. `pointercancel` 后延迟 250ms 清理,给下一条留时间
3. `contextmenu`(Chromium 对「手指按住行」会自己发这个,绕开定时器被取消的情况)

鼠标按住也会触发 —— 这样在桌面上也能测。

### 一个容易踩死的坑:`exports.inject`

Cordis 的客户端上下文有注入闸门。插件没在 `exports.inject` 里声明的服务,**读一下就直接抛**:

```
Error: cannot get property "locale" without inject
```

这个异常会让插件 fiber 进入 `FAILED`,而 Web boot 审计把「fiber 不在 active」当成**致命错误**,直接把整个应用 boot 掉:

```
Error: web boot: 1 entry did not activate
@local/dsh-touch: failed
```

表现就是白屏。所以这个插件声明了它实际读取的全部四个服务:

```js
exports.inject = ['slots', 'locale', 'uiWorkspace', 'sessions'];
```

这条规则反直觉的地方在于:**少声明比多声明更致命**。多声明一个不存在的服务只会让插件停在 `pending`;少声明一个则会在第一次读取时抛异常。

### 不让插件拖垮启动

即使如此,插件仍然做了三层兜底,因为插件崩了不该让整个应用起不来:

1. `apply()` 里每块用 `step()` 隔离,坏一块只禁用那一块
2. 每个注册进去的组件都套 `SafeBoundary`(React 错误边界)——渲染期崩溃会降级成空渲染 + 一行 Console 日志
3. `useSyncExternalStore` 不存在时退回 `useState` + 订阅

---

## 验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify.ps1
```

四步,全过才建议安装:

```
PASS  1. syntax (node --check)                  语法
PASS  2. inject contract (check-inject)         每个 ctx 读取都已声明,且声明都被用到
PASS  3. activation + render (apply_harness)    真实执行 apply() 并渲染注册的组件
PASS  4. workspace vs session branches          两种面板不串味
```

其中 `apply_harness.js` 的假上下文是个 **Proxy**,会像真实 Cordis 一样对未声明的服务抛 `cannot get property ... without inject` —— 这是刻意的,否则这个台子会给出「看起来干净」的假通过。

### 浏览器内诊断

装好后如果在桌面窗口按 `F12` 打开 DevTools,Console 里有:

```js
__dshTouch.status        // 激活状态、按了几次、开了几次、最后一次指针类型、被吞掉的错误
__dshTouch.rows()        // 当前可见的手势目标
__dshTouch.describe(0)   // 第 0 行被识别成 workspace 还是 session
__dshTouch.open(0)       // 强制为第 0 行弹出面板
```

也可以直接粘 [`tools/diagnose-touch.js`](tools/diagnose-touch.js),它会报行锚点匹配情况、媒体查询结果,并派发一次真实 `pointerdown` 验证整条链路。

### 启动崩溃的恢复

如果某个版本装了之后白屏、进不了设置(装插件这一步本身没问题、但客户端 boot 失败),在 **Harness 关闭** 状态下跑:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\disable-bundle.ps1 `
  -Profile desktop -Bundle '@local/dsh-touch'
```

它只重写 profile `package.json` 里的 `dsh.profile.bundles` 数组,其余字段和别的 bundle 原样保留,并写一个带时间戳的备份。

---

## 已知限制

- **依赖宿主的行标记**。`data-row-key` 前缀和 `archived` / `pinIndicator` / `rowActions` / `projectText` 这些类名子串是从当前版本的产物里读出来的。DSH 以后改命名的话,识别会失效;手势本身还在,但状态判断可能不准。
- **工作区菜单靠文案匹配**。中英文各准备了一份(`重命名` / `Rename`、`删除工作区` / `Delete workspace`)。界面语言既不是中文也不是英文时,工作区的重命名/删除会匹配不到,面板会提示失败而不是静默。
- **没有在真机触屏上验证过**。开发与验证都在桌面环境完成,长按手势、命中区尺寸只经过鼠标与合成 `pointerdown` 测试。
- **只覆盖会话行与工作区行**。消息、工具卡片等区域的长按没有处理。

欢迎提 issue 补充真机结果。

---

## 许可证

[Mozilla Public License 2.0](LICENSE)。

简单说:可以自由使用、修改、商用;修改过的**本插件源文件**需要以同样许可证公开;把它和其他代码组合成一个更大的作品时,那个作品不受此限制。
