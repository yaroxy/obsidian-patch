# Patch Banner 设计

状态：已实现；当前方案按用户要求简化为单一属性与完整媒体展示。实际验证范围见 [测试记录](banner-testing.md)。

## 范围与配置

媒体来自当前 Obsidian vault，支持图片、动图与视频。笔记只使用一个 Text 属性：

```yaml
---
patch-banner: "[[assets/banner.png]]"
---

# 笔记正文
```

`patch-` 是本插件的属性命名约定。选择器写入完整 vault 路径的普通 wikilink；手写短路径使用 Obsidian 原生解析语义。链接值必须加引号以保持 YAML 字符串类型。参见 [Obsidian Properties](https://obsidian.md/help/properties)。

不接受远程 URL、file/data URL、嵌入语法、Markdown 链接、列表、别名、标题或块引用。未配置或空字符串表示没有横幅，错误的类型和找不到的媒体显示简短错误。没有多格式回退解析，也没有迁移脚本。

## 展示

图片、动图与视频使用 `width: 100%`、`height: auto`，以原始比例完整展示，封面宽度为当前笔记窗格的指定百分比并居中，默认 90%，100% 时铺满窗格，标题、Properties 与正文宽度保持不变。`object-fit: contain`，不固定横幅高度，不进行焦点裁剪。竖图可以高于屏幕，通过正常滚动查看。

封面位于原生 inline title 与 Properties 之前，随笔记滚动；不移动或复制原生标题及属性。阅读模式和 Live Preview 共用一个封面实例，源码模式隐藏封面和操作按钮。只有 frontmatter、没有正文的笔记也可以显示封面。

首版面向完整工作区 Markdown 笔记；嵌入笔记、悬浮预览、Canvas、PDF 导出不在范围内；封面宽度独立于笔记正文的可读行宽。

## 媒体与播放

| 媒体 | 实现 |
| --- | --- |
| JPG/JPEG、PNG、GIF、WebP、SVG、BMP、AVIF、APNG | 原生 `<img>`；SVG 作为图片加载 |
| MP4、WebM、MOV | 原生 `<video>`；编码支持由宿主浏览器决定 |

图片与视频的来源 URL 由 `vault.getResourcePath(TFile)` 生成，只保存在运行状态中。无需读取大视频为 ArrayBuffer，也不维护额外的 Blob 或媒体内容缓存。

视频静音、循环、行内播放；仅在视图和文档可见、用户未主动暂停、播放策略允许时播放。隐藏或离屏时暂停，手动暂停各窗格独立。自动播放失败时提供手动播放按钮，加载错误可以重试或重新选择媒体。

GIF 等图片内容提供隐藏/显示，不能承诺逐帧暂停。系统减少动态效果开启时，对可能含动画的图片格式先显示点击加载占位，视频改为点击播放。为避免加入动画检测器，PNG、WebP、AVIF、SVG 里的静态图片也受此策略影响；JPEG、BMP 可直接加载。

## 操作与设置

- **Select cover**：原生 FuzzySuggestModal 按名称和完整路径选择 vault 媒体，只写入 `patch-banner`。
- **Remove cover**：只删除 `patch-banner`，保留媒体和其他笔记属性。
- 没有封面时，标题上方有悬停/键盘聚焦显示的 Add cover；已有封面显示 Change cover / Remove cover。触屏始终显示操作。视频增加播放/暂停，图片增加隐藏/显示。

没有尺寸输入、定位滑块、调整对话框或调整命令。设置页提供 Enabled、Cover width (%) 与 Autoplay videos。两个开关默认开启，宽度为 10–100% 的整数，默认 90%；滑块旁的重置按钮恢复到 90%，同步滑块数值并保存到插件设置，对该 vault 的所有封面生效。拖动时原生滑块提示数值，释放后保存并更新现有视图，不增加 frontmatter 属性。

写入使用 `fileManager.processFrontMatter`，捕获操作发生时的笔记，而非保存时重新查询活跃文件；写入错误显示 Notice。原生 serializer 可能重新排版 YAML、移除注释。

## 模块与 Interface

```text
src/features/
├── banner.ts          注册功能、设置更新、协调文件事件
└── banner/
    ├── config.ts      属性校验与 vault 引用解析
    ├── media.ts       媒体 DOM、播放策略与清理
    ├── cover.ts       标题前挂载、编辑器属性监听和视图生命周期
    └── picker.ts      媒体选择与属性写入
```

入口只暴露 `registerBanner(plugin, settings)` 及其返回的设置更新函数，沿用项目现有独立功能注册方式。cover.ts 管理阅读与编辑两种标题容器，共用媒体模型和播放逻辑；不建立通用来源注册表。旧的正文段落处理器和 block widget 已删除。

CodeMirror 使用宿主提供的 `@codemirror/state` 6.5.0 / `@codemirror/view` 6.38.6 实例，包显式列入开发依赖并 external。没有增加播放器、图库或状态管理依赖。

## 阅读与编辑生命周期

每个完整工作区 MarkdownView 拥有一个封面实例，操作始终绑定该视图的笔记，而非全局活跃文件。阅读模式挂载到原生 `.mod-header` 的首部，Live Preview 挂载到 `.cm-sizer` 的首部，位于 inline title / Properties 之前；不向 CodeMirror 的 contentDOM 或阅读正文 section 插入节点。

**集成约束**：当前项目所用的公开接口没有标题前封面插槽，因此上述两个宿主 CSS 容器是必须承认的 DOM 依赖，集中在 cover.ts 中。Obsidian 改动标题结构后需要重新验证；不能宣称这一部分完全不依赖宿主内部结构。挂载点不可用时不注入到别的区域，不保留正文内的兼容实现。Live Preview 另依赖 CodeMirror 的内部方法 `viewState.getScrollOffset`（见下文），集中在 banner/scroll-offset.ts；方法不存在时不做修改。

每个视图使用局部 MutationObserver 关注标题容器的替换；忽略封面自己的 DOM 变化，合并到一次动画帧刷新。宿主重建标题后重新挂载同一个封面节点，不覆盖任何宿主方法，没有全局 DOM observer。

阅读视图按渲染窗口虚拟化：标题容器和正文 section 一样，滚出窗口时被整段卸载，回到窗口时才重新测量高度。封面在卸载期间留在同一个标题节点内，与原生标题和 Properties 一致。若随卸载移除封面，宿主记录的高度会在有无封面之间来回错位，把滚动位置钳回笔记末尾，表现为滚到底部后无法向上滚动。

Live Preview 在重新测量行高时会保持一行不动，这一行按原始滚动偏移选取，前提是正文从滚动容器顶端开始。封面让正文下移一千多像素，选中的高度可能超出整篇正文，落在高度表只做外推的未渲染区域；等这一行真正被测量时，修正会把滚动位置拉回几百像素，表现为向下滚动时封面跳回视野。有封面的编辑器因此改为从正文顶端计算滚动偏移，这正是 CodeMirror 在外层滚动容器中的做法；封面隐藏、切到阅读视图、编辑器释放或插件卸载时还原。没有封面的笔记保持 Obsidian 原有行为。

CodeMirror ViewPlugin 通过公开的 editorInfoField / editorLivePreviewField 读取笔记身份和模式。在 frontmatter 或笔记身份改变时使用当前 editor state 解析属性，普通正文编辑不重新解析 frontmatter。没有访问 editor.cm；没有正文 StateField / widget，也不再需要阅读模式 post processor。

封面按视口宽度乘以设置百分比计算尺寸，左右保留等量空间；只调整自己的宽度和逻辑方向偏移，需要时用负向边距越出正文栏，不修改宿主标题或正文的样式。局部 ResizeObserver 测量当前滚动视口与标题容器，跟随窗格、分栏和正文宽度变化；没有封面时 Add cover 保持与标题对齐。图片高度随解码和宽度变化，媒体模块的 ResizeObserver 通知对应编辑器 requestMeasure。不同窗格的状态相互独立，同一笔记的阅读/Live Preview 切换移动同一节点，保留媒体与手动暂停状态。切到源码模式释放媒体源并隐藏全部封面操作。

文件、元数据、布局和打开笔记事件合并到一次延迟刷新；不遍历整个 vault，也不主动加载延迟视图。媒体改名后的链接维护由 Obsidian 负责，并尊重用户设置。

关闭视图或卸载插件时断开局部 observer、取消动画帧、解除媒体事件，暂停视频、清空 src，并删除自己的封面节点。运行状态不持久化。

## 参考与验证基线

参考 [Pixel Banner](https://github.com/jparkerweb/pixel-banner/blob/25abb70a330eb0a2b30451e0ffa985901ce93c7c/README.md) 的 vault 媒体选择、frontmatter 配置和原生视频播放。其标题上方封面需要向宿主容器插入持久 DOM、覆盖未公开的方法，本项目同样需要定位标题容器，但不采用其宿主方法覆盖方案，见其 [bannerManager.js](https://github.com/jparkerweb/pixel-banner/blob/25abb70a330eb0a2b30451e0ffa985901ce93c7c/src/core/bannerManager.js#L23)。

不包含线上图库、AI、下载、文件夹继承或随机轮换。`minAppVersion` 从 1.0.0 提升至项目此前的桌面测试基线 1.13.7；本次使用 Obsidian 1.14.5 验证，未重测最低版本和移动端。编辑器监听依据 [Obsidian Editor extensions](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Editor/Editor%20extensions.md) 和 [Decorations](https://docs.obsidian.md/Plugins/Editor/Decorations)。
