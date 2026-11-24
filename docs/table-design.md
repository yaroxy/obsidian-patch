# HTML 表格设计

状态：已实现。验证范围见文末。

## 范围

Markdown 表格无法合并单元格、分组表头或添加表名，这类表格只能写成 HTML 块，而手写 HTML 难以维护。本功能提供可视化编辑器，插入和修改都在接近渲染结果的界面中完成，并写出适配 Obsidian 的 HTML。

入口：

- 命令 **Insert HTML table**：在光标处插入新表格（3×3，首行为表头）。
- 命令 **Edit HTML table**：光标位于独立 HTML 表格源码内时可用。
- 命令与编辑器右键菜单 **Convert Markdown tables to HTML**：转换光标所在的 Markdown 表格，或选区内的完整表格；先在同一编辑器中逐张预览和修改，确认后一次写入。
- 命令与编辑器右键菜单 **Convert HTML tables to Markdown**：将光标所在或选区内的独立 HTML 表格转换回 Markdown 表格；确认弹窗对比源码、渲染预览、结构/语义损耗与可选策略（合并格、无表头、表名），自动往返校验通过后一次事务写回。
- 阅读视图和 Live Preview 中，悬停 HTML 表格时出现 **Edit table** 按钮；编辑弹窗左下角提供 **Convert to Markdown**，可将当前编辑后的草稿直接转为 Markdown（从阅读视图入口触发时自动切回编辑模式并支持单步撤销）。

不包括 callout、引用块或列表内的表格、嵌入笔记和悬浮预览里的表格、行内格式工具栏，以及外部文件导入。

## 行内代码字体

**HTML Tables → Inline code font** 接受一个本机已安装的字体族名。阅读视图、Live Preview 和可视化编辑器中，独立 HTML 表格的表头和正文单元格使用该字体显示行内代码。清空设置后恢复主题样式。设置只影响显示，笔记里不写入字体属性。

开发版的字体输入使用 Obsidian 建议列表和设备字体族名，选择即保存。可手动输入，支持字体枚举的设备可提示未安装的名称。阅读视图单独标记 HTML 表格，实时预览也覆盖 HTML 部件中的嵌套表格。回归检查用 Chromium 的实际字形字体核对，避免仅记录 CSS 首选字体造成误判。

阅读视图写回时按原分隔符替换表格，保留外部字节。从阅读视图转换为 Markdown 会切换到原生编辑器，以便一次撤销。Obsidian 1.15.1 在 Debian 上保存这一编辑器事务时将整篇 CRLF 笔记写为 LF。源码、实时预览和阅读视图中普通保存遇到并发修改时均保留表格草稿。HTML 转 Markdown 的渲染校验逐个比对表名、表头和正文中的行内代码字符，包含连续空格、制表符与换行。编辑器草稿也须在校验前保留这些字符。

## 输出格式

规则来自 obsidian-html-table skill 在实际库中的测量，目的是让 HTML 表格看起来与原生表格一致：

- 块内没有空行，否则 HTML 块会在空行处结束；单元格内容写在一行内。
- 新单元格使用 `align="center"`。Obsidian 会强制 `text-align: start`，但支持 `align` 属性。
- 合并得到的跨行单元格加 `vertical-align:middle`。
- 第一行表头携带列宽。它的单元格数变化时，第一格保留原宽度（默认 20%），其余按表头单元格平分，而不按 colspan 平分。
- 新表名使用 `caption-side:top; text-align:center; font-weight:600; padding:0 0 4px`。
- 开头的全表头行写入 `<thead>`，前提是其中的单元格不跨入正文。
- 属性顺序为 `rowspan`、`colspan`，其余按源码顺序。

未改动的单元格保留原有标记和全部属性；未改动的表格保存时不写回。显示前，单元格内容经 Obsidian 的 `sanitizeHTMLToDom` 处理，只有被编辑过的单元格才从编辑器取回内容。

## 模块

```text
src/features/
├── table.ts        命令、阅读视图与 Live Preview 按钮、写回
└── table/
    ├── model.ts    解析、HTML 表格布局、行列与合并/拆分操作、序列化
    ├── markdown.ts       Markdown/HTML 表格选区定位、共用源码行屏蔽、参考链接上下文、替换边界
    ├── to-markdown.ts    HTML DOM 损耗审计、行内语法与转义还原、选项驱动转换与渲染往返校验
    ├── markdown-modal.ts HTML → Markdown 选项配置、批量源码与渲染预览确认弹窗
    ├── conversion.ts     正反向转换入口、原生渲染校验、完整批次事务写回
    └── editor.ts         可视化编辑弹窗（含左下角 Convert to Markdown）
```

`model.ts` 中只有解析依赖 `DOMParser`，`to-markdown.ts` 基于结构化 DOM 接口实现、同样无需浏览器即可单测。其余纯函数由单元测试覆盖。

## 决策

- 编辑和转换共用网格布局。单元格宽度取浏览器解析后的 `colSpan`，跨行范围止于本行组末尾，`rowspan="0"` 延伸到同一行组的最后一行。网格上限为行数乘以展开后的列数不超过 50,000 个位置，空位也计入。打开、转换或新增行列超过上限时显示提示，保留笔记和已有草稿。
- **自建模型，不用 Tiptap/ProseMirror。** ProseMirror 按 schema 解析，单元格中 schema 之外的行内 HTML（如 `<small>`、`<ruby>`）会丢失；而本功能要求未改动的内容原样保留，并输出固定格式。网格布局遵循 HTML 表格算法。插入和删除行列沿用 prosemirror-tables 的行为：跨过插入点的单元格延长，新单元格为 1×1，且只有两侧都是表头时才是表头。
- **单元格直接 `contenteditable`。** 回车和纯文本粘贴通过 `Selection` / `Range` 插入文本节点与 `<br>`，仅接受同一个单元格或表名内的选区，跨单元格选区不改动 DOM。末尾换行保留光标占位 `<br>`，写回时由 `clean()` 去除。CRLF、CR 和 LF 统一处理，粘贴不插入剪贴板 HTML；输入法组合期间不拦截 Enter 和 Escape。输入后直接同步模型，并沿用编辑器自己的撤销栈；可取消的 `beforeinput` 历史请求也路由到同一撤销/重做实现，不再调用 `execCommand`。
- **写回前核对源码。** 表格源码与打开时不一致时只提示重新打开，不覆盖并发修改。阅读视图按 section 行号经 `vault.process` 写回；Live Preview 用 CodeMirror 事务；命令用 `Editor.replaceRange`。
- **按键。** 弹窗使用以原 scope 为父级的子 `Scope`。单元格内 Escape 只退出单元格，单元格外 Escape 关闭并放弃修改；Mod+Enter 保存；Mod+Z 与 Mod+Shift+Z 撤销和重做，结构操作与每个单元格的一次输入各为一步。
- **菜单**使用 Obsidian 的 `Menu`，遵循用户的原生菜单设置。
- **窗口大小。** 桌面端的表格编辑器、HTML 转 Markdown 预览和 Callout 编辑器共用 `src/ui/resizable-modal.ts`。拖动右下角调整大小，双击恢复默认。三种面板分别按库保存尺寸。表格编辑器将可用空间交给网格，转换预览将空间交给源码和渲染结果，窄面板中结果移到源码下方。操作按钮固定在底部。

## Markdown 转换

- 光标模式只处理当前表格。非空选区必须完整包含所触及的每张表格；选区中的段落和表格之间的文字保持原样。多光标暂不支持。
- `markdown.ts` 先排除 frontmatter、代码、注释、公式块、原始 HTML 和嵌套容器，再识别表头、分隔行和正文。按 Obsidian 实际解析，表格在文首、空行或 ATX 标题后开始，不从普通段落中途开始；没有管道符的后续行保留为普通段落。保留源范围，不把转义管道误当分列。表头与分隔行的列数必须一致；正文缺列由原生渲染补空，超出表头的列则拒绝，避免丢失文字。
- 使用 Obsidian 的 `MarkdownRenderer.render` 解析行内格式，带入同一笔记中的参考链接定义，并再次核对渲染的行列数。转换为原有 `Table` 模型，保留表头、对齐、常见 HTML 行内标签、链接和行内公式。如果遇到图片、嵌入、脚注、动态渲染内容或无法取得源码的公式，则拒绝整个批次并说明原因。
- 从 MathJax 公式根节点的 `data-latex` 读取 TeX，以文本写入 `<span class="math math-inline">`。阅读视图由 Obsidian 的后处理器排版，实时预览的 HTML 部件通过 `renderMath` 排版。表格编辑器显示可编辑的 TeX。笔记只保存源码和标记。
- `TableEditor` 接收多个草稿，逐张保存自己的撤销/重做栈。切换表格不写正文；确认写全部，取消丢弃全部。现有 HTML 插入和编辑使用同一接口传入单张表。
- 确认时核对整篇源文本、文件对象和路径。通过一次 `Editor.transaction` 替换全部范围，并用 CodeMirror `isolateHistory` 将它与前后的输入分开；一次撤销/重做作用于整个转换批次。过期草稿保留在弹窗中并提示重新打开。
- HTML 块内无空行，必要时在块外补空行，保证相邻正文继续按 Markdown 渲染；替换位于文件末尾单换行前时不再多加空行。保留外围文本和原有换行风格。

## HTML → Markdown 反向转换

所有反向转换入口在确认前核对整篇笔记、文件和路径。预览期间新增的锚点链接也会使转换过期。源码审计会提示将被舍弃的表内 HTML 注释及行内属性，例如加粗文字的提示标题。

- 共用 `markdown.ts` 中的 `scanLines()` 行级屏蔽与行内反引号/注释屏蔽，修正原有 `tableRanges()` 会误命中 YAML frontmatter、代码围栏、注释、公式块、callout 或列表项内 `<table>` 的问题，同时保留对顶层格式化 HTML 表内部深缩进子标签的识别。
- `to-markdown.ts` 在传入 `parseTable()` 前先检查原始 DOM 与上下文，避免模型归一丢失 `<colgroup>`、`<tr>`/`<thead>`/`<tfoot>` 属性、`rowspan="0"` 或阻塞结构。嵌套表、块级标签（`<p>`、`<ul>`、`<div>` 等）、图片/嵌入/脚注、非行内公式或被当前笔记引用的 `id` 会给出行列原因并中止整批；无损往返（含本站正向生成的表）零告警。
- 转换策略选项：合并单元格默认保留首格、其余留空（可选跨格重复填充）；无表头默认在首行插入空表头以保留第 1 行数据身份（可选提升第 1 行为表头）；`<caption>` 默认转为表前粗体行并空一行（可选丢弃）；列对齐冲突、多行表头与正文 `<th>`、`<colgroup>`/`<tfoot>` 及非默认属性在确认弹窗列出。
- 实测 Obsidian `MarkdownRenderer` 对单元格内代码与公式的处理后：不含未转义 `|` 的代码（含每个 `|` 前均为奇数个反斜杠的 `` `a\|b` ``）保留反引号包裹，含未转义 `|` 的代码输出 `<code>…&#124;…</code>` 并同时将 `&`、`<`、`>`、`\` 转义为实体（`&#92;` 可避免 CommonMark 将 `\&` 视为转义 `&`）；公式中已有 `\|` 保留，未转义 `|` 改写为 `\vert` 并给出提示；双链别名与普通文本按需转义。
- `HtmlToMarkdownModal` 在确认前使用宿主 `MarkdownRenderer.render` 对批次中每张表逐一执行往返校验（核对表数、行列数、非公式文本、`data-href`、外部链接 URL、`mjx-math[data-latex]` 源码、列对齐与 caption），并经 `metadataCache.getFirstLinkpathDest` 标记未解析内部链接；任一表未通过校验则禁用确认按钮。
- 阅读视图通过 `TableEditor` 触发反向转换时，先按行号核对磁盘内容，再将表格所在的 Markdown 标签页切回编辑模式。确认标签页仍显示原笔记且编辑器内容匹配后，用一次 `Editor.transaction` 写入，`Mod+Z` 可还原原 HTML。找不到原标签页、内容过期或保存失败时提示原因，保留草稿供重试。

## 宿主依赖

阅读视图使用公开的 markdown post processor 和 `getSectionInfo`。Live Preview 依赖 `.cm-html-embed` 与其中的 `.embed-actions` DOM；容器不存在时不加按钮，命令仍然可用。Obsidian 的 HTML 部件让 CodeMirror 忽略其内部事件，因此按钮由直接挂在 `contentDOM` 上的 mouseover 监听按需添加。`Modal` 自带 `selection` 实例属性，编辑器的方法避开了这个名称。

## 验证

2026-11-03，macOS，Obsidian 1.14.5，dev-vault：

- `npm test`：模型 10 项通过。
- `node scripts/test-table.mjs <dev-vault>`：22 项通过，覆盖两种视图的按钮、未改动不写回、单格修改只改动该格、拖选合并、撤销重做、Escape、Live Preview 写回和两个命令。
- 将一张 176 行 HTML 表格复制到 dev-vault。样例含 rowspan、colspan、表名和 `<small>`。未改动保存不写文件，修改一格后全文只有该格变化。

2026-11-11，Obsidian 1.15.0：`test-table.mjs` 23 项通过，新增一项检查调整大小的把手和固定在底部的按钮；拖动调整的行为由 callout 集成测试覆盖。

2026-11-12，Obsidian 1.15.0，dev-vault：Markdown 转换新增 8 项纯模型测试；`test-table-conversion.mjs` 覆盖批量草稿和取消、63 行数据及 3 行表头的逐格对照、一次撤销/重做及其与输入的隔离、单表入口、行内格式与链接、边界、异常批次和并发保护、原生 Live Preview 单元格入口及阅读视图。原 HTML 表格 23 项集成检查仍通过。脚本使用隔离标签页并恢复设置、窗口状态和测试笔记。

2026-11-22，Linux，Obsidian 1.15.1，dev-vault：`npm test` 153 项单元测试通过（含 `tableRanges()` 屏蔽 frontmatter/代码/注释/callout 排除项与 7 组纯模型 HTML → Markdown 测试）；`npm run build` 与 `npm run check:release` 通过；`npm run docs:build` 与 `npm run docs:check` 通过（21 页、853 条链接/资源）；`node scripts/test-table.mjs <dev-vault>` 30 项通过；`node scripts/test-table-conversion.mjs <dev-vault>` 24 项全部通过（0 跳过），覆盖原有 18 项正向转换及新增无损 HTML 往返（含 `` `a\|b` `` / `<code>c&#124;d</code>` / 双链别名 / 参考链接 / 对齐与单步撤销）、行内公式 `|` 改写 `\vert`、合并格/无表头/表名有损策略与预览、`<table>`/`<p>`/`<img>`/被引用 `id` 阻断及选区/排除块拦截、`TableEditor` 草稿取消与转换、阅读视图切回编辑模式单步撤销；目检 `html-to-markdown-modal.png` 确认选项栏、告警列表、源码与预览分栏及底栏按钮布局正常。

未验证：移动端、pop-out 窗口、RTL、其他桌面平台，以及原生菜单中的菜单项（系统菜单不在 DOM 中，菜单项与工具栏共用同一组操作定义）。
