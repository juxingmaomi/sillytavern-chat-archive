# 酒馆首页文件分类

为 SillyTavern 首页增加聊天文件分类、置顶、最近聊天和快速预览功能。

项目由前端扩展和服务器插件两部分组成。两部分都安装后才能使用完整功能。

## 功能

- 按角色卡归档聊天文件，一个角色在首页只占一行。
- 点击角色后查看该角色的全部聊天文件。
- 从 JSONL 文件尾部快速读取最后两条用户/AI 消息，无需加载完整聊天。
- 复用 SillyTavern 原生置顶数据，关闭插件并恢复原生首页后，置顶仍然保留。
- 置顶聊天和最近聊天支持独立的“预览”按钮。
- 点击置顶或最近聊天的整行可直接打开聊天。
- “最近聊天”显示最后实际产生用户消息或 AI 回复的聊天文件。
- 第一次安装且没有记录时，自动显示磁盘上最后修改的聊天文件。
- 支持按最近聊天、角色名称、聊天数量或占用空间排列角色。
- 支持按修改时间、文件名或文件大小排列聊天文件。
- 可隐藏置顶、最近聊天或角色归档模块。
- 可关闭删除按钮，或要求输入完整文件名后才能删除。
- 可随时关闭插件首页功能，立即恢复 SillyTavern 原生首页。
- 删除后兼容刷新鸡尾酒+和柏宝库的角色聊天统计缓存。

## 预览原理

SillyTavern 原生聊天接口通常会读取完整聊天文件。对于几十 MB 的分支聊天，只为了预览最后两条消息而加载全部内容会很慢。

本插件的服务器端从 JSONL 文件末尾分块读取，找到最后两条有效的用户/AI 消息后立即停止。预览不会切换角色、不会打开聊天，也不会修改聊天文件。

## 数据保存位置

- 聊天文件仍保存在 SillyTavern 当前账户的聊天目录中，本插件不会复制聊天正文到其他位置。
- 置顶使用 SillyTavern 原生账户字段 `pinnedChats`。
- 插件开关、模块显示和排序设置保存在 SillyTavern 的账户存储中。
- 不使用浏览器 `localStorage` 保存上述设置。

因此，同一套 SillyTavern 数据在其他设备上访问时，可以读取相同的置顶和插件设置。

## 兼容性

- 最低声明版本：SillyTavern `1.16.0`。
- 当前主要测试版本：SillyTavern `1.18.0 release`，Windows 本地部署。
- 已检查与鸡尾酒、鸡尾酒+、柏宝箱和柏宝库共同运行。
- 需要安装 Git。
- 需要启用 SillyTavern 服务器插件。

## 安装前准备

项目地址：

```text
https://github.com/juxingmaomi/sillytavern-chat-archive
```

安装前请确认：

1. 使用的是通过 Git、压缩包或官方启动器部署的常规 SillyTavern，而不是无法安装服务器插件的纯网页托管版本。
2. 电脑已经安装 Git。在终端运行 `git --version` 应能看到版本号。
3. 电脑已经安装 Node.js。在终端运行 `node --version` 应能看到版本号。
4. 知道 SillyTavern 根目录的位置。

SillyTavern 根目录通常同时包含以下文件或文件夹：

```text
SillyTavern/
├─ Start.bat
├─ config.yaml
├─ plugins.js
├─ package.json
├─ plugins/
└─ public/
```

前端扩展和服务器插件必须分别安装。只安装其中一个，插件无法完整工作。

## 安装前端扩展

前端必须通过 SillyTavern 自带的“安装扩展程序”功能安装，不要下载 ZIP，也不要手动复制文件夹。

1. 正常启动 SillyTavern，并在浏览器打开酒馆页面。
2. 点击页面顶部的“扩展程序”图标。
3. 在扩展程序面板右上角点击“安装扩展程序”。
4. 在弹出的输入框中粘贴：

   ```text
   https://github.com/juxingmaomi/sillytavern-chat-archive
   ```

5. 点击“安装”或“确定”。
6. 等待酒馆提示扩展安装成功。安装过程中不要刷新或关闭页面。
7. 点击“管理扩展程序”，确认列表中出现：

   ```text
   酒馆首页文件分类
   ```

8. 如果列表中已经出现该名称，前端就安装完成了。此时首页可能仍提示服务器插件未启用，这是正常的，还需要继续安装后端。

### 前端安装失败

- 提示 Git 不可用：安装 Git，关闭并重新启动 SillyTavern后再试。
- 提示目录已存在：打开“管理扩展程序”，确认是否已经安装；不要重复安装。
- 提示无法连接 GitHub：检查网络或代理，然后重新点击安装。
- 安装成功但列表里没有：先按 `Ctrl + F5`，仍无效时重启 SillyTavern。

## 安装服务器插件

服务器插件使用 SillyTavern 官方提供的 `plugins.js` 命令安装，不要手动复制仓库到 `plugins` 文件夹。

### 第一步：完全关闭 SillyTavern

关闭启动 SillyTavern 的终端窗口，并确认酒馆服务已经停止。修改服务器插件配置前不要让旧进程继续运行。

### 第二步：启用服务器插件

1. 进入 SillyTavern 根目录。
2. 使用记事本、VS Code 或其他纯文本编辑器打开 `config.yaml`。
3. 搜索 `enableServerPlugins`。
4. 如果看到：

   ```yaml
   enableServerPlugins: false
   ```

   将 `false` 改成 `true`。

5. 最终应为：

   ```yaml
   enableServerPlugins: true
   ```

6. 不要重复添加多个 `enableServerPlugins`，修改已有配置即可。
7. 建议同时启用服务器插件自动更新：

   ```yaml
   enableServerPluginsAutoUpdate: true
   ```

8. 保存 `config.yaml`。

服务器插件不受浏览器沙箱保护，能够访问服务器文件系统。只应安装可信来源的服务器插件。

### 第三步：在酒馆根目录打开终端

Windows 可以使用以下任意一种方法：

1. 在文件资源管理器打开 SillyTavern 根目录。
2. 确认当前目录能看到 `Start.bat`、`config.yaml` 和 `plugins.js`。
3. 在文件夹空白处按住 `Shift` 并点击鼠标右键，选择“在此处打开 PowerShell 窗口”或“在终端中打开”。

也可以点击文件资源管理器顶部的地址栏，输入：

```text
powershell
```

然后按回车。新打开的 PowerShell 会自动位于当前文件夹。

Linux 或 macOS 用户在终端使用 `cd` 进入 SillyTavern 根目录即可。

### 第四步：确认终端位置正确

在终端运行：

```bash
node plugins.js
```

如果出现 `Usage: node plugins.js <command>`，说明位置正确。

如果提示找不到 `plugins.js`，说明终端没有位于 SillyTavern 根目录，需要先切换到正确目录。

### 第五步：运行官方安装命令

在同一个终端运行：

```bash
node plugins.js install https://github.com/juxingmaomi/sillytavern-chat-archive.git
```

等待命令执行完成。成功时会出现类似：

```text
Plugin https://github.com/juxingmaomi/sillytavern-chat-archive.git installed to plugins/sillytavern-chat-archive
```

目录名称由 SillyTavern 官方安装程序自动决定，不需要手动改名。

### 第六步：重新启动并验证后端

1. 使用原来的 `Start.bat` 或你的正常启动方式重新启动 SillyTavern。
2. 不要关闭启动终端，观察启动日志。
3. 看到以下内容表示服务器插件加载成功：

   ```text
   [Chat Archive] Server plugin loaded.
   ```

4. 如果看到 `Server plugins are disabled`，重新检查 `config.yaml` 中的 `enableServerPlugins: true`。
5. 如果没有看到加载成功提示，检查安装命令是否报错，并确认启动的是刚才安装插件的那一份 SillyTavern。

### 第七步：刷新前端

1. 回到浏览器中的 SillyTavern 页面。
2. 按 `Ctrl + F5` 强制刷新，手机可以关闭页面后重新打开。
3. 返回酒馆首页。
4. 正常情况下会出现“置顶聊天”“最近聊天”和“角色归档”。
5. 打开“扩展程序”，展开“酒馆首页文件分类”，可以调整首页模块、排序和删除保护。

## 完整安装检查

安装完成后，应同时满足以下条件：

- “管理扩展程序”中可以看到“酒馆首页文件分类”。
- SillyTavern 启动终端中出现 `[Chat Archive] Server plugin loaded.`。
- 酒馆首页出现置顶聊天、最近聊天和角色归档。
- 点击角色可以打开聊天文件列表。
- 点击“预览”可以看到最后两条消息，并且不会切换当前聊天。

## 更新

### 更新前端

1. 打开“扩展程序”。
2. 点击“管理扩展程序”。
3. 找到“酒馆首页文件分类”。
4. 点击更新。
5. 按 `Ctrl + F5` 刷新页面。

### 更新服务器插件

如果启用了：

```yaml
enableServerPluginsAutoUpdate: true
```

服务器插件会在 SillyTavern 启动时尝试自动更新。

也可以关闭 SillyTavern，在 SillyTavern 根目录运行：

```bash
node plugins.js update
```

更新后重新启动 SillyTavern。

## 使用

### 置顶聊天

- 在角色聊天文件列表中点击图钉进行置顶或取消置顶。
- 置顶数量跟随 SillyTavern 原生逻辑，不由本插件额外限制。
- 点击置顶行会直接打开聊天。
- 点击“预览”只读取最后两条消息。

### 最近聊天

- 发送用户消息或收到 AI 回复时更新。
- 只打开或浏览聊天文件不会更新。
- 第一次安装时使用磁盘上最后修改的聊天文件作为初始值。

### 删除聊天

- 删除为永久删除，不提供回收站。
- 删除最后一个聊天文件后，会清理该角色的空聊天目录。
- 不会删除角色卡。
- 建议在设置中开启“删除时需输入文件名”。

### 恢复原生首页

打开“扩展程序”中的“酒馆首页文件分类”，关闭“启用酒馆首页文件分类”。页面会立即恢复为 SillyTavern 原生首页，聊天文件和置顶不会消失。

## 常见问题

### 首页提示服务器插件未启用

检查：

1. 是否完成了前端和服务器插件两部分安装。
2. `config.yaml` 中是否为 `enableServerPlugins: true`。
3. 修改配置后是否重启了 SillyTavern。
4. 启动终端是否出现 `[Chat Archive] Server plugin loaded.`。

### 更新后界面没有变化

先重启 SillyTavern，再在浏览器按 `Ctrl + F5`。

### 预览会不会加载完整聊天

不会。服务器插件从文件末尾分块查找最后两条有效消息。

### 换设备后还能看到置顶吗

只要新设备访问的是同一套 SillyTavern 账户数据，就可以读取相同的置顶和插件设置。

## 安全说明

- 所有文件路径都限制在当前 SillyTavern 用户的聊天目录中。
- 文件名会经过校验，拒绝目录穿越路径。
- 预览为只读操作。
- 删除操作只删除选定的聊天 JSONL 文件；角色卡不会被删除。
- 服务器插件不会主动连接外部服务，也不会上传聊天内容。

## 接口

- `GET /api/plugins/chat-archive/health`
- `POST /api/plugins/chat-archive/catalog`
- `POST /api/plugins/chat-archive/chats`
- `POST /api/plugins/chat-archive/pinned`
- `POST /api/plugins/chat-archive/preview`
- `POST /api/plugins/chat-archive/delete`

## 开发验证

```bash
node --check index.js
node --check ui/index.js
node --test test/*.test.js
```

## 许可

MIT
