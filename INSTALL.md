# 安装说明

## 快速开始

### 安装

在项目根目录运行：

```bash
./install.sh
```

安装完成后，您可以在任意目录使用 `claude` 命令：

```bash
# 在任意目录启动 Claude Code CN
claude

# 查看帮助
claude --help

# 在特定目录工作
cd /path/to/your/project
claude
```

### 卸载

```bash
./uninstall.sh
```

## 系统要求

- **操作系统**: macOS 或 Linux
- **运行时**: [Bun](https://bun.sh)
- **权限**: 需要 sudo 权限来创建全局命令

## 安装 Bun

如果尚未安装 Bun，请运行：

```bash
curl -fsSL https://bun.sh/install | bash
```

或访问 [https://bun.sh](https://bun.sh) 查看其他安装方式。

## 工作原理

安装脚本会：

1. 检查系统依赖（bun）
2. 安装项目依赖（`bun install`）
3. 创建 `claude` 命令包装脚本
4. 在 `/usr/local/bin` 创建软链接

## 故障排除

### 命令不可用

如果安装后 `claude` 命令不可用：

1. 重新打开终端窗口
2. 或执行：`source ~/.bashrc`（或 `source ~/.zshrc`）

### 权限问题

如果遇到权限问题：

```bash
# 手动创建链接
sudo ln -s /path/to/cc-haha/bin/claude /usr/local/bin/claude
```

### Bun 未找到

确保 Bun 已正确安装并添加到 PATH：

```bash
# 检查 bun 是否可用
which bun

# 如果不可用，添加到 shell 配置
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc  # 或 ~/.zshrc
source ~/.bashrc
```

## 手动安装

如果自动安装脚本失败，可以手动安装：

```bash
# 1. 安装依赖
bun install

# 2. 创建全局链接
sudo ln -s "$(pwd)/bin/claude" /usr/local/bin/claude
```

## 更新

更新项目后，重新运行安装脚本即可：

```bash
git pull
./install.sh
```
