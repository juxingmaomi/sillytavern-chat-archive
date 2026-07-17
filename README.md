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

## 安装

仓库地址：

```text
https://github.com/juxingmaomi/sillytavern-chat-archive
```

### 第一步：安装前端扩展

1. 启动 SillyTavern。
2. 打开顶部的“扩展程序”面板。
3. 点击“安装扩展程序”。
4. 输入仓库地址：

   ```text
   https://github.com/juxingmaomi/sillytavern-chat-archive
   ```

5. 确认安装，等待酒馆提示安装完成。

不要下载压缩包，也不要手动把文件复制到扩展目录。

### 第二步：启用服务器插件

关闭 SillyTavern，然后打开 SillyTavern 根目录中的 `config.yaml`，确认包含：

```yaml
enableServerPlugins: true
```

可选：允许服务器插件在启动时自动更新：

```yaml
enableServerPluginsAutoUpdate: true
```

服务器插件不受浏览器沙箱保护，只应安装可信来源的插件。

### 第三步：使用官方命令安装服务器插件

在 SillyTavern 根目录打开终端，运行：

```bash
node plugins.js install https://github.com/juxingmaomi/sillytavern-chat-archive.git
```

这是 SillyTavern 自带的服务器插件安装命令。不要手动复制项目到 `plugins` 文件夹。

### 第四步：重启并刷新

1. 重新启动 SillyTavern。
2. 终端出现以下内容，表示后端加载成功：

   ```text
   [Chat Archive] Server plugin loaded.
   ```

3. 在浏览器按 `Ctrl + F5` 强制刷新。
4. 返回酒馆首页，即可看到置顶聊天、最近聊天和角色归档。

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
