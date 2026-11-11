# Callout 编辑器设计

状态：已实现。验证范围见文末。

## 范围

callout 是每一行都要带 `>` 的引用块，手工调整结构很繁琐：换类型、加标题、把一段正文包进 callout，或者反过来拆出来。本功能提供可视化编辑器，并检查 callout 在 GitHub 上能否显示为 alert。

入口：

- 命令 **Insert callout**：有选区时包裹所选的整行，没有选区时在光标处插入一个空 callout。
- 命令 **Edit callout**：光标位于 callout 内时可用，编辑最内层的那个 callout。
- 编辑器底部的 **Convert to text** 和 **Convert to blockquote** 按钮，按编辑器中当前的内容转换。同样的转换也有命令 **Convert callout to text** 和 **Convert callout to blockquote**。
- 命令 **Check callouts for GitHub**：列出整篇笔记中每个 callout 在 GitHub 上的问题，并可跳转到对应行。
- 编辑器右键菜单：光标在 callout 内时提供编辑和两种转换；有选区时提供 **Wrap in callout**。
- 阅读视图和 Live Preview 中，悬停 callout 时出现 **Edit callout** 按钮。Live Preview 中它位于原生 **Edit this block** 旁边。
- 状态栏：笔记的 `github` 属性为 `true`，或位于设置的 **GitHub folders** 中时，显示 GitHub 不会渲染成 alert 的 callout 个数。

## 文本规则

- **识别。**
  - 表头的格式是 `[!type|metadata]fold title`，前面可以有缩进和多层 `>`。
  - callout 包括所有带有这一层标记的行，以及按 CommonMark 规则懒续行（lazy continuation）的行。
  - 懒续行只能接在段落文字之后。跟在空的 `>` 行、标题、分隔线、`$$` 或代码块之后的行，不算懒续行；本身是列表项、标题、代码围栏或 `>` 开头的行，也不算。
  - frontmatter 和代码块中的内容不识别为 callout。
- **只改表头时，只重写表头那一行，正文按原字节保留。** 改了正文时，按规范标记 `> ` 重写整个 callout。没有任何改动时不写回。
- **包裹。** 选中的行放在它们共同的缩进处（例如列表项内），每行加一层 `> `，空行写成 `>`。前后不是空行时各补一个空行，否则相邻的文字会因懒续行并入 callout，或与相邻的引用块合并。
- **转成正文。**
  - 去掉表头，每行只去掉这一层标记。内层的 callout 随之上升一层；嵌套在外层 callout 中时，外层的标记保留。
  - 标题变成粗体首行，后面跟一个空行。
- **转成引用块。** 只去掉 callout 标记，标题变成粗体首行。
- **编辑器中的正文。** 显示时去掉这一层标记，保存时由编辑器重新加上，用户不需要手写 `>`。

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
├── callout.ts        命令、编辑器菜单、两种视图的按钮、写回、状态栏
└── callout/
    ├── model.ts      表头解析、范围识别、包裹与拆出、GitHub 规则（纯函数）
    └── editor.ts     编辑弹窗、类型探测、GitHub 报告弹窗
```

## 决策

- **类型来自已加载的样式表。** 扫描 `.callout[data-callout="…"]` 选择器，用一个隐藏的探针元素读取 `--callout-icon` 和 `--callout-color`。这样主题和 CSS 片段定义的类型也会出现，颜色与 Obsidian 渲染一致。
  - Obsidian 1.14 给出的颜色是十六进制值，旧版本是 `r, g, b` 三元组，代码统一转成 CSS 颜色。
  - 色块的浅色背景用 `color-mix`，不用 `rgba()`。
- **写回前核对源码。** callout 源码与打开时不一致时只提示重新打开，不覆盖并发修改。各入口的写回方式：
  - 阅读视图：按 section 行号经 `vault.process` 写回。
  - Live Preview：用 CodeMirror 事务。
  - 命令：用 `Editor.replaceRange`。
- **预览用 `MarkdownRenderer.render`。** 输入停止 150 ms 后重新渲染。弹窗持有自己的 `Component`，关闭时卸载。
- **转换放进编辑器。** 命令和右键菜单项只在光标位于 callout 源码中时出现。Live Preview 渲染出的 callout 不算光标所在，阅读视图也没有编辑器，所以 2026-11-11 用户在编辑器里找不到转换。编辑器底部的两个按钮从所有入口都能用到。
- **布局。** 第一版把所有控件放在左栏，预览和 GitHub 状态放在右栏。左栏太长，正文框落在首屏以下，右栏却大半空着，用户反馈拥挤。现在的布局：
  - 类型、标题、折叠、metadata 横跨整个弹窗。标题、折叠、metadata 排成一行，标签在上方；原来的说明文字改为占位文字和悬停提示。不再使用 `Setting` 行，因此也没有分隔线。
  - 只有正文和预览并排。两栏等高，分得弹窗多出的高度；内容过长时在各自的框内滚动。
  - GitHub 状态放在两栏下方，问题列表再长也不会挤压预览。
  - 按钮固定在底部，转换在左，取消和保存在右。
  - 弹窗内容宽度小于 640px 时上下排列。这里用 container query，按弹窗而不是窗口的宽度判断。
  - 在 1609×780 的窗口中，默认尺寸是 960×555，不需要滚动。
- **可调整大小。** 表格编辑器和本编辑器共用 `src/ui/resizable-modal.ts`。
  - 拖动右下角的把手时，尺寸按指针位移的两倍变化：弹窗居中，这样把手始终跟着指针。
  - 尺寸用 `app.saveLocalStorage` 按库记住，下次以这个尺寸打开；双击把手恢复默认。
  - 调整过的弹窗最大可到窗口边缘内 16px。移动端不加把手。
- **空标题的占位文字**是 Obsidian 会显示的名称：类型转小写，连字符换成空格，首字母大写。例如 `NOTE` 显示为 Note，`my-type` 显示为 My type，在 1.15.0 的阅读视图中实测。

## 宿主依赖

- 阅读视图：使用公开的 markdown post processor 和 `getSectionInfo`，只处理以 callout 开头的 section。
- Live Preview：依赖 `.cm-callout > .embed-actions` DOM。容器不存在时不加按钮，命令仍然可用。按钮由挂在 `contentDOM` 上的 mouseover 监听按需添加，与 HTML 表格的做法相同。
- 编辑器 API：`editorInfoField` 用于取得 Live Preview 中笔记的路径。
- 弹窗：依赖 `.modal` 为纵向 flex 并在 `.modal-container` 中居中；记住尺寸用 `app.loadLocalStorage` 和 `saveLocalStorage`（1.8.7 起）。

## 验证

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
- spacetime 全库：
  - 范围识别：147 篇笔记中的 562 个顶层 callout，与 Obsidian `metadataCache` 的 callout section 起止行完全一致，没有遗漏，也没有多余。
  - 往返：「转成正文 → 重新包裹」的结果与规范形式相比，561 个一致。唯一例外是一个 callout 的正文每行都以多余空格开头，重新包裹后整体缩进 1 格，渲染不变。
- 原有的 HTML 表格和 Banner 集成测试仍然全部通过。

未验证：移动端、pop-out 窗口、RTL、其他桌面平台、主题定义的非标准 callout DOM，以及原生菜单中的菜单项。拖动把手只用合成的 pointer 事件测试过，真实鼠标拖动只在截图中看过效果。
