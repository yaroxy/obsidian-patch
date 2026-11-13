# 标题等级和 PDF 导航设计

状态：已实现。2026-11-12 在 macOS、Obsidian 1.15.0 验证。分页分割线继续暂缓，相关实验保留在 `pdf-pagination-prototype.md`。

## 标题等级提示

H1～H6 标签固定在标题区域最右侧；标题正文预留 2.75rem，换行时不会覆盖标签。默认开启，在 Editor 分组的 Heading levels 中切换。

阅读视图使用作用于 Markdown 视图的 CSS 伪元素。Live Preview 和源码模式使用 CodeMirror widget，按可见范围中的 Markdown 标题 token 建立，每行最多一个标签。修改内容、滚动和语法树更新时重建；开关通过 StateEffect 刷新已有编辑器。Markdown 代码围栏中的嵌套语法高亮也可能带有 header token，因此显式排除 codeblock 和 frontmatter token。Setext 下划线不会得到第二个标签。

标签不写入源码。阅读视图的文字内容保持原样，编辑器 widget 标为 `aria-hidden`。样式以每个 Markdown 视图为作用域，覆盖 Callout 渲染出的标题；打印 DOM 不具有这个作用域，打印样式也排除标签。

`@codemirror/language` 是构建期开发依赖；运行时与 state/view 一起保持 external，使用 Obsidian 提供的模块。state/view 仍由 Obsidian 的精确 peer 版本提供。编辑器装饰使用宿主支持的 [CodeMirror decorations](https://docs.obsidian.md/Plugins/Editor/Decorations)。

## PDF 导航

沿用原生 Export to PDF 对话框。PDF Export 分组提供两个默认开启的独立选项：

- Document outline：由原生导出器根据标题生成层级书签，显示在 PDF 阅读器的目录或书签面板。
- Heading links：将当前笔记内的标题链接恢复成指向打印 DOM 标题 ID 的链接。

原生流程会清除 `a.internal-link` 的 href。恢复链接必须在原生 `print()` 返回之后进行；普通 Markdown post processor 会执行得太早。

### 宿主方法的适配

`src/features/pdf-export.ts` 集中处理未公开的 `MarkdownView.printToPdf()`、导出弹窗的 `print()` 与 `printToPdfDesktop()`。弹窗的 `print()` 与 `printToPdfDesktop()` 绑定到对应实例，避免方法脱离对象后丢失接收者。捕获弹窗只在同步调用原生入口期间临时包装 `Modal.open()`，其调用仍使用当前弹窗作为接收者；通过属性描述符保存原函数及属性标志，并在 finally 中完整恢复，包括原生导出抛错的情况。宿主 `open` 不是可写的自有函数属性时退回原生导出。没有修改 IPC 或全局 Electron 导出方法。

大纲使用 `generateDocumentOutline` 和 `generateTaggedPDF`；前者在 [Electron 文档](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions)中仍标为实验性参数。打印参数的其余字段原样传递。功能仅在桌面端注册；宿主入口不存在时保留原生行为。卸载时恢复自己持有的入口；已经打开的弹窗通过 disposed 标志回到原生行为，避免重载后叠加包装。

这些是需要随 Obsidian 升级复核的内部接口；当前实际验证版本为 1.15.0。

### 标题与链接匹配

1. 从打印 DOM 获取主文档的 Markdown 标题，排除嵌入笔记的标题。按顺序与 metadataCache 的标题匹配，建立源码偏移到 DOM 标题的映射。
2. 保留已有且唯一的 ID，其余使用不会与现有元素冲突的 ID。
3. 链接路径与片段分别解码。带路径的链接通过 `getFirstLinkpathDest()` 确认目标就是当前文件，不能仅比较文件 basename。
4. 优先使用 `resolveSubpath()`，保留 Obsidian 对重复标题的匹配语义。无法原生解析时，再匹配常见 Markdown TOC 片段，如 `#target-heading`；重复片段带数字后缀。
5. 未找到标题、其他笔记、块引用和嵌入笔记内部的链接不转换。外部网址保持不变。

自定义 HTML 锚点、跨笔记合并导出和完整兼容任意 TOC 插件不在本次范围内。

## 设置页排序

一级分组名称与渲染函数统一登记，使用英文名称排序，再生成分组标题。当前顺序为 Callouts、Editor、Line Width、Math Format、Patch Banner、Patch Icons、Patch Mermaid、PDF Export。组内相关设置保留原有组织方式。

## 验证与复跑

```sh
npm test
npm run build
node scripts/test-navigation.mjs /Users/roxy/Documents/obsidian-vaults/dev-vault /private/tmp/obsidian-patch-navigation-tests
```

集成入口写入 `dev-vault/Patch Navigation Tests/` 中的专用样例，部署当前构建，并在结束时恢复插件设置、弹窗尺寸、原标签页和后台节流。所有集成测试共用运行入口，详见 `integration-testing.md`。`OBSIDIAN_CLI` 可覆盖原生 CLI 路径；PDF 校验需要 pypdf 与 pdfplumber，可通过 `PDF_PYTHON` 指定 Python，默认使用 `python3`。

本次检查覆盖六种标题等级、Setext、代码围栏排除、修改与单步撤销、滚动后的标题、设置开关、右对齐、520px 窄阅读宽度下的长标题，以及实际设置页分组顺序。

原生导出生成六种状态的 PDF：全部开启、仅大纲、仅跳转、全部关闭、卸载时已打开的弹窗、重新加载。开启状态得到 7 个层级书签和 9 个文内跳转；所有目标页、重复标题、Unicode、同文件路径及外部链接均从真实 PDF 校验。六份 PDF 的可见文字和字形坐标均与原生关闭状态一致。

构建、56 项单元测试、16 项原生界面检查和 6 份 PDF 校验通过。现有集成回归也通过：HTML 表格 23 项、Callout 41 项、公式格式化 8 项。测试结束后恢复了开发库的插件设置、原标签页与后台节流。

移动端、其他桌面平台、第三方主题和最低支持版本没有在本轮实测。Banner 视频播放超时是前一轮留下的独立稳定性问题；用户于 2026-11-12 决定暂缓处理，本次没有改动 Banner 播放行为。
