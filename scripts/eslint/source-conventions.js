import { cssComments } from './text-source.js'

const hasChinese = (text) => /\p{Script=Han}/u.test(text)
const milestone = /\b(?:T\d{3,}|REQ[-–]?\d+|D\d{2})\b/gu
const methods = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace', 'fatal'])

function propertyName(node) {
  return node.computed
    ? node.property.type === 'Literal' && node.property.value
    : node.property.type === 'Identifier' && node.property.name
}

function chineseMessage(node) {
  const text =
    node?.type === 'Literal' && typeof node.value === 'string'
      ? node.value
      : node?.type === 'TemplateLiteral'
        ? node.quasis.map((part) => part.value.cooked ?? '').join('')
        : ''
  return hasChinese(text)
}

/** 工具指令保留原文，普通说明必须包含中文。 */
function isDirective(text) {
  return /^\/\s*<reference\s+[^>]+\/>\s*$/u.test(text.trim())
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      milestone: '非测试代码禁止出现任务、需求或里程碑编号，请移至阶段文档或测试。',
      comment: '说明注释必须使用中文描述功能与业务意图。',
      log: '日志首个参数必须是包含中文的字符串或模板，动态数据请作为后续参数传入。',
    },
  },
  create(context) {
    const source = context.sourceCode
    const aliases = new Map()
    const bindings = []
    const calls = []
    function variable(node) {
      const template = source.ast.templateBody
      if (template && node.range[0] >= template.range[0] && node.range[1] <= template.range[1]) {
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent.type !== 'VExpressionContainer') continue
          const reference = parent.references.find((item) => item.id === node)
          if (reference?.variable) return reference.variable
          break
        }
        for (const scope of source.scopeManager.scopes) {
          if (scope.type === 'module' && scope.set.has(node.name)) return scope.set.get(node.name)
        }
      }
      for (let scope = source.getScope(node); scope; scope = scope.upper) {
        const found = scope.set.get(node.name)
        if (found) return found
      }
      return undefined
    }
    function resolve(node) {
      if (!node) return new Set()
      if (
        [
          'ChainExpression',
          'TSAsExpression',
          'TSSatisfiesExpression',
          'TSNonNullExpression',
        ].includes(node.type)
      )
        return resolve(node.expression)
      if (node.type === 'Identifier') {
        const binding = variable(node)
        if (aliases.has(binding)) return aliases.get(binding)
        if (['window', 'globalThis'].includes(node.name) && !binding?.defs.length)
          return new Set(['global'])
        if (
          ['logger', 'log'].includes(node.name) ||
          (node.name === 'console' && !binding?.defs.length)
        )
          return new Set(['logger'])
        return aliases.get(binding) ?? new Set()
      }
      if (node.type === 'MemberExpression') {
        const owner = resolve(node.object)
        const name = propertyName(node)
        if (['console', 'logger', 'log'].includes(name) && owner.has('global'))
          return new Set(['logger'])
        if (owner.has('logger') && methods.has(name)) return new Set(['method'])
      }
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        propertyName(node.callee) === 'bind'
      ) {
        const target = resolve(node.callee.object)
        if (target.has('method'))
          return new Set([
            node.arguments.length > 1
              ? chineseMessage(node.arguments[1])
                ? 'boundChinese'
                : 'boundInvalid'
              : 'method',
          ])
        return target
      }
      if (node.type === 'ConditionalExpression')
        return new Set([...resolve(node.consequent), ...resolve(node.alternate)])
      if (node.type === 'LogicalExpression')
        return new Set([...resolve(node.left), ...resolve(node.right)])
      return new Set()
    }
    function assign(pattern, values) {
      if (!values.size) return false
      if (pattern.type === 'Identifier') {
        const binding = variable(pattern)
        if (!binding) return false
        const current = aliases.get(binding) ?? new Set()
        const before = current.size
        for (const value of values) current.add(value)
        aliases.set(binding, current)
        return current.size !== before
      }
      if (pattern.type === 'ObjectPattern') {
        let changed = false
        for (const property of pattern.properties) {
          if (property.type !== 'Property') continue
          const name =
            property.key.type === 'Identifier' && !property.computed
              ? property.key.name
              : property.key.value
          if (values.has('logger') && methods.has(name))
            changed = assign(property.value, new Set(['method'])) || changed
          if (values.has('global') && ['console', 'logger', 'log'].includes(name))
            changed = assign(property.value, new Set(['logger'])) || changed
        }
        return changed
      }
      if (pattern.type === 'AssignmentPattern') return assign(pattern.left, values)
      return false
    }
    function checkComment(comment) {
      const text = comment.value.trim()
      if (text && !isDirective(text) && !hasChinese(text))
        context.report({ loc: comment.loc, messageId: 'comment' })
    }
    function checkLog(node) {
      const callee = node.callee
      let target = resolve(callee)
      let first = node.arguments[0]
      if (callee.type === 'MemberExpression') {
        const method = propertyName(callee)
        if (['call', 'apply', 'bind'].includes(method)) {
          target = resolve(callee.object)
          if (method === 'bind' && node.arguments.length < 2) return
          first =
            method === 'apply'
              ? node.arguments[1]?.type === 'ArrayExpression'
                ? node.arguments[1].elements[0]
                : undefined
              : node.arguments[1]
        }
      }
      if (target.has('boundInvalid') || (target.has('method') && !chineseMessage(first)))
        context.report({ node, messageId: 'log' })
    }
    const visitor = {
      Program() {
        for (const match of source.text.matchAll(milestone)) {
          const start = source.getLocFromIndex(match.index)
          const end = source.getLocFromIndex(match.index + match[0].length)
          context.report({ loc: { start, end }, messageId: 'milestone' })
        }
        for (const comment of source.getAllComments()) checkComment(comment)
        const template = source.ast.templateBody
        for (const comment of template?.comments ?? []) checkComment(comment)
        const document = source.parserServices.getDocumentFragment?.()
        for (const element of document?.children ?? []) {
          if (element.type !== 'VElement' || element.name !== 'style') continue
          const start = element.startTag.range[1]
          const end = element.endTag?.range[0] ?? element.range[1]
          for (const comment of cssComments(source.text.slice(start, end), start))
            checkComment({
              ...comment,
              loc: {
                start: source.getLocFromIndex(comment.range[0]),
                end: source.getLocFromIndex(comment.range[1]),
              },
            })
        }
      },
      VariableDeclarator(node) {
        if (node.init) bindings.push([node.id, node.init])
      },
      AssignmentExpression(node) {
        bindings.push([node.left, node.right])
      },
      ImportSpecifier(node) {
        if (['logger', 'log', 'console'].includes(node.imported.name))
          assign(node.local, new Set(['logger']))
      },
      CallExpression(node) {
        calls.push(node)
      },
      'Program:exit'() {
        // 按变量作用域迭代传播别名，重赋值保守保留已有日志来源。
        let changed = true
        while (changed) {
          changed = false
          for (const [pattern, value] of bindings)
            changed = assign(pattern, resolve(value)) || changed
        }
        for (const call of calls) checkLog(call)
      },
    }
    return source.parserServices.defineTemplateBodyVisitor
      ? source.parserServices.defineTemplateBodyVisitor(
          {
            CallExpression(node) {
              calls.push(node)
            },
          },
          visitor,
          { templateBodyTriggerSelector: 'Program' },
        )
      : visitor
  },
}
