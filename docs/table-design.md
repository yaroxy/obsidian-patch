# HTML 表格设计

状态：已实现。验证范围见文末。

## 范围

Markdown 表格无法合并单元格、分组表头或添加表名，这类表格只能写成 HTML 块，而手写 HTML 难以维护。本功能提供可视化编辑器，插入和修改都在接近渲染结果的界面中完成，并写出适配 Obsidian 的 HTML。

入口：

- 命令 **Insert HTML table**：在光标处插入新表格（3×3，首行为表头）。
- 命令 **Edit HTML table**：光标位于表格源码内时可用。
- 命令与编辑器右键菜单 **Convert Markdown tables to HTML**：转换光标所在的 Markdown 表格，或选区内的完整表格；先在同一编辑器中逐张预览和修改，确认后一次写入。
- 阅读视图和 Live Preview 中，悬停 HTML 表格时出现 **Edit table** 按钮。Live Preview 中它位于原生 **Edit this block** 旁边。

不包括 callout、引用块或列表内的 Markdown 表格、嵌入笔记和悬浮预览里的表格、行内格式工具栏，以及外部文件导入。

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
    ├── markdown.ts Markdown 表格定位、选区检查、参考链接上下文、替换边界
    ├── conversion.ts 转换入口、原生行内渲染、完整批次校验与事务写回
    └── editor.ts   可视化编辑弹窗
```

`model.ts` 中只有解析依赖 `DOMParser`。各项操作都是返回新表格的纯函数，由单元测试覆盖。

## 决策

- **自建模型，不用 Tiptap/ProseMirror。** ProseMirror 按 schema 解析，单元格中 schema 之外的行内 HTML（如 `<small>`、`<ruby>`）会丢失；而本功能要求未改动的内容原样保留，并输出固定格式。网格布局遵循 HTML 表格算法。插入和删除行列沿用 prosemirror-tables 的行为：跨过插入点的单元格延长，新单元格为 1×1，且只有两侧都是表头时才是表头。
- **单元格直接 `contenteditable`。** 回车插入 `<br>`；粘贴只取纯文本；输入法组合期间不拦截 Enter 和 Escape。
- **写回前核对源码。** 表格源码与打开时不一致时只提示重新打开，不覆盖并发修改。阅读视图按 section 行号经 `vault.process` 写回；Live Preview 用 CodeMirror 事务；命令用 `Editor.replaceRange`。
- **按键。** 弹窗使用以原 scope 为父级的子 `Scope`。单元格内 Escape 只退出单元格，单元格外 Escape 关闭并放弃修改；Mod+Enter 保存；Mod+Z 与 Mod+Shift+Z 撤销和重做，结构操作与每个单元格的一次输入各为一步。
- **菜单**使用 Obsidian 的 `Menu`，遵循用户的原生菜单设置。
- **窗口大小。** 弹窗右下角有调整大小的把手，与 callout 编辑器共用 `src/ui/resizable-modal.ts`：多出的空间给表格网格，尺寸按库记住，双击把手恢复默认。保存和取消按钮固定在底部，表格在中间滚动。

## Markdown 转换

- 光标模式只处理当前表格。非空选区必须完整包含所触及的每张表格；选区中的段落和表格之间的文字保持原样。多光标暂不支持。
- `markdown.ts` 先排除 frontmatter、代码、注释、公式块、原始 HTML 和嵌套容器，再识别表头、分隔行和正文。按 Obsidian 实际解析，表格在文首、空行或 ATX 标题后开始，不从普通段落中途开始；没有管道符的后续行保留为普通段落。保留源范围，不把转义管道误当分列。表头与分隔行的列数必须一致；正文缺列由原生渲染补空，超出表头的列则拒绝，避免丢失文字。
- 使用 Obsidian 的 `MarkdownRenderer.render` 解析行内格式，带入同一笔记中的参考链接定义，并再次核对渲染的行列数。转换为原有 `Table` 模型；表头、对齐、常见 HTML 行内标签和链接保留。公式、图片、嵌入、脚注及动态渲染内容不序列化为 HTML，而是拒绝整个批次并说明原因。
- `TableEditor` 接收多个草稿，逐张保存自己的撤销/重做栈。切换表格不写正文；确认写全部，取消丢弃全部。现有 HTML 插入和编辑使用同一接口传入单张表。
- 确认时核对整篇源文本、文件对象和路径。通过一次 `Editor.transaction` 替换全部范围，并用 CodeMirror `isolateHistory` 将它与前后的输入分开；一次撤销/重做作用于整个转换批次。过期草稿保留在弹窗中并提示重新打开。
- HTML 块内无空行，必要时在块外补空行，保证相邻正文继续按 Markdown 渲染。保留外围文本和原有换行风格。

## 宿主依赖

阅读视图使用公开的 markdown post processor 和 `getSectionInfo`。Live Preview 依赖 `.cm-html-embed` 与其中的 `.embed-actions` DOM；容器不存在时不加按钮，命令仍然可用。Obsidian 的 HTML 部件让 CodeMirror 忽略其内部事件，因此按钮由直接挂在 `contentDOM` 上的 mouseover 监听按需添加。`Modal` 自带 `selection` 实例属性，编辑器的方法避开了这个名称。

## 验证

2026-11-03，macOS，Obsidian 1.14.5，dev-vault：

- `npm test`：模型 10 项通过。
- `node scripts/test-table.mjs <dev-vault>`：22 项通过，覆盖两种视图的按钮、未改动不写回、单格修改只改动该格、拖选合并、撤销重做、Escape、Live Preview 写回和两个命令。
- spacetime 中的五十音表（176 行 HTML，含 rowspan、colspan、表名和 `<small>`）复制到 dev-vault 后，未改动保存不写文件，修改一格后全文只有该格变化。

2026-11-11，Obsidian 1.15.0：`test-table.mjs` 23 项通过，新增一项检查调整大小的把手和固定在底部的按钮；拖动调整的行为由 callout 集成测试覆盖。

2026-11-12，Obsidian 1.15.0，dev-vault：Markdown 转换新增 8 项纯模型测试；`test-table-conversion.mjs` 覆盖批量草稿和取消、63 行数据及 3 行表头的逐格对照、一次撤销/重做及其与输入的隔离、单表入口、行内格式与链接、边界、异常批次和并发保护、原生 Live Preview 单元格入口及阅读视图。原 HTML 表格 23 项集成检查仍通过。脚本使用隔离标签页并恢复设置、窗口状态和测试笔记。

未验证：移动端、pop-out 窗口、RTL、其他桌面平台，以及原生菜单中的菜单项（系统菜单不在 DOM 中，菜单项与工具栏共用同一组操作定义）。
