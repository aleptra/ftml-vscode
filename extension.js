const vscode = require('vscode')
const path = require('path')
const fs = require('fs')

let attributeData = {}
let allAttributes = []
let diagnosticCollection

function loadAttributes(context) {
  const jsonPath = path.join(context.extensionPath, 'ftml-attributes.json')
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8')
    attributeData = JSON.parse(raw)
    allAttributes = []
    for (const category in attributeData) {
      for (const attr of attributeData[category]) {
        attr._category = category
        allAttributes.push(attr)
      }
    }
  } catch (e) {
    console.error('FTML: Failed to load attributes JSON', e)
  }
}

function activate(context) {
  loadAttributes(context)
  console.log('FTML IntelliSense activated — loaded', allAttributes.length, 'attributes')

  diagnosticCollection = vscode.languages.createDiagnosticCollection('ftml')
  context.subscriptions.push(diagnosticCollection)

  // Autocomplete provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    'html',
    {
      provideCompletionItems(document, position) {
        const lineText = document.lineAt(position).text
        const textBefore = lineText.substring(0, position.character)

        // Only suggest inside an opening tag
        const tagMatch = textBefore.match(/<[a-z][^>]*$/i)
        if (!tagMatch) return []

        // Check if we're in attribute name position (not inside a value)
        const inValue = (textBefore.match(/"/g) || []).length % 2 === 1
        if (inValue) return []

        // Get what the user is currently typing (partial attribute name)
        // Match after space, after closing quote, or at start of attributes
        const typingMatch = textBefore.match(/(?:\s|"|')([a-z][a-z0-9-]*)$/i)
        const typing = typingMatch ? typingMatch[1].toLowerCase() : ''

        const items = []
        for (const attr of allAttributes) {
          const item = new vscode.CompletionItem(attr.name, vscode.CompletionItemKind.Property)
          item.detail = `FTML · ${attr._category}`
          item.documentation = new vscode.MarkdownString(attr.description)

          if (attr.values) {
            const choices = attr.values.join(',')
            item.insertText = new vscode.SnippetString(`${attr.name}="\${1|${choices}|}"`)
          } else {
            item.insertText = new vscode.SnippetString(`${attr.name}="$1"`)
          }

          item.filterText = attr.name
          item.sortText = `!0_${attr.name}`
          item.preselect = false

          if (typing) {
            const startPos = position.translate(0, -typing.length)
            item.range = new vscode.Range(startPos, position)
          }

          items.push(item)
        }

        return new vscode.CompletionList(items, false)
      }
    },
    ' ', '\n', '"', ...Array.from('abcdefghijklmnopqrstuvwxyz') // Trigger on space, newline, closing quote, and all letters
  )

  // Validation on save and open
  const validateDocument = (document) => {
    const config = vscode.workspace.getConfiguration('ftml')
    if (!config.get('enableValidation', true)) {
      diagnosticCollection.delete(document.uri)
      return
    }

    if (document.languageId !== 'html') return

    const text = document.getText()
    const diagnostics = []
    const attrNames = new Set(allAttributes.map(a => a.name))

    // Standard HTML attributes to ignore
    const htmlAttrs = new Set([
      'id', 'class', 'style', 'href', 'src', 'alt', 'title', 'type', 'name',
      'value', 'placeholder', 'action', 'method', 'target', 'rel', 'for',
      'tabindex', 'role', 'aria-label', 'aria-hidden', 'aria-describedby',
      'lang', 'charset', 'content', 'http-equiv', 'defer', 'async',
      'crossorigin', 'integrity', 'loading', 'decoding', 'fetchpriority',
      'width', 'height', 'min', 'max', 'step', 'pattern', 'required',
      'disabled', 'checked', 'selected', 'readonly', 'multiple', 'autofocus',
      'autocomplete', 'novalidate', 'enctype', 'accept', 'cols', 'rows',
      'colspan', 'rowspan', 'scope', 'headers', 'open', 'hidden', 'draggable',
      'contenteditable', 'spellcheck', 'translate', 'dir', 'slot', 'is',
      'xmlns', 'version', 'viewBox', 'fill', 'stroke', 'd', 'cx', 'cy', 'r',
      'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
      'media', 'sizes', 'srcset', 'download', 'ping', 'referrerpolicy',
      'sandbox', 'allow', 'allowfullscreen', 'frameborder', 'srcdoc',
      'module', 'plugin', 'onload', 'onerror', 'onsubmit', 'onclick',
      'onchange', 'oninput', 'onkeyup', 'onkeydown', 'onfocus', 'onblur',
      'onformsubmit', 'ontoggle'
    ])

    // Patterns to allow (dynamic attributes)
    const dynamicPatterns = [
      /^data-/,       // all data- are valid (handled by FTML data module)
      /^screen-/,     // responsive breakpoints
      /^on\w+load$/,  // ongetload, onsetload, etc.
      /^on\w+if$/,    // onmouseoverif, etc.
      /^aria-/,       // accessibility
      /^wave-/,       // wave plugin config
      /^particles-/,  // particles plugin config
      /^navigate-/,   // navigate module config
      /^canvas-/,     // canvas module config
      /^globalize-/,  // globalize module config
      /^storage-/,    // storage module config
      /^readingtime-/, // readingtime plugin
      /^scrollbar-/,  // scrollbar plugin
      /^\w+--\w+$/    // plugin--method pattern
    ]

    // Find attributes in tags
    const tagRegex = /<[a-z][a-z0-9]*([^>]*)>/gi
    let tagMatch

    while ((tagMatch = tagRegex.exec(text)) !== null) {
      const attrStr = tagMatch[1]
      const tagStart = tagMatch.index

      // Parse attributes from the tag
      const attrRegex = /\s([a-z][a-z0-9_-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/gi
      let attrMatch

      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        const attrName = attrMatch[1].toLowerCase()

        // Skip known attributes
        if (attrNames.has(attrName)) continue
        if (htmlAttrs.has(attrName)) continue
        if (dynamicPatterns.some(p => p.test(attrName))) continue

        // Unknown attribute — add warning
        const attrOffset = tagStart + tagMatch[0].indexOf(attrMatch[0]) + attrMatch[0].indexOf(attrMatch[1])
        const startPos = document.positionAt(attrOffset)
        const endPos = document.positionAt(attrOffset + attrName.length)

        const diag = new vscode.Diagnostic(
          new vscode.Range(startPos, endPos),
          `Unknown FTML attribute: "${attrName}"`,
          vscode.DiagnosticSeverity.Warning
        )
        diag.source = 'FTML'
        diagnostics.push(diag)
      }
    }

    diagnosticCollection.set(document.uri, diagnostics)
  }

  // Run on open and save
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(validateDocument),
    vscode.workspace.onDidSaveTextDocument(validateDocument),
    vscode.workspace.onDidChangeTextDocument(e => validateDocument(e.document)),
    completionProvider
  )

  // Validate all open documents
  vscode.workspace.textDocuments.forEach(validateDocument)
}

function deactivate() {
  if (diagnosticCollection) diagnosticCollection.dispose()
}

module.exports = { activate, deactivate }
