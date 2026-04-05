#!/bin/bash

# Claude Code CN 安装脚本
# 安装后可以在全局终端使用 'claude' 命令

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取脚本所在目录的绝对路径（脚本在项目根目录）
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Claude Code CN 安装脚本${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 检查操作系统
OS="$(uname -s)"
case "$OS" in
    Darwin*)
        INSTALL_DIR="/usr/local/bin"
        ;;
    Linux*)
        INSTALL_DIR="/usr/local/bin"
        ;;
    *)
        echo -e "${RED}不支持的操作系统: $OS${NC}"
        exit 1
        ;;
esac

# 检查 bun 是否安装
echo -e "${YELLOW}[1/4] 检查 bun 是否安装...${NC}"
if ! command -v bun &> /dev/null; then
    echo -e "${RED}错误: bun 未安装${NC}"
    echo -e "${YELLOW}请先安装 bun:${NC}"
    echo "  curl -fsSL https://bun.sh/install | bash"
    echo "  或访问: https://bun.sh"
    exit 1
fi
echo -e "${GREEN}✓ bun 已安装: $(bun --version)${NC}"

# 安装项目依赖
echo ""
echo -e "${YELLOW}[2/4] 安装项目依赖...${NC}"
cd "$PROJECT_DIR"
bun install
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 创建 claude 命令脚本
echo ""
echo -e "${YELLOW}[3/4] 创建 claude 命令...${NC}"

# 创建一个包装脚本
WRAPPER_SCRIPT="$PROJECT_DIR/bin/claude"
cat > "$WRAPPER_SCRIPT" << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

# 保存用户当前的工作目录
USER_CWD="$(pwd)"

# 获取脚本的真实路径（解析软链接）
SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
done

# 获取项目根目录
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
cd "$ROOT_DIR"

# Force recovery CLI (simple readline REPL, no Ink TUI)
if [[ "${CLAUDE_CODE_FORCE_RECOVERY_CLI:-0}" == "1" ]]; then
  exec bun --env-file=.env ./src/localRecoveryCli.ts "$@"
fi

# Default: full CLI with Ink TUI
# 通过环境变量传递用户的工作目录
export CLAUDE_USER_CWD="$USER_CWD"
exec bun --env-file=.env ./src/entrypoints/cli.tsx "$@"
EOF

chmod +x "$WRAPPER_SCRIPT"
echo -e "${GREEN}✓ 创建 claude 包装脚本${NC}"

# 创建全局软链接
echo ""
echo -e "${YELLOW}[4/4] 创建全局命令链接...${NC}"
echo -e "${BLUE}目标目录: $INSTALL_DIR${NC}"

# 检查是否需要 sudo
if [ -w "$INSTALL_DIR" ]; then
    SUDO=""
else
    echo -e "${YELLOW}需要管理员权限来创建全局命令${NC}"
    SUDO="sudo"
fi

# 移除旧的链接（如果存在）
if [ -L "$INSTALL_DIR/claude" ] || [ -f "$INSTALL_DIR/claude" ]; then
    echo -e "${YELLOW}移除旧的 claude 命令...${NC}"
    $SUDO rm -f "$INSTALL_DIR/claude"
fi

# 创建新的软链接
$SUDO ln -s "$WRAPPER_SCRIPT" "$INSTALL_DIR/claude"
echo -e "${GREEN}✓ 全局命令创建成功${NC}"

# 验证安装
echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${GREEN}✓ 安装完成！${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${GREEN}现在您可以在任意目录使用以下命令:${NC}"
echo -e "  ${YELLOW}claude${NC}        - 启动 Claude Code CN"
echo -e "  ${YELLOW}claude --help${NC}  - 查看帮助信息"
echo ""
echo -e "${BLUE}项目目录: $PROJECT_DIR${NC}"
echo -e "${BLUE}命令位置: $INSTALL_DIR/claude${NC}"
echo ""
echo -e "${YELLOW}提示: 如果命令不可用，请重新打开终端或执行:${NC}"
echo -e "  source ~/.bashrc  # 或 source ~/.zshrc"
echo ""

# 测试命令是否可用
if command -v claude &> /dev/null; then
    echo -e "${GREEN}✓ claude 命令已可用${NC}"
else
    echo -e "${YELLOW}⚠ claude 命令尚未在当前 shell 中生效${NC}"
    echo -e "${YELLOW}请重新打开终端窗口${NC}"
fi
