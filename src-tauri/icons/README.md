# Icons

Tauri requires platform-specific icon formats:

- `32x32.png`, `128x128.png`, `128x128@2x.png` — PNGs for Linux
- `icon.icns` — macOS bundle icon
- `icon.ico` — Windows installer icon

To generate them from the source SVG:

```bash
# Install Tauri CLI globally if not already
npm install -g @tauri-apps/cli

# Generate all icons from icon.svg
npx tauri icon icon.svg
```

The CI workflow will run this automatically before building.
