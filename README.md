# FTML IntelliSense

Autocomplete and validation for FTML (Front Template Markup Language) attributes in VS Code.

## Features

- **Autocomplete**: Start typing inside an HTML tag to get FTML attribute suggestions with descriptions and value options.
- **Validation**: Warns about unknown attributes that aren't standard HTML or recognized FTML.
- **Categorized**: Suggestions are grouped by category (layout, styling, data, events, etc.).

## Installation

```bash
cd dist/ftml-vscode
npm install vscode --save-dev   # only needed for packaging
npx vsce package                # creates .vsix file
code --install-extension ftml-intellisense-0.1.0.vsix
```

Or for development:

1. Open this folder in VS Code
2. Press F5 to launch Extension Development Host
3. Open any `.html` file to see suggestions

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ftml.enableValidation` | `true` | Show warnings for unknown attributes |

## Updating Attributes

Edit `ftml-attributes.json` to add/remove/modify recognized attributes. The extension reads this file on activation.
