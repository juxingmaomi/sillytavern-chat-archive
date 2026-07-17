# 角色聊天档案

适用于 SillyTavern 1.16.0 及以上版本的聊天归档扩展。

## 兼容性

- 最低支持版本：SillyTavern `1.16.0`。
- 已实测版本：SillyTavern `1.16.0 'release' (c536bfc7f)`，Windows 本地部署。
- 需要在 `config.yaml` 中启用 `enableServerPlugins: true`。
- 不建议在 1.16.0 以前的版本安装：旧版首页结构和 `accountStorage` 等前端接口可能不同。
- 服务器端 JSONL 尾部读取不依赖特定预设或消息正文标签；前端首页结构若在未来酒馆版本中变化，可能需要跟随更新。

它把酒馆首页原本平铺的聊天文件改成：

- 最多 3 个独立聊天文件置顶快捷入口。
- 置顶下方显示最近一次打开的聊天文件快捷入口。
- 其余聊天按角色卡归档，一个角色只占一行。
- 点击角色后，在弹窗中展示该角色的全部聊天文件。
- 点击聊天文件时，仅从服务器读取最后两条有效对话消息。
- 可在归档列表中删除聊天；删除最后一个聊天时会清理空目录。
- 用户消息显示在右侧，角色消息显示在左侧。
- 预览不会切换当前聊天；只有点击“打开聊天”时才进入聊天。

## 为什么需要服务器插件

酒馆原生 `/api/chats/get` 会把完整聊天文件发送给浏览器。对于几十 MB 的分支聊天，仅为了预览两条消息而读取整个文件会很慢。

本项目的服务器插件从 JSONL 文件末尾分块读取，找到最后两条非系统的用户/角色消息后立即停止，不加载整份聊天历史。

服务器插件不会连接外部服务，也不会把聊天内容上传到其他地方。

## 项目结构

同一个目录同时是服务器插件和前端扩展：

```text
chat-archive/
├─ index.js          # SillyTavern 服务器插件
├─ package.json
├─ manifest.json     # SillyTavern 前端扩展清单
├─ ui/
│  ├─ index.js       # 首页归档和预览界面
│  └─ style.css
└─ test/
```

## 安装服务器插件

1. 确认 SillyTavern 的 `config.yaml` 中包含：

   ```yaml
   enableServerPlugins: true
   ```

2. 将整个项目目录放到 SillyTavern 的 `plugins/chat-archive`：

   ```text
   SillyTavern/
   └─ plugins/
      └─ chat-archive/
         ├─ index.js
         ├─ package.json
         └─ ...
   ```

3. 重启 SillyTavern。终端出现以下文字表示服务器插件已加载：

   ```text
   [Chat Archive] Server plugin loaded.
   ```

## 安装前端扩展

将同一个项目目录安装为第三方扩展。最终目录应类似：

```text
SillyTavern/data/default-user/extensions/chat-archive/
├─ manifest.json
├─ ui/
│  ├─ index.js
│  └─ style.css
└─ ...
```

也可以在酒馆的“安装扩展”中填写：

```text
https://github.com/juxingmaomi/sillytavern-chat-archive
```

服务器插件可以在 SillyTavern 根目录执行：

```bash
git clone https://github.com/juxingmaomi/sillytavern-chat-archive.git plugins/chat-archive
```

安装完成后刷新酒馆首页。服务器插件可用时，原来的最近聊天列表会替换为“置顶聊天”和“角色归档”。

如果只安装了前端扩展而没有服务器插件，原来的酒馆首页不会被隐藏，并会显示服务器插件未启用的提示。

## 置顶

扩展复用 SillyTavern 原生账户存储中的 `pinnedChats` 数据：

- 已有置顶聊天可以继续显示。
- 最多显示和新增 3 个置顶聊天。
- 置顶状态跟随当前 SillyTavern 账户数据保存，不使用单独的浏览器 `localStorage`。

## 接口

服务器插件注册以下当前账户专用接口：

- `GET /api/plugins/chat-archive/health`
- `POST /api/plugins/chat-archive/catalog`
- `POST /api/plugins/chat-archive/chats`
- `POST /api/plugins/chat-archive/pinned`
- `POST /api/plugins/chat-archive/preview`
- `POST /api/plugins/chat-archive/delete`

所有文件路径都限制在当前 SillyTavern 用户的角色聊天目录中，并拒绝目录穿越文件名。

## 开发验证

```bash
node --check index.js
node --check ui/index.js
node --test test/*.test.js
```

## 许可

MIT

