import { JSDOM } from 'jsdom'

export function cssComments(text, offset = 0) {
  const comments = []
  let quote = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\\') {
      index++
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    // 非引号地址中的斜杠和星号属于地址内容，不是样式说明注释。
    const url = /^url\(\s*/iu.exec(text.slice(index))
    if (url && !/[\w-]/u.test(text[index - 1] ?? '')) {
      const start = index + url[0].length
      if (text[start] !== '"' && text[start] !== "'") {
        index = start
        while (index < text.length && text[index] !== ')') {
          if (text[index] === '\\') index++
          index++
        }
        continue
      }
    }
    if (char !== '/' || text[index + 1] !== '*') continue
    const end = text.indexOf('*/', index + 2)
    const stop = end === -1 ? text.length : end + 2
    comments.push({
      type: 'Block',
      value: text.slice(index + 2, end === -1 ? text.length : end),
      range: [offset + index, offset + stop],
    })
    index = stop - 1
  }
  return comments
}

/** 使用浏览器文档解析边界，避免将属性、字符串和原始文本误判为注释。 */
export function htmlParts(text) {
  const dom = new JSDOM(text, { includeNodeLocations: true })
  const comments = []
  const scripts = []
  function visit(node) {
    const location = dom.nodeLocation(node)
    if (node.nodeType === 8 && location)
      comments.push({
        type: 'Block',
        value: node.nodeValue,
        range: [location.startOffset, location.endOffset],
      })
    if (node.nodeName === 'STYLE' && location?.startTag && location.endTag) {
      const start = location.startTag.endOffset
      comments.push(...cssComments(text.slice(start, location.endTag.startOffset), start))
    }
    if (
      node.nodeName === 'SCRIPT' &&
      location?.startTag &&
      location.endTag &&
      !node.hasAttribute('src')
    ) {
      const type = node.getAttribute('type')?.trim().toLowerCase() ?? ''
      if (['', 'module', 'text/javascript', 'application/javascript'].includes(type)) {
        const start = location.startTag.endOffset
        scripts.push(
          text.slice(0, start).replace(/[^\r\n]/g, ' ') +
            text.slice(start, location.endTag.startOffset),
        )
      }
    }
    for (const child of node.childNodes) visit(child)
    if (node.nodeName === 'TEMPLATE') visit(node.content)
  }
  visit(dom.window.document)
  dom.window.close()
  return { comments, scripts }
}

function loc(text, index) {
  const lines = text.slice(0, index).split(/\r\n|\r|\n/u)
  return { line: lines.length, column: lines.at(-1).length }
}

/** 文本入口仅提供注释与原文，脚本继续交给原有语言解析器检查。 */
export const textParser = {
  parseForESLint(text, options) {
    const comments = options.filePath.endsWith('.css')
      ? cssComments(text)
      : htmlParts(text).comments
    const range = [0, text.length]
    const position = { start: loc(text, 0), end: loc(text, text.length) }
    for (const comment of comments)
      comment.loc = { start: loc(text, comment.range[0]), end: loc(text, comment.range[1]) }
    return {
      ast: {
        type: 'Program',
        body: [],
        sourceType: 'module',
        range,
        loc: position,
        tokens: [],
        comments,
      },
    }
  },
}

export const htmlProcessor = {
  meta: { name: '中文规范页面脚本' },
  preprocess(text) {
    return [
      text,
      ...htmlParts(text).scripts.map((script, index) => ({
        text: script,
        filename: `inline-${index}.js`,
      })),
    ]
  },
  postprocess(results) {
    const messages = new Map()
    for (const result of results)
      for (const message of result)
        messages.set(
          `${message.ruleId}:${message.line}:${message.column}:${message.message}`,
          message,
        )
    return [...messages.values()].sort((a, b) => a.line - b.line || a.column - b.column)
  },
}
