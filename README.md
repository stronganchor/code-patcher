# AI Code Patcher - VS Code Extension

Apply AI-generated code changes to your codebase with intelligent fuzzy matching.

## Features

- 🎯 **Smart Matching**: Finds code blocks even with minor differences
- 🔍 **Fuzzy Search**: Handles typos and small variations in search blocks
- 📊 **Confidence Scoring**: Ranks matches by similarity
- 🔄 **Multiple Match Support**: Choose between multiple locations when code appears in several places
- ↔️ **Indentation Handling**: Automatically adjusts indentation to match your code style
- 👁️ **Preview Changes**: See what will change before applying
- ⌨️ **Keyboard Shortcuts**: Quick access via `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)

## Installation & Setup

### 1. Create Project Structure

```
ai-code-patcher/
├── src/
│   ├── extension.ts        # Main extension file
│   └── codePatcher.ts      # Core patcher engine (from Phase 2)
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Copy Core Engine

Copy the `codePatcher.ts` file from Phase 2 into the `src/` directory. Make sure to export the necessary types and classes.

### 4. Compile TypeScript

```bash
npm run compile
```

### 5. Test in VS Code

1. Open the project folder in VS Code
2. Press `F5` to launch Extension Development Host
3. A new VS Code window will open with your extension loaded

## Usage

### Format for AI Code Changes

Instruct your AI to output changes in this format:

```
<<<<<<< SEARCH
function oldCode() {
  // existing code to find
}
=======
function oldCode() {
  // new code to replace with
}
>>>>>>> REPLACE
```

### Applying Patches

#### Method 1: From Clipboard (Recommended)

1. Copy the patch from your AI chat
2. Open the file you want to patch in VS Code
3. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)
4. Or use Command Palette: `AI Code Patcher: Apply Patch from Clipboard`

#### Method 2: Manual Input

1. Open the file you want to patch
2. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Type "AI Code Patcher: Apply Patch"
4. Paste your patch into the input box

### Handling Multiple Matches

If the code block appears in multiple locations:

1. A quick pick menu will show all matches with:
   - Line number
   - Confidence score
   - Similarity percentage
   - Code preview
2. Select the correct location
3. Preview the changes
4. Confirm to apply

### Single Match Behavior

When only one match is found:
- Shows a preview dialog
- Click "Apply" to confirm or "Cancel" to abort
- Enable `autoApplySingleMatch` in settings to skip confirmation

## Configuration

Access settings via: `File > Preferences > Settings > Extensions > AI Code Patcher`

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fuzzyMatch` | boolean | `true` | Enable fuzzy matching for finding code blocks |
| `minConfidence` | number | `0.7` | Minimum confidence threshold (0.0 - 1.0) |
| `contextLines` | number | `2` | Number of context lines to show around matches |
| `autoApplySingleMatch` | boolean | `false` | Auto-apply when only one match is found |

### Example Settings

```json
{
  "aiCodePatcher.fuzzyMatch": true,
  "aiCodePatcher.minConfidence": 0.8,
  "aiCodePatcher.contextLines": 3,
  "aiCodePatcher.autoApplySingleMatch": true
}
```

## Advanced Usage

### Working with AI Tools

**For ChatGPT / Claude:**
```
When making code changes, please format them as:
<<<<<<< SEARCH
[exact code to find]
=======
[replacement code]
>>>>>>> REPLACE

Make sure to include enough context (3-5 lines) so the code block is unique.
```

**Tips for Better Results:**
- Include enough context to make the search block unique
- If code appears multiple times, include more surrounding lines
- The search block doesn't need perfect indentation
- Minor typos are okay with fuzzy matching enabled

### Adjusting Confidence Threshold

If matches aren't being found:
- Lower `minConfidence` (try 0.6 or 0.5)
- Ensure fuzzy matching is enabled

If too many false positives:
- Raise `minConfidence` (try 0.85 or 0.9)
- Include more context in your search block

## Troubleshooting

### "No matches found"
- ✓ Ensure the search block exists in the file
- ✓ Try lowering `minConfidence`
- ✓ Check that fuzzy matching is enabled
- ✓ Verify the search block has enough unique content

### Multiple incorrect matches
- ✓ Include more context lines in the search block
- ✓ Raise `minConfidence`
- ✓ Make the search block more specific

### Indentation issues
- ✓ The extension automatically handles indentation
- ✓ Just ensure your replace block is consistently indented
- ✓ Tabs vs spaces are detected automatically

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `AI Code Patcher: Apply Patch` | None | Apply patch with manual input |
| `AI Code Patcher: Apply Patch from Clipboard` | `Ctrl+Shift+V` (Win/Linux)<br>`Cmd+Shift+V` (Mac) | Apply patch from clipboard |

## Development

### Building
```bash
npm run compile
```

### Watching for Changes
```bash
npm run watch
```

### Testing
```bash
npm test
```

### Packaging
```bash
npm install -g @vscode/vsce
vsce package
```

This creates a `.vsix` file you can install or share.

## Roadmap

- [ ] Multi-file patch support
- [ ] Git integration (show as diffs)
- [ ] Batch operations
- [ ] Custom patch format support
- [ ] Language-aware matching
- [ ] Undo/redo history

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.

## License

MIT License - feel free to use and modify.

## Credits

Built to streamline AI-assisted development workflows.
