# Patch Banner 验证记录

日期：2026-11-02（Asia/Taipei）。当前版本只使用 `patch-banner`，媒体以原始比例完整展示，并位于原生标题和 Properties 之前。

## 环境与结果

- macOS，Obsidian / installer 1.14.5。
- 测试库：`/Users/roxy/Documents/obsidian-vaults/dev-vault`。
- 构建产物已部署至该库的 `obsidian-patch` 插件目录。
- `npm run build` 通过，`npm test` 的 7 项配置/解析测试通过。
- `node scripts/test-banner.mjs /Users/roxy/Documents/obsidian-vaults/dev-vault` 的 86 项集成检查通过。最后读取 Obsidian 开发错误记录为 `No errors captured.`。结果保存在测试库的 `Patch Banner Tests/results.json`。

脚本在同一现有窗口内批量执行检查，整个运行只调用两次 CLI：重载插件、提交批量检查。通过 vault 内结果文件轮询，不反复启动应用进程；不主动创建测试窗格之外的独立笔记窗口，不改变 Dock 设置。原生设置页可能由 Obsidian 放在另一 document 中，控件测试从设置页的 containerEl 读取，并使用控件自己的 window 派发事件。

## 本次实际检查

| 范围 | 已通过的检查 |
| --- | --- |
| 封面位置 | 横图、竖图、GIF、动画 WebP 在阅读与 Live Preview 的显示底部均先于原生标题和 Properties |
| 封面宽度 | 阅读和 Live Preview 中横图、竖图、GIF、动画 WebP 的封面宽度等于当前滚动视口宽度，左边缘对齐视口；创建分栏后各自重新适配 |
| 宽度百分比 | 阅读和 Live Preview 中 10%、50%、75%、90%、100% 均居中、保持完整比例，标题宽度和水平位置不变；实际设置滑块改为 60% 后即时更新并保存；点击重置后滑块数值和封面恢复到默认 90%，保存并重载仍为 90% |
| 正文宽度 | 启用封面前后，原生标题的宽度和水平位置保持一致；截图检查正文与 Properties 仍保留原来的可读宽度 |
| 单一属性 | 图片、竖图、GIF、动画 WebP 的笔记中只有 `patch-banner`；选择器写入一个完整 wikilink |
| 完整图片 | 阅读与 Live Preview 中实测图片显示宽高比等于自然宽高比；横图与竖图均不裁剪 |
| 编辑器布局 | 完整竖图加载后，正文位于图片底部之后，没有重叠；直接修改编辑器 frontmatter 可立即换图 |
| 动图 | GIF、动画 WebP 在两种模式中加载成功，并保持完整比例 |
| 视频 | H.264 MP4、VP8 WebM 各连续三轮在阅读 / Live Preview 间切换，均完整显示并正常播放 |
| 播放状态 | 手动暂停有效；设置变化保留同一视频实例和暂停状态；模式切换移动同一封面节点并保留视频实例 |
| 空白笔记与操作 | 没有正文、只有 frontmatter 的笔记也有封面；无封面时提供 Add cover；点击 Remove cover 恢复添加入口 |
| 实时配置 | 给已打开的阅读视图首次添加属性后完整显示图片 |
| 原生重渲染 | 连续三次阅读视图重渲染后仅有一个封面，并保留同一图片实例 |
| 多视图与模式 | 第二分栏拥有自己的封面；后台分栏换笔记时正确更新身份；源码模式隐藏封面及操作并停止视频 |
| 选择与移除 | 选择器找到 vault 图片、写入单一属性；移除命令删除横幅引用 |
| 删除旧能力 | 没有调整按钮或调整命令；源码不再读取尺寸与裁剪属性 |
| 资源回收 | 禁用插件后横幅 DOM 消失，视频暂停且 src 清空；重新启用后恢复 |

配置测试覆盖宽度百分比的合法范围、缺省/损坏设置值，以及缺省属性、Unicode/空格路径、YAML 值类型、来源协议、按笔记路径进行原生解析、缺失/不支持的文件、以及媒体扩展名分类。

## 验证边界

旧版裁剪实现、正文段落处理器和 block widget 已删除。当前挂载依赖原生标题容器（见设计文档），没有使用宿主方法覆盖。此前验证过原生改名链接维护、reduced-motion 模拟与独立窗口；本次集中复测标题前布局、自然比例、重渲染、分栏和媒体生命周期。

中间一次运行在 WebM 阅读模式等待播放时超时；当时没有保留加载/可见性诊断，根因未确认。随后相同场景完整通过，最终又完成 MP4/WebM 各三轮连续切换，全部通过。失败时的状态诊断现已保存在集成脚本中，不将一次复跑成功描述为已确定并修复了该超时的原因。

尚未在移动端、其他桌面平台或最低版本 1.13.7 实测。MOV、AVIF、APNG、SVG、BMP 等格式的具体解码结果仍由目标浏览器决定。把已有媒体实例跨窗口迁移、关闭原生自动更新链接后的改名流程未做端到端验证。

## Dock 现象

用户反馈上轮测试时整条 Dock 反复升起和收回。旧脚本频繁调用 Obsidian CLI，并切换/创建窗口；这些是已确认的测试行为，但尚未证明它们就是 Dock 升降的根因。检查时 `com.apple.dock autohide` 为 0；该当前值也不能证明发生问题时的系统状态。

没有为了诊断而重复触发该桌面现象，没有改变用户 Dock 设置。将应用内测试合并为单次批量执行，减少额外进程启动与窗口操作；不将这种干扰减量当作已验证的 Dock 修复。

## 阅读视图底部无法上滚（2026-11-03）

现象：spacetime 的 `柯南.md`（2003×2493 竖图封面，正文含 29 行表格）在阅读视图滚到底部后无法向上滚动；Live Preview 正常。

原因：阅读视图把滚出渲染窗口的标题容器整段卸载，只保留上次测得的高度。旧实现找不到标题容器时会移除封面并释放媒体。上滚时宿主挂回标题，测得无封面高度 320px（原为 999px），文档变短；随后封面插回、图片重建，标题重新变高，Chrome 的 scroll anchoring 把滚动位置下推；宿主按 320px 判断标题仍在窗口外，再次卸载，滚动位置被钳回末尾，如此循环。用户库当时的状态与之吻合：标题已卸载、记录高度 320、封面不在标题内。

修复：标题容器卸载期间，封面留在同一节点内（`cover.ts` 的 `readingHeader()`）。

dev-vault 中使用同一笔记与图片，通过 Electron 注入真实滚轮事件，从底部向上滚到顶部（最多 300 步）：

| 构建 | 输入 | 回弹次数 | 结果 |
| --- | --- | --- | --- |
| 修复前 | 触控板式 20px | 15 | 停在 852 |
| 修复前 | 鼠标式 120px | 98 | 停在 1092 |
| 修复前 | Live Preview 底部切到阅读视图 | 98 | 停在 1092 |
| 修复后 | 以上三种 | 0 | 到达顶部，图片实例不变 |

在标题已卸载时重载插件（相当于给用户库部署修复后的状态），鼠标式与触控板式输入同样没有回弹。集成脚本新增“长笔记竖图封面从底部上滚”检查：修复前失败（`Scrolling up stalled or jumped from 728 to 2418`），修复后通过；完整集成 89 项检查通过。

Obsidian 窗口被其他窗口遮挡时，`document.visibilityState` 为 `hidden`，Chromium 不派发 rAF、ResizeObserver、IntersectionObserver 与 scroll 事件，依赖这些事件的检查会挂起或超时。本次测试期间临时对测试窗口调用 `setBackgroundThrottling(false)`，结束后恢复。此前 WebM 阅读模式的那次超时是否由此引起尚未确认。

## Live Preview 向下滚动时封面跳动（2026-11-03）

现象：先在编辑视图打开任意笔记，再在同一 tab 打开 `柯南.md`，向下滚动到标题附近时，封面跳回视野。用户库中运行 Obsidian 1.14.5 与 1.15.0 时都出现。

原因：在 spacetime 中挂只读记录器后由用户复现，捕获到 CodeMirror 的 `measure()` 在滚动中把 `scrollTop` 从 2058 改为 1193。当时正文顶端位于滚动容器 1711px 处，正文总高 1216，视口为 `[0, 3283]`，文档长 3313。CodeMirror 用原始偏移 2058 + 8 选取锚点，已超出正文总高，落在尚未渲染的最后一行；高度表按查询高度外推，给出 top 2054。这一行进入视口并实测为 1189 后，修正值为 1189 − 2054 = −865。没有封面时，正文上方只有标题与 Properties（约 350px），不会出现这种外推。换 tab 内文件时图片晚于正文解码，正文先被测量、随后被封面推到视口外，是触发条件之一。

修复：有封面的编辑器从正文顶端计算滚动偏移（`banner/scroll-offset.ts`）。

dev-vault 中使用与 spacetime 相同的正文，先关闭封面打开笔记以复现解码时序，再开启封面，按用户日志的触控板惯性曲线向下滚动：

| 构建 | 封面宽度 | 结果 |
| --- | --- | --- |
| 修复前 | 90% | 2029 → 1193，修正 −836，每轮都出现 |
| 修复后 | 90% | 无修正 |

集成脚本新增“长笔记竖图封面在 Live Preview 向下滚动”检查，每步滚动 60px，要求滚动位置既不后退也不额外前跳。修复前：100% 宽度先出现 +4px 前跳，随后反复回退 480–564px，停在 3880 无法到底；90% 宽度回退 312px 与 840px。修复后：两种宽度各两轮均无修正并到达底部。完整集成 92 项检查连续两次通过；其中一次较早的运行在阅读模式视频播放处超时（文档可见、视频已加载但保持暂停），与此前记录的偶发超时相同，未确认原因。

## Issue #38 的开发库复现（2026-11-18）

| 报告内容 | 截至 2026-11-18 的结论 |
| --- | --- |
| 像 Iconize 一样为文件夹图标着色 | 0.4.0 已发布。右键文件夹，选择 **Change icon**，选取图标和颜色后点击 **Apply**。[已发布的图标说明](https://github.com/yaroxy/obsidian-patch/issues/38#issuecomment-6943392466) |
| 悬停特定宽高比的封面时闪动 | 已在 Live Preview 用 Image Converter 1.4.6 复现尺寸跳变。开发版已修复，并验证正文同图仍能独立缩放。测试中没有出现系统全屏或遮罩。0.4.0 用户可临时关闭 Image Converter 的 **Enable drag resize**。[同图复测](#同图封面与正文缩放) |
| 调整正文行宽没有效果 | 已在 Aether Core 约 1306 px 的阅读窗格中复现。设置从 1200 调到 1400 px，正文两次都是 1166 px。左右各 70 px 的主题留白耗尽了窗格空间。相同环境从 600 调到 900 px 时正文按设置变宽。仍待报告者确认其原始视图、窗格宽度和两档设置，以判定是否遇到同一上限。[原始反馈](https://github.com/yaroxy/obsidian-patch/issues/38#issuecomment-6943623664) |

在 macOS 开发库用 Patches Community 0.4.0、已开启的 Readable line length 和 90% 封面宽度，分别加载默认样式、Aether Core 样式、主题加四份片段、仅四份片段。样式临时载入测试窗口，主题 CSS 的 SHA-256 为 `b2a55ec48ad7028d5af6489acaf8dda4fc1b6d1b47282283bf15a2657de8ab53`。开发库仅启用 Patches 和 Hot Reload。报告者未给出其主题版本、样图或各插件设置。[报告与附件](https://github.com/yaroxy/obsidian-patch/issues/38#issuecomment-6943623664) · [Aether Core 样式](https://github.com/CosmicSeaFox/Aether-Core/blob/main/theme.css)

第一轮使用 320×160 和 160×320 PNG，分别在阅读视图与 Live Preview 中用 Electron 鼠标事件移入和移出。每种样式组合采样 48 帧，共 16 组。每组都命中了图片的原生 hover。采样期间图片宽高变化均为 0 px，原节点保持挂载。随后加入报告者列出的插件，复现情况见下文。

在宽约 1306 CSS px 的阅读窗格中，同一段正文的实测宽度如下（单位为 CSS px，四舍五入）。

| 目标宽度 | 默认 | 仅片段 | 仅主题 | 主题与片段 |
| --- | --- | --- | --- | --- |
| 600 | 600 | 600 | 600 | 600 |
| 900 | 900 | 900 | 900 | 900 |
| 1200 | 1200 | 1200 | 1166 | 1166 |
| 1400 | 1242 | 1242 | 1166 | 1166 |

在同一个主题窗格中单独关闭 `.markdown-preview-view .markdown-preview-section` 的 1000 px 限宽，测量值保持一致。单独移除主题的左右 padding 后，宿主的两侧留白分别从 70 px 回到 32 px，1200 与 1400 两档的正文恢复到 1200 和 1242 px。恢复主题规则后两档又都回到 1166 px。Live Preview 中同一编辑行在所有样式组合中都随设置变宽，达到窗格上限后停止增长。已复现阅读视图的宽度上限，低于上限时的调宽有效；报告者的窗口宽度和视图仍待确认。

### 默认主题的宽度是可读栏上限

本机 Obsidian 1.15.1 的 `app.css` 在 `body` 上定义 `--file-line-width: 700px` 和左右各 32 px 的默认文件留白。`.markdown-preview-view` 应用 `padding: var(--file-margins)`，而 `.markdown-preview-view.is-readable-line-width .markdown-preview-sizer` 通过 `max-width: var(--file-line-width)` 和左右自动外边距让正文居中。编辑器的 `.cm-sizer` 也使用这个最大宽度。Patches 在每个笔记视图写入该变量，优先采用笔记属性，其次采用全库设置。500–2000 px 是插件接受的设置范围，默认值为 900 px。[Obsidian 的 File CSS 变量](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Reference/CSS%20variables/Editor/File.md) · [Patches 的设置范围](../src/features/line-width/config.ts) · [每个视图的赋值代码](../src/features/line-width.ts)

在 dev-vault 的同一篇笔记中，保留默认主题、可读行长和两侧各 32 px 的留白，只改变测试窗口的 UI 缩放以取得不同宽度的窗格。表内均为 CSS px，`clientWidth` 按浏览器 API 返回整数，正文由 `getBoundingClientRect()` 测量。

| 窗格 clientWidth | Patches 设置 | 原生 sizer 的 max-width | 正文实测 |
| --- | --- | --- | --- |
| 1306 | 1200 | 1200 | 1200 |
| 1306 | 1400 | 1400 | 1241.64 |
| 1929 | 1400 | 1400 | 1400 |
| 115 | 500 | 500 | 50.82 |

这篇普通段落的宽度等于目标上限和窗格扣除水平留白后可用宽度中的较小值。各组 sizer 的计算 `min-width` 均为 0 px，窄窗格中的正文可缩至 500 甚至 700 px 以下。默认主题的 1242 px 符合这个布局，给 1400 px 足够空间时可准确达到。表格、大段不可断行内容、其他主题和平台可能额外影响布局。

### 报告者插件的对照与最小复现

使用本机 Obsidian 1.15.1、dev-vault 的测试笔记和两张 PNG 的副本，在临时 vault 与独立应用配置中加载 Aether Core 1.0.0 及报告所附的四个片段。Patches 来自同日 dev-vault 的开发构建，横幅实现与 0.4.0 相同。报告者列出 20 个 ID，其中 Iconize（`obsidian-icon-folder`）在其测试中关闭。其余 19 项均从官方目录对应仓库取得报告日期前的稳定发布文件，逐项核实实际加载的插件 ID 和版本。插件使用公开默认设置，未接入账号或 WebDAV 服务。报告者的实际版本、个性化设置和原图未知。[报告者的清单](https://github.com/yaroxy/obsidian-patch/issues/38#issuecomment-6943623664) · [官方目录](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json)

| 组合 | Live Preview 横幅 | 阅读视图 |
| --- | --- | --- |
| 仅 Patches | 稳定 | 稳定 |
| Patches 加全部 19 项 | 指针进入横幅时尺寸跳变 | 默认设置下稳定 |
| Patches 加其余 18 项，关闭 Image Converter | 稳定 | 此对照仅测 Live Preview |
| 仅 Patches 与 Image Converter | 可复现；切回默认主题也可复现 | 此对照仅测 Live Preview |

**最小操作。** 在 Live Preview 打开使用 90% 宽度、原图为 160×320 的封面。在本次 1450 CSS px 的窗格里，封面起初是 1305×2610。将指针移至图中下部，轻微左右移动 1 px，图片在 1305×2610 和 160×320 间交替。105 帧中记录到 32 次宽度切换。320×160 的横图则在 1305×652.5 和 320×160 间交替。浏览器的全屏元素、弹窗与图像缩放遮罩均未激活。两组在阅读视图调节全库目标行宽时也得到相同的 600、900、1200、1310 px，对应输入 600、900、1200、1400 px。

Image Converter 1.4.6 在 MarkdownView 容器的 `mouseover` 上识别 vault 图片，并把原 `<img>` 移入一个新的 `.image-resize-container`。该容器的 `display: inline-block` 和 `max-width: fit-content` 会收缩到原图宽度。Patches 的图片 `width: 100%` 因而相对新容器计算。指针离开后 Image Converter 的清理逻辑又将图片移回原父节点。实测的每次尺寸切换都伴随父节点在 `.obsidian-patch-banner-stage` 与 `.image-resize-container` 之间切换。Image Converter 默认启用拖动缩放，阅读视图默认关闭缩放。[Image Converter 悬停判断](https://github.com/xRyul/obsidian-image-converter/blob/1.4.6/src/ImageResizer.ts#L717-L805) · [包装与清理](https://github.com/xRyul/obsidian-image-converter/blob/1.4.6/src/ImageResizer.ts#L872-L965) · [包装器样式](https://github.com/xRyul/obsidian-image-converter/blob/1.4.6/styles.css#L2613-L2622) · [Patches 横幅样式](../styles.css)

已验证两个独立的干预。关闭 Image Converter 的 **Drag & scroll resize → Enable drag resize** 后，两种原图均稳定在 1305 px 宽，再开启即恢复跳变；测试直接切换与该控件相同的保存设置。若保留拖动缩放，仅在测试窗口给 `.obsidian-patch-banner-stage > .image-resize-container` 指定 `display: block; width: 100%; max-width: none` 也消除了尺寸跳变。这项对照只测量悬停时的布局。[上游开关和说明](https://github.com/xRyul/obsidian-image-converter/blob/1.4.6/src/ImageConverterSettings.ts#L977-L994)

另用 Image Converter 1.4.6 的原始 `updateMarkdownLink` 方法和内存编辑器验证缩放完成后的写回。封面属性指向 `assets/cover.png`，传入目标尺寸 420×210 时，编辑模式把正文的 `![[assets/cover.png|240]]` 和 `![[another/cover.png|80]]` 都更新为 `420x210`。封面属性和不同文件名的插图保持原值。阅读模式只给图片写入行内像素宽高。此对照直接调用写回方法。下文另有实际拖动、关闭和重开笔记的结果。[上游文件名匹配](https://github.com/xRyul/obsidian-image-converter/blob/1.4.6/src/ImageResizer.ts#L1654-L1664) · [封面隔离设计](banner-design.md#image-converter-兼容性)

<details>
<summary>19 个已加载的插件与版本</summary>

| 插件 ID | 实际加载的 manifest 版本 |
| --- | --- |
| `advanced-canvas` | [7.1.2](https://github.com/Developer-Mike/obsidian-advanced-canvas/releases/tag/7.1.2) |
| `auto-card-link-enhanced` | [1.8.3](https://github.com/KreNtal/obsidian-auto-card-link/releases/tag/1.8.3) |
| `auto-file-organizer` | [1.2.0](https://github.com/mofukuru/auto-file-organizer/releases/tag/1.2.0) |
| `copy-file-to-clipboard` | [1.0.0](https://github.com/EzXabi/copy-file-to-clipboard/releases/tag/1.0.0) |
| `dataview` | [0.5.68（发布标签 0.5.70）](https://github.com/blacksmithgu/obsidian-dataview/releases/tag/0.5.70) |
| `easy-columns` | [1.0.3](https://github.com/LazyTimee/obsidian-easy-columns/releases/tag/1.0.3) |
| `excalidraw-extras` | [0.2.1](https://github.com/zsviczian/obsidian-excalidraw-extras/releases/tag/0.2.1) |
| `external-file-card` | [0.0.10](https://github.com/James-Yu/external-file-card/releases/tag/0.0.10) |
| `foldermate` | [1.1.1](https://github.com/droidstreamer/foldermate/releases/tag/1.1.1) |
| `image-converter` | [1.4.6](https://github.com/xRyul/obsidian-image-converter/releases/tag/1.4.6) |
| `janitor` | [1.2.0](https://github.com/Canna71/obsidian-janitor/releases/tag/1.2.0) |
| `notion-bases` | [1.13.0](https://github.com/bgarciamoura/obsidian-notion-bases-plugin/releases/tag/1.13.0) |
| `obsidian-excalidraw-plugin` | [2.29.2](https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.29.2) |
| `obsidian-importer` | [3.2.0](https://github.com/obsidianmd/obsidian-importer/releases/tag/3.2.0) |
| `obsidian-tasks-plugin` | [8.6.0](https://github.com/obsidian-tasks-group/obsidian-tasks/releases/tag/8.6.0) |
| `powertables` | [1.60.0](https://github.com/obsidian-power-plugins/obsidian-power-tables/releases/tag/1.60.0) |
| `print-studio` | [0.4.7](https://github.com/5krus/obsidian-print-studio/releases/tag/0.4.7) |
| `universal-reader` | [0.8.1](https://github.com/ProgrammedByGod/universal-reader/releases/tag/0.8.1) |
| `webdav-explorer` | [1.0.5](https://github.com/sunmagicshow/obsidian-webdav/releases/tag/1.0.5) |

</details>

### 同图封面与正文缩放

2026-11-18，在 macOS 的 dev-vault 中使用 Obsidian 1.15.1 和 Image Converter 1.4.6。窗格宽 931 px，封面宽度设为 90%。封面与正文引用同一张 320 × 160 PNG。在 Live Preview 将正文图片设为居中，拖动右下角手柄，把宽度从 240 调到 336 px。关闭标签后在新标签打开同一篇笔记，由 Image Converter 自动恢复对齐。

| 观察项 | 0.4.0 原版 | 图片隔离后的开发构建 |
| --- | --- | --- |
| 设置居中前悬停 72 帧 | 320 与 837.9 px 间跳变 64 次 | 837.9 px，0 次跳变 |
| 正文拖动结束时的封面宽度 | 837.9 px | 837.9 px |
| 关闭标签、重新打开后的封面宽度 | 336 px | 837.9 px |
| 重开后的正文图片 | 居中，336 px | 居中，336 px |

原版与隔离原型按相反顺序做过两轮对照。随后在部署的开发构建上用原生鼠标输入再验证两轮，重开笔记以及切至阅读视图后，封面均保持 837.9 px。测试前后的附件 SHA-256 一致，正文嵌入链接保存了 `|336x168`，Image Converter 的笔记对齐缓存记录了居中和显示宽高。Banner 集成套件另在阅读视图和 Live Preview 检查同图的独立宽度、鼠标命中以及封面显隐。

## 逐笔记封面宽度（2026-11-18）

在 macOS 的 Obsidian 1.15.1、dev-vault 中，全库宽度设为 90% 时，`patch-banner-width: 65` 在阅读视图和 Live Preview 均得到 65% 的居中封面。通过 Live Preview 编辑器改为 `"75%"` 后，现有图片立即调整宽度。保存、关闭并在阅读视图重开后，仍为 75%。

将库宽度调为 80%，在两个 458 px 的并排窗格查看同一附件。带覆盖值的笔记封面宽 343.5 px（75%），继承库设置的笔记封面宽 366.4 px（80%）。通过 Obsidian 属性接口把覆盖值改为 `101` 后回退到 80%，改为 `55` 后得到 55%，删除属性后两种视图都恢复 80%。

本轮 Banner 集成通过 93 项检查，按 `--skip-playback` 跳过 MP4/WebM 自动播放与手动暂停组。一次运行中既有的长笔记滚动检查观察到 60 px 的滚动动作实际前进 65 px，同一构建按原断言复测通过。
