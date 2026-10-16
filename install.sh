#!/usr/bin/env bash
# Controll-D Standalone Installer for Linux & macOS
# Installs Controll-D and configures uinput permissions in a single command.

set -e

INSTALL_DIR="${HOME}/.local/share/controll-d"
LEGACY_DIR="${HOME}/.local/share/cotrll-d"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
REPO_URL="https://github.com/WatashiAD/Controll-D.git"
TARBALL_URL="https://github.com/WatashiAD/Controll-D/archive/refs/heads/main.tar.gz"

echo "🎮 Installing Controll-D v1.0..."

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
echo "📦 Downloading Controll-D into ${INSTALL_DIR}..."

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

# Migrate legacy directory if exists
if [ -d "${LEGACY_DIR}" ] && [ ! -L "${LEGACY_DIR}" ]; then
  rm -rf "${LEGACY_DIR}"
  ln -sf "${INSTALL_DIR}" "${LEGACY_DIR}"
fi

# 3. Install production dependencies
echo "📦 Installing dependencies..."
(cd "${INSTALL_DIR}" && npm install --omit=dev --no-audit --no-fund --quiet)

# 4. Configure Linux uinput permissions
if [ "$(uname)" = "Linux" ]; then
  if [ ! -w /dev/uinput ]; then
    echo "⚙️  Configuring /dev/uinput permissions for virtual gamepad..."
    UDEV_RULE='KERNEL=="uinput", MODE="0660", GROUP="input", TAG+="uaccess"'
    RULE_FILE="/etc/udev/rules.d/99-controll-d.rules"
    LEGACY_RULE="/etc/udev/rules.d/99-cotrll-d.rules"

    if [ ! -f "$RULE_FILE" ]; then
      if command -v sudo >/dev/null 2>&1; then
        echo "   (sudo requested to install udev rule to $RULE_FILE)"
        echo "$UDEV_RULE" | sudo tee "$RULE_FILE" >/dev/null
        [ -f "$LEGACY_RULE" ] && sudo rm -f "$LEGACY_RULE" || true
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
cat << 'EOF' > "${BIN_DIR}/controll-d"
#!/usr/bin/env sh
exec node "${HOME}/.local/share/controll-d/server/main.mjs" "$@"
EOF
chmod +x "${BIN_DIR}/controll-d"

# Symlink legacy cotrll-d command to controll-d
ln -sf "${BIN_DIR}/controll-d" "${BIN_DIR}/cotrll-d"

# 6. Create Desktop Entry (Linux)
if [ "$(uname)" = "Linux" ]; then
  mkdir -p "${DESKTOP_DIR}"
  cat << EOF > "${DESKTOP_DIR}/controll-d.desktop"
[Desktop Entry]
Name=Controll-D
Comment=Wireless Virtual Gamepad for PC
Exec=${BIN_DIR}/controll-d
Terminal=true
Type=Application
Categories=Game;Utility;
EOF
  chmod +x "${DESKTOP_DIR}/controll-d.desktop"
  [ -f "${DESKTOP_DIR}/cotrll-d.desktop" ] && rm -f "${DESKTOP_DIR}/cotrll-d.desktop" || true
fi

# 7. Check PATH
case ":$PATH:" in
  *":${BIN_DIR}:"*) ;;
  *)
    echo "💡 Note: Ensure ${BIN_DIR} is in your PATH to run 'controll-d' directly:"
    echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo ""
echo "✨ Controll-D installation complete!"
echo "   Launch command : ${BIN_DIR}/controll-d"
echo "   Or simply type : controll-d"
echo ""

# 8. Launch if running interactively
if [ -t 0 ]; then
  read -p "🚀 Start Controll-D now? (Y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    if fuser 8765/tcp >/dev/null 2>&1; then
      echo "⚠️  Port 8765 is already in use by an active Controll-D instance."
      echo "   Restarting instance..."
      fuser -k 8765/tcp >/dev/null 2>&1 || true
      sleep 1
    fi
    exec "${BIN_DIR}/controll-d"
  fi
fi
