#!/usr/bin/env bash
# Cotrll-D Standalone Installer for Linux & macOS
# Installs Cotrll-D and configures uinput permissions in a single command.

set -e

INSTALL_DIR="${HOME}/.local/share/cotrll-d"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
REPO_URL="https://github.com/WatashiAD/Cotrll-D.git"
TARBALL_URL="https://github.com/WatashiAD/Cotrll-D/archive/refs/heads/main.tar.gz"

echo "🎮 Installing Cotrll-D v1.0..."

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is required but not installed."
  echo "   Please install Node.js 20+ (e.g. 'sudo pacman -S nodejs npm' or 'sudo apt install nodejs npm') and re-run."
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "⚠️  Warning: Node.js 20 or higher is recommended (detected v$(node -v))."
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required but not installed."
  exit 1
fi

# 2. Download / Clone
mkdir -p "${INSTALL_DIR}"
echo "📦 Downloading Cotrll-D into ${INSTALL_DIR}..."

if command -v git >/dev/null 2>&1; then
  if [ -d "${INSTALL_DIR}/.git" ]; then
    (cd "${INSTALL_DIR}" && git pull --quiet origin main 2>/dev/null || true)
  else
    rm -rf "${INSTALL_DIR}"
    git clone --depth 1 --quiet "${REPO_URL}" "${INSTALL_DIR}"
  fi
else
  mkdir -p "${INSTALL_DIR}"
  curl -fsSL "${TARBALL_URL}" | tar -xz -C "${INSTALL_DIR}" --strip-components=1
fi

# 3. Install production dependencies
echo "📦 Installing dependencies..."
(cd "${INSTALL_DIR}" && npm install --omit=dev --no-audit --no-fund --quiet)

# 4. Configure Linux uinput permissions
if [ "$(uname)" = "Linux" ]; then
  if [ ! -w /dev/uinput ]; then
    echo "⚙️  Configuring /dev/uinput permissions for virtual gamepad..."
    UDEV_RULE='KERNEL=="uinput", MODE="0660", GROUP="input", TAG+="uaccess"'
    RULE_FILE="/etc/udev/rules.d/99-cotrll-d.rules"

    if [ ! -f "$RULE_FILE" ]; then
      if command -v sudo >/dev/null 2>&1; then
        echo "   (sudo requested to install udev rule to $RULE_FILE)"
        echo "$UDEV_RULE" | sudo tee "$RULE_FILE" >/dev/null
        sudo udevadm control --reload-rules || true
        sudo udevadm trigger /dev/uinput || true
        sudo usermod -aG input "$USER" 2>/dev/null || true
      else
        echo "⚠️  To allow game controller access without root, add your user to the 'input' group:"
        echo "   sudo usermod -aG input \$USER"
      fi
    fi
  fi
fi

# 5. Create CLI launcher binary
mkdir -p "${BIN_DIR}"
cat << 'EOF' > "${BIN_DIR}/cotrll-d"
#!/usr/bin/env sh
exec node "${HOME}/.local/share/cotrll-d/server/main.mjs" "$@"
EOF
chmod +x "${BIN_DIR}/cotrll-d"

# 6. Create Desktop Entry (Linux)
if [ "$(uname)" = "Linux" ]; then
  mkdir -p "${DESKTOP_DIR}"
  cat << EOF > "${DESKTOP_DIR}/cotrll-d.desktop"
[Desktop Entry]
Name=Cotrll-D
Comment=Wireless Virtual Gamepad for PC
Exec=${BIN_DIR}/cotrll-d
Terminal=true
Type=Application
Categories=Game;Utility;
EOF
  chmod +x "${DESKTOP_DIR}/cotrll-d.desktop"
fi

# 7. Check PATH
case ":$PATH:" in
  *":${BIN_DIR}:"*) ;;
  *)
    echo "💡 Note: Ensure ${BIN_DIR} is in your PATH to run 'cotrll-d' directly:"
    echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo ""
echo "✨ Cotrll-D installation complete!"
echo "   Launch command : ${BIN_DIR}/cotrll-d"
echo "   Or simply type : cotrll-d"
echo ""

# Launch if running interactively
if [ -t 0 ]; then
  read -p "🚀 Start Cotrll-D now? (Y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    exec "${BIN_DIR}/cotrll-d"
  fi
fi
