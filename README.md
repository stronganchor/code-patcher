# AI Code Patcher - VS Code Extension

Apply AI-generated code changes to your codebase with intelligent context-based matching.

## Features

- 🎯 **Context-Based Matching**: Just paste code with unchanged lines on either side
- 🔍 **Fuzzy Search**: Handles minor variations in code
- 📊 **Confidence Scoring**: Ranks matches by similarity
- 🔄 **Multiple Match Support**: Choose between multiple locations
- ↔️ **Indentation Handling**: Automatically adjusts indentation
- 👁️ **Preview Changes**: See what will change before applying
- ⌨️ **Keyboard Shortcuts**: Quick access via `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)

## How It Works

**Super Simple**: Just paste a code block with some context lines. The tool finds where it matches and applies the changes.

No special markers needed! Just include 1-3 unchanged lines before and after your changes for context.

## Installation & Setup

### 1. Create Project Structure

```
ai-code-patcher/
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── src/
│   ├── extension.ts
│   └── codePatcher.ts
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Compile TypeScript

```bash
npm run compile
```

### 4. Test in VS Code

1. Open the project folder in VS Code
2. Press `F5` to launch Extension Development Host
3. A new VS Code window will open with your extension loaded

## Usage

### Example: Making a Change

Say your AI suggests this change to a file:

```javascript
// If this file is called directly, abort.
if (!defined('WPINC')) {
    die;
}

// Added this comment
define('LL_TOOLS_BASE_URL', plugin_dir_url(__FILE__));
define('LL_TOOLS_BASE_PATH', plugin_dir_path(__FILE__));
```

Just **copy that entire block** and paste it using the extension. The tool will:
1. Find where those context lines match in your file
2. Show you a preview of the changes
3. Apply the new code when you confirm

### Applying Patches

#### Method 1: From Clipboard (Recommended)

1. Copy the code block from your AI chat
2. Open the file you want to patch in VS Code
3. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)
4. Review the preview
5. Click "Apply"

#### Method 2: Manual Input

1. Open the file you want to patch
2. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Type "AI Code Patcher: Apply Patch"
4. Paste your code block into the input box

### Handling Multiple Matches

If the code block matches multiple locations:

1. A quick pick menu shows all matches with:
   - Line number
   - Confidence score
   - Code preview
2. Select the correct location
3. Preview the changes
4. Confirm to apply

### Tips for Best Results

**Include Good Context:**
- Add 1-3 unchanged lines before your changes
- Add 1-3 unchanged lines after your changes
- Choose unique lines that only appear in one place

**Example - Good Context:**
```javascript
// Unique function name makes this easy to find
function processUserData(data) {
    // Changed this line
    console.log("Processing:", data);
    return data;
}
```

**Example - Poor Context:**
```javascript
// Generic line appears everywhere
console.log("Processing");
```

## Configuration

Access settings via: `File > Preferences > Settings > Extensions > AI Code Patcher`

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fuzzyMatch` | boolean | `true` | Enable fuzzy matching for finding code blocks |
| `minConfidence` | number | `0.6` | Minimum confidence threshold (0.0 - 1.0) |
| `contextLines` | number | `2` | Number of context lines to show in previews |
| `autoApplySingleMatch` | boolean | `false` | Auto-apply when only one match is found |

### Example Settings

```json
{
  "aiCodePatcher.fuzzyMatch": true,
  "aiCodePatcher.minConfidence": 0.7,
  "aiCodePatcher.contextLines": 3,
  "aiCodePatcher.autoApplySingleMatch": true
}
```

## Prompting Your AI

Tell your AI:

```
When suggesting code changes, please include 2-3 unchanged lines
before and after the changed code for context. Just paste the
code block - no special markers needed.

Example:
// context line (unchanged)
function getData() {
    // this line changed
    return newData;
}
// context line (unchanged)
```

## Troubleshooting

### "No matches found"
- ✓ Ensure the code block exists in the file
- ✓ Try lowering `minConfidence` (try 0.5 or 0.4)
- ✓ Check that fuzzy matching is enabled
- ✓ Include more context lines

### Multiple incorrect matches
- ✓ Include more unique context lines
- ✓ Choose more distinctive code for context
- ✓ Raise `minConfidence` to filter weak matches

### Confidence too low
- ✓ Make sure the context lines match exactly (or nearly)
- ✓ Lower `minConfidence` if the match is valid but scoring low
- ✓ Try including more context

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

## How the Algorithm Works

1. **Input**: You paste a code block
2. **Search**: Slides through the file comparing your block to every possible location
3. **Score**: Calculates similarity for each potential match
4. **Rank**: Sorts matches by confidence (highest first)
5. **Preview**: Shows you what will change
6. **Apply**: Replaces the matched section with your code block

The fuzzy matching handles:
- Minor typos
- Extra/missing whitespace
- Small variations in wording
- Length differences (+/- 1 line)

## License

MIT License - feel free to use and modify.

## Credits

Built to streamline AI-assisted development workflows.
