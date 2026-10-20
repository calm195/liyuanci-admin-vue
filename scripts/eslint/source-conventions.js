const hasChinese = (text) => /\p{Script=Han}/u.test(text)
const milestone = /\b(?:T\d{3,}|REQ[-–]?\d+|D\d{2})\b/gu

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
    function checkComment(comment) {
      const text = comment.value.trim()
      if (text && !isDirective(text) && !hasChinese(text))
        context.report({ loc: comment.loc, messageId: 'comment' })
    }
    function checkLog(node) {
      const callee = node.callee
      if (callee.type !== 'MemberExpression') return
      const owner = callee.object
      const property = callee.property
      const method = callee.computed
        ? property.type === 'Literal' && property.value
        : property.type === 'Identifier' && property.name
      if (
        owner.type !== 'Identifier' ||
        !['console', 'logger', 'log'].includes(owner.name) ||
        !['log', 'info', 'warn', 'error', 'debug', 'trace', 'fatal'].includes(method)
      )
        return
      const first = node.arguments[0]
      const text =
        first?.type === 'Literal' && typeof first.value === 'string'
          ? first.value
          : first?.type === 'TemplateLiteral'
            ? first.quasis.map((part) => part.value.cooked ?? '').join('')
            : ''
      if (!hasChinese(text)) context.report({ node, messageId: 'log' })
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
      },
      CallExpression: checkLog,
    }
    return source.parserServices.defineTemplateBodyVisitor
      ? source.parserServices.defineTemplateBodyVisitor({ CallExpression: checkLog }, visitor)
      : visitor
  },
}
