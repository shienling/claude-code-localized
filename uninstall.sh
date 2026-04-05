#!/bin/bash

# Claude Code CN 卸载脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Claude Code CN 卸载脚本${NC}"
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

# 检查是否需要 sudo
if [ -w "$INSTALL_DIR" ]; then
    SUDO=""
else
    SUDO="sudo"
fi

# 移除全局命令
echo -e "${YELLOW}[1/2] 移除全局命令...${NC}"
if [ -L "$INSTALL_DIR/claude" ] || [ -f "$INSTALL_DIR/claude" ]; then
    $SUDO rm -f "$INSTALL_DIR/claude"
    echo -e "${GREEN}✓ 已移除 claude 命令${NC}"
else
    echo -e "${YELLOW}⚠ claude 命令不存在${NC}"
fi

# 询问是否删除项目文件
echo ""
echo -e "${YELLOW}[2/2] 清理项目文件...${NC}"
read -p "是否删除项目依赖 (node_modules)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
    
    echo -e "${YELLOW}删除 node_modules...${NC}"
    rm -rf "$PROJECT_DIR/node_modules"
    echo -e "${GREEN}✓ 已删除 node_modules${NC}"
fi

echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${GREEN}✓ 卸载完成！${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${YELLOW}提示: 项目文件仍保留在原位置${NC}"
echo -e "${YELLOW}如需完全删除，请手动删除项目目录${NC}"
