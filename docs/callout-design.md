# Callout 编辑器设计

状态：已实现（2026-11-22 已还原可调大小的双栏实时预览编辑器并优化类型选择、无闪白双缓冲与原生编辑器辅助）。验证范围见文末。

## 范围

callout 是每一行都要带 `>` 的引用块，手工修改和嵌套很繁琐。本功能提供带实时预览的可视化双栏编辑器、编辑器内类型补全与多行智能粘贴、向正文或普通引用块的转换，并检查 callout 在 GitHub 上能否显示为 alert。

入口：

- 命令 **Insert callout**：在光标处插入新 callout；有选区时包裹所选的整行。空 callout 插入后会停在正文第一行继续输入。
- 命令 **Edit callout**：光标位于 callout 内时可用，编辑最内层的 callout。
- 在编辑器内输入 `> [!` 后，原生 `EditorSuggest` 按不区分大小写的查询列出类型。输入 `> [!tip` 并接受 `TIP` 会得到 `> [!TIP]`。GitHub 笔记优先显示 5 个 alert。
- 编辑器多行智能粘贴（`workspace.on("editor-paste")`）：在 callout 正文内粘贴多行纯文本时自动补齐所属 `indent` 与 `depth` 的 `>` 前缀，保留空行标记、代码块与嵌套引用，可通过单步撤销撤回。
- 编辑器底部的 **Convert to text** 和 **Convert to blockquote** 按钮；两种转换也有命令 **Convert callout to text** 和 **Convert callout to blockquote**。
- 命令 **Check callouts for GitHub**：列出整篇笔记中每个 callout 在 GitHub 上的问题，并可跳转到对应行。
- **Callouts on GitHub** 报告与 Mermaid 检查共用居中布局。顶部统计 alert 与普通引用的数量，每项默认一行，列出笔记行号、callout 表头和渲染结果。只有附带解释的条目显示 **Details** 和条数，包括可以显示为 alert 但有语法或配色差异的条目。详情独立展开，长列表在摘要下方滚动，窄窗口允许操作按钮换行。**Jump** 在编辑器中定位光标，在阅读视图中滚动到相应的 callout。
- 编辑器右键菜单：光标在 callout 内时提供编辑和两种转换；有选区时提供 **Wrap in callout**。
- 阅读视图和 Live Preview 中，悬停 callout 时出现 **Edit callout** 按钮。Live Preview 中它位于原生 **Edit this block** 旁边。
- 状态栏：笔记的 `github` 属性为 `true`，或位于设置的 **GitHub folders** 中时，显示 GitHub 不会渲染成 alert 的 callout 个数。
- 阅读视图的命令与状态栏读取已保存的笔记，编辑器检查当前缓冲区。跳转前重新核对笔记与内容，检测到其他窗格或同步修改后提示重新检查。未加入 GitHub 文件夹的笔记也可通过命令面板检查。
- **GitHub folders** 使用 Obsidian 原生补全列表，按光标所在的逗号分段匹配当前库的文件夹路径。选择时只替换该段，并立即刷新笔记的状态栏。已填入其他位置的目录从候选中排除。仍可手输尚未建立的路径，含逗号的目录受现有分隔格式限制。

## 文本规则

- **识别。**
  - 表头的格式是 `[!type|metadata]fold title`，前面可以有缩进和多层 `>`。
  - callout 包括所有带有这一层标记的行，以及按 CommonMark 规则懒续行（lazy continuation）的行。
  - 懒续行只能接在段落文字之后。跟在空的 `>` 行、标题、分隔线、`$$` 或代码块之后的行，不算懒续行；本身是列表项、标题、代码围栏或 `>` 开头的行，也不算。
  - frontmatter 和代码块中的内容不识别为 callout。
- **类型拼写。** 插入 callout、包裹选区、接受行内补全或在弹窗中选定类型时，生成的标记使用大写。内置类型、别名和自定义类型遵循同一规则。对已有的 `[!tip]` 主动重选 `TIP` 后，保存为 `[!TIP]`。仅修改标题、折叠、metadata 或正文时保留原标记的拼写。手写小写标记也可正常使用。如果某个 Unicode 名称转成大写后会指向另一个 Obsidian 类型，则保留该名称的原拼写，例如 `straße`。
- **只改表头时，仅替换 `[from, headerTo]` 第一行，正文按原字节完全保留。** 改了正文（例如点击 **Make GitHub-compatible** 将标题移入正文）时，按规范标记 `> ` 重写整个 callout。没有任何改动时不写回。
- **包裹。** 选中的行放在它们共同的缩进处（例如列表项内），每行加一层 `> `，空行写成 `>`。前后不是空行时各补一个空行，否则相邻的文字会因懒续行并入 callout，或与相邻的引用块合并。
- **转成正文。**
  - 去掉表头，每行只去掉这一层标记。内层的 callout 随之上升一层；嵌套在外层 callout 中时，外层的标记保留。
  - 标题变成粗体首行，后面跟一个空行。
- **转成引用块。** 只去掉 callout 标记，标题变成粗体首行。
- **多行粘贴。** 仅接管未被前置监听器 `preventDefault()`、不含附件文件的多行纯文本粘贴；若在行首粘贴且所有行已带有该 callout 的 `>` 前缀则保持原样避免重复前缀。

## 类型外观

**Callouts → Type appearance** 按小写类型名保存可选的 Lucide 图标和颜色。类型查找、过滤和外观设置均使用小写匹配，因此给 `research` 设定的图标和颜色同样适用于 `[!RESEARCH]`。颜色沿用文件图标的八个主题预设，或使用固定的十六进制颜色。图标与颜色可单独恢复主题默认值。自定义类型也参与补全和类型选择。Code background 使用同一颜色变量，因此可自动响应修改。

保存或转换等待写入结果，源文本发生冲突时保留模态框草稿。粘贴同时包含 HTML、文件或其他富文本格式时交由 Obsidian 处理。每次预览更新均使过期的异步渲染失效，即使用户已返回原来的标题。

## 代码配色

**Callouts → Code background** 默认开启，沿用 `calloutCode` 设置，同时处理阅读视图和 Live Preview 中已渲染 callout 的行内代码与代码块。代码背景使用所在 callout 的 `--callout-color` 和 `--obsidian-patch-callout-code-tint`（默认 12%）混合透明色，嵌套 callout 使用自己的颜色。代码块只在 `pre` 上设置 `--code-background`，不改语法高亮 token 的颜色、字体或布局，不给 `pre > code` 重复叠加底色。标题内的行内代码仍跟随标题文字颜色；关闭开关恢复主题背景，callout 外的代码不受影响。

此前仅对 `:not(pre) > code` 设置背景，并明确排除代码块；2026-11-17 按用户要求扩展到代码块。源码模式以及 Live Preview 中正在编辑的 callout 源码不属于此渲染规则。

## GitHub 规则

2026-11-11 用 `gh api markdown`（gfm 模式）实测了 27 种写法。注意 `markdown` 模式完全不渲染 alert。

| 能显示为 alert | 退化为普通引用块 |
|---|---|
| 类型是 NOTE、TIP、IMPORTANT、WARNING、CAUTION 之一，不分大小写 | 其他类型 |
| 标记单独占第一行，行尾可以有空格 | 标记后带标题、折叠符号 `+`/`-`，或 `\|metadata` |
| `>` 后不加空格、懒续行、标记后跟空的 `>` 行 | 只有标记、没有正文 |
| 正文中有代码块、公式、粗体行 | 位于列表项或引用块内；`[! NOTE]` 中间带空格 |

- 嵌套在 alert 内的 alert，外层正常显示，内层退化为引用块，`[!TIP]` 按字面文字显示。
- 正文中的 `[[链接]]` 按字面文字显示，alert 本身不受影响。
- 问题分三级：
  - error：GitHub 显示为普通引用块。
  - warning：alert 能显示，但其中部分内容不会渲染。
  - info：显示上有差异。Obsidian 把 caution 画成 warning 的橙色，GitHub 是红色。
- **Make GitHub-compatible** 的处理：
  - 类型映射到最接近的 alert，例如 info、abstract → NOTE，danger → CAUTION，自定义类型 → NOTE。
  - 标题移到正文第一行，写成粗体（实测能正常渲染）。
  - 去掉折叠符号和 metadata。
  - callout 所在的位置（列表或引用块内）无法在编辑器里修改，只给出提示。
- 库里 562 个 callout 中只有 24 个符合 GitHub 规则，全局提示会到处报警，所以状态栏计数只对标记过的笔记生效。

## 模块

```text
src/features/
├── callout.ts              命令、编辑器菜单、EditorSuggest、智能粘贴、两种视图按钮、写回、状态栏
└── callout/
    ├── model.ts            表头解析、范围识别、包裹与拆出、粘贴格式化、GitHub 规则（纯函数）
    ├── types.ts            popout 安全的类型探测、外观分组与过滤（纯函数）
    ├── type-suggest.ts     > [! 行内类型补全
    ├── folder-suggest.ts   GitHub folders 路径补全
    └── editor.ts           可调大小的双栏实时预览编辑弹窗、GitHub 报告弹窗
```

## 决策

- **正文编辑与实时预览保留在可调双栏弹窗，并补齐原生编辑入口优化。** 2026-11-22 将此前移除的双栏 `<textarea>` + 预览恢复为默认流程以保留编辑时的所见即所得，同时保留原生编辑器内 `> [!` 补全与多行智能粘贴；预览使用页内不可见双缓冲（`obsidian-patch-callout-preview-buffer`）+ 递增序号与每次独立的子 `Component`，解决清空闪白、异步竞态与子组件泄漏问题，并保留滚动位置。
- **类型来自已加载的样式表并按外观自动归组。** 扫描 `.callout[data-callout="…"]` 选择器（使用跨窗口鸭子类型而非 `instanceof CSSStyleRule` 以兼容 popout 窗口），并用隐藏探针元素读取 `--callout-icon` 和 `--callout-color`。默认将 27 个内置类型按 `(icon, color)` 视觉签名聚合为 13 组（主题自定义样式的别名自动独立成组），选中后在下方展示该组全部别名以便单点切换。GitHub 标记笔记顶部额外展示 5 个 GitHub Alert。过滤框支持直搜全部别名、创建自定义类型并拦截 `]`/`|` 等非法字符。
  - Obsidian 1.14+ 给出的颜色是十六进制值，旧版本和部分主题是 `r, g, b` 三元组，代码统一转成 CSS 颜色。
  - 色块的浅色背景用 `color-mix`。
- **写回前核对源码，仅改表头时只写第一行。** callout 源码与打开时不一致时只提示重新打开，不覆盖并发修改。各入口的写回方式：
  - 阅读视图按 section 行号在 `vault.process` 中逐行核对内容，识别 CRLF、LF 和 CR。仅改表头时替换该行文字，保留其行尾及其余全文的原始字节。替换整个 callout 时，新增行使用表头处的换行符，替换范围外的换行符保持原样。
  - Live Preview：用 CodeMirror 事务仅替换 `[from, headerTo]` 或 `[from, to]`。
  - 命令：用 `Editor.replaceRange` 仅替换 `[from, headerTo]` 或 `[from, to]`。
- **布局与可调整大小。** 沿用原有双栏布局与 `src/ui/resizable-modal.ts`（storage key `obsidian-patch-callout-editor-size`）：默认 `min(960px, 94vw)`，类型、标题、折叠、metadata 横跨顶部，正文与预览左右等高并排并在 `< 640px` 时堆叠；按钮固定底部，右下角把手按两倍位移调尺寸并记住库尺寸，双击恢复默认。
- **空标题的占位文字**是 Obsidian 会显示的名称：类型转小写，连字符换成空格，首字母大写。例如 `NOTE` 显示为 Note，`my-type` 显示为 My type，在 1.15.0 的阅读视图中实测。

## 宿主依赖

- 阅读视图：使用公开的 markdown post processor 和 `getSectionInfo`，只处理以 callout 开头的 section。
- Live Preview：依赖 `.cm-callout > .embed-actions` DOM。容器不存在时不加按钮，命令仍然可用。按钮由挂在 `contentDOM` 上的 mouseover 监听按需添加，与 HTML 表格的做法相同。
- 编辑器 API：`editorInfoField` 用于取得 Live Preview 中笔记的路径；`EditorSuggest` 与 `workspace.on("editor-paste")` 均为公开 API。
- **弹窗**：依赖 `.modal` 为纵向 flex 并在 `.modal-container` 中居中；双栏编辑器使用 `min(960px, 94vw)`（及 `src/ui/resizable-modal.ts` 记忆尺寸）与 `.modal-button-container` 固定底栏。

## 验证

2026-11-22，Linux / Obsidian 1.15.1 默认主题，还原可调大小的双栏实时预览 Callout 编辑器并整合类型优化与无闪白双缓冲（`min(960px, 94vw)` + `obsidian-patch-callout-editor-size` 拖拽缩放/双击复原、13 组外观聚合 + 过滤/别名条/自定义类型、`github: true` 置顶 GitHub alerts、页内双缓冲 + 每代独立 `Component` 防闪白与泄漏、`> [!` `EditorSuggest` 补全、多行 `editor-paste` 自动补前缀、仅改表头首行 `[from, headerTo]` 写回）：`npm test` 145 项单元测试通过，`npm run build`、`npm run check:release`、`npm run docs:build` 与 `npm run docs:check`（21 个 HTML 页面、853 条链接与资源）通过；`node scripts/test-callout.mjs /home/yaroxy/obsidian-vaults/dev-vault`（71 项检查）与 `node scripts/test-table.mjs /home/yaroxy/obsidian-vaults/dev-vault`（30 项检查）全部通过（0 跳过），并人工检查了 `callout-modal.png` 与 `callout-modal-github.png` 截图布局；测试结束后插件设置、编辑器尺寸、活跃标签与后台节流均已恢复。未验证移动端、popout 窗口、第三方主题及多系统桌面平台，本轮亦未重跑 Banner / Icons / Mermaid / Navigation 集成套件。

2026-11-17，macOS / Obsidian 1.15.1 默认主题，代码背景扩展：生产构建通过；在 dev-vault 使用临时定向检查先复现旧版代码块保持灰色，再验证修改后的 43 项断言通过，覆盖浅色／深色、阅读视图／Live Preview、warning 内嵌 tip、带语法高亮和无语言标记的代码块、标题行内代码、开关恢复以及 callout 外代码不变。检查了阅读浅色和 Live Preview 深色截图；主题、设置、活跃标签和后台节流恢复，临时笔记已删除，错误日志为空。未重跑完整编辑器集成套件和单元测试，未验证移动端、其他主题和平台。

2026-11-11，macOS。

布局改版后，Obsidian 1.15.0：

- `npm test`：模型 9 项通过。
- `node scripts/test-callout.mjs <dev-vault>`：41 项通过，连跑两次。在第一版的基础上新增覆盖：
  - 编辑器内的转换按编辑后的内容进行；新建 callout 不显示转换按钮；从 Live Preview 的按钮转成引用块；
  - 空标题的占位文字；按钮位于滚动区之外，长内容也不会把它们挤出视野；
  - 拖动把手按两倍位移调整尺寸，重新打开时沿用，双击恢复默认；窄宽度时上下排列。
- HTML 表格（23 项）和公式格式化（8 项）集成测试通过。

第一版，Obsidian 1.14.5：

- `node scripts/test-callout.mjs <dev-vault>`：27 项通过。覆盖：
  - 命令只在 callout 内可用；
  - 类型选择器和预览；
  - 只改表头时只写一行；
  - 改正文后写出规范标记；
  - GitHub 状态与一键兼容；
  - 转成正文和引用块（含嵌套的 callout）；
  - 撤销；
  - 包裹选区，以及插入空 callout 后光标的位置；
  - Live Preview 与阅读视图的按钮和写回；
  - 状态栏计数。
- 验证语料：
  - 范围识别：147 篇笔记中的 562 个顶层 callout，与 Obsidian `metadataCache` 的 callout section 起止行完全一致，没有遗漏，也没有多余。
  - 往返：「转成正文 → 重新包裹」的结果与规范形式相比，561 个一致。唯一例外是一个 callout 的正文每行都以多余空格开头，重新包裹后整体缩进 1 格，渲染不变。
- 原有的 HTML 表格和 Banner 集成测试仍然全部通过。

未验证：移动端、pop-out 窗口、RTL、其他桌面平台、主题定义的非标准 callout DOM，以及原生菜单中的菜单项。拖动把手只用合成的 pointer 事件测试过，真实鼠标拖动只在截图中看过效果。
