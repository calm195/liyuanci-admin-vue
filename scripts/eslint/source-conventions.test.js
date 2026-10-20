import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ESLint, RuleTester } from 'eslint'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import rule from './source-conventions.js'

const vueParser = vue.configs['flat/base'].find((config) => config.languageOptions?.parser)
  .languageOptions.parser
RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } })
tester.run('中文业务规范', rule, {
  valid: [
    {
      code: 'const report = console.info as typeof console.info; report("登录成功")',
      languageOptions: { parser: tseslint.parser },
    },
    'const helper = { info() {} }; const { info: emit } = helper; emit("not a logger")',
    'function run(window) { const sink = window.console; sink.info("not a logger") }',
    {
      code: '<template><button v-for="report in items" @click="report(\'data\')">操作</button></template><script setup>const report = console.error</script>',
      languageOptions: { parser: vueParser },
    },
    'const sink = console; const report = sink.info; report("登录成功")',
    'const { warn: report } = logger; report(`请求失败：${reason}`)',
    'const report = console.info.bind(console, "登录成功"); report(data)',
    'const report = console.info; report.call(console, "登录成功"); report.apply(console, ["登录成功"])',
    'const sink = console; function view() { const sink = { info() {} }; sink.info("not a logger") }',
    'function view(console) { console.info("not a logger") }',
    {
      code: '<template><p>后台入口</p></template><style scoped>/* 页面样式 */ p { content: "/* not a comment */"; background: url(https://example.test/a); }</style>',
      languageOptions: { parser: vueParser },
    },
    '// 后台请求使用 Bearer 令牌\nconsole.info("登录成功", account)',
    'logger.error(`请求失败：${reason}`)',
    '/// <reference types="vite/client" />',
    '/** @param value 后台响应 */\nfunction parse(value) { return value }',
    {
      code: '<template><!-- 身份审核 --><p>后台入口</p></template><script setup>console.info("页面加载")</script>',
      languageOptions: { parser: vueParser },
    },
  ],
  invalid: [
    {
      code: 'const report = console.error as typeof console.error; report("Failed")',
      languageOptions: { parser: tseslint.parser },
      errors: [{ messageId: 'log' }],
    },
    {
      code: '<template><p>后台入口</p></template>\n<style>/* 页面样式 */</style>\n<style scoped>/* English */</style>',
      languageOptions: { parser: vueParser },
      errors: [{ messageId: 'comment', line: 3, column: 15 }],
    },
    {
      code: 'const logger = createLogger(); logger.error("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const root = globalThis; const { console: sink } = root; sink.error("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const sink = console; const next = sink; next.warn("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const { error: report } = logger; const again = report; again("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'let report; report = console.error; report("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'let report; ({ warn: report } = console); report("Failed")',
      errors: [{ messageId: 'log' }],
    },
    { code: 'const { info: log } = console; log("Failed")', errors: [{ messageId: 'log' }] },
    {
      code: 'const report = console.error.bind(console); report("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const report = console.error; report.call(console, "Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const report = console.error; report.apply(console, ["Failed"])',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const report = console.error.bind(console, "Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const sink = globalThis.console; sink?.["warn"]("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'import { logger as audit } from "logging"; audit.error("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: 'const report = enabled ? console.info : console.warn; report("Failed")',
      errors: [{ messageId: 'log' }],
    },
    {
      code: '<template><button @click="report(\'Failed\')">操作</button></template><script setup>const report = console.error</script>',
      languageOptions: { parser: vueParser },
      errors: [{ messageId: 'log' }],
    },
    {
      code: '<template><p>后台入口</p></template><style>/* English style */ p { color: red; }</style>',
      languageOptions: { parser: vueParser },
      errors: [{ messageId: 'comment' }],
    },
    { code: '// T010 后台会话', errors: [{ messageId: 'milestone' }] },
    { code: 'const label = "REQ-018"', errors: [{ messageId: 'milestone' }] },
    { code: 'const label = "D02"', errors: [{ messageId: 'milestone' }] },
    { code: '// English explanation', errors: [{ messageId: 'comment' }] },
    { code: '/* English explanation */', errors: [{ messageId: 'comment' }] },
    { code: 'console.error("Failed")', errors: [{ messageId: 'log' }] },
    { code: 'logger["warn"](`Failed ${reason}`)', errors: [{ messageId: 'log' }] },
    { code: 'console.info(message)', errors: [{ messageId: 'log' }] },
    {
      code: '<template><!-- English explanation --><p>T012</p></template>',
      languageOptions: { parser: vueParser },
      errors: [{ messageId: 'comment' }, { messageId: 'milestone' }],
    },
  ],
})

describe('独立文本入口与原始位置', () => {
  const eslint = new ESLint()
  const cases = [
    ['scripts/example.css', '/* English */\n.panel { content: "T010"; }', ['comment', 'milestone']],
    [
      'scripts/example.css',
      '/* 页面样式 */\n.panel { content: "/* data */"; background: url(https://example.test/a); }',
      [],
    ],
    [
      'scripts/example.css',
      '.panel { background: url(https://example.test/a/*asset*/); } /* 页面样式 */',
      [],
    ],
    ['scripts/example.css', '.panel { content: "\\"/* data */"; } /* English */', ['comment']],
    ['scripts/example.html', '<p>😀</p><script>console.info("Failed")</script>', ['log']],
    [
      'scripts/example.html',
      '<!doctype html>\n<!-- English -->\n<p>T010</p>',
      ['comment', 'milestone'],
    ],
    [
      'scripts/example.html',
      '<!doctype html><p title="<!-- data -->">后台入口</p><style>/* 页面样式 */ p { content: "/* data */"; }</style>',
      [],
    ],
    ['scripts/example.html', '<style>/* English */</style>', ['comment']],
    ['scripts/example.html', '<template><!-- English --></template>', ['comment']],
    [
      'scripts/example.html',
      '<script type="application/json">{"description":"<!-- data -->"}</script>',
      [],
    ],
    [
      'scripts/example.html',
      '<script>\nconst report = console.error;\nreport("Failed")\n</script>',
      ['log'],
    ],
    [
      'scripts/example.html',
      '<script>const report = console.error; report("请求失败")</script>',
      [],
    ],
    ['scripts/example.test.html', '<!-- English --><script>console.error("Failed")</script>', []],
    ['scripts/example.spec.css', '/* English T010 */', []],
  ]
  for (const [filePath, code, expected] of cases) {
    it(`${filePath}：${code}`, async () => {
      const results = await eslint.lintText(code, { filePath })
      const messages = results.flatMap((result) => result.messages)
      assert.equal(
        messages.some((message) => message.fatal),
        false,
      )
      assert.deepEqual(
        messages
          .filter((message) => message.ruleId === 'local/source-conventions')
          .map((message) => message.messageId),
        expected,
      )
      if (code.includes('report("Failed")\n')) {
        const message = messages.find((item) => item.ruleId === 'local/source-conventions')
        assert.equal(message.line, 3)
        assert.equal(message.column, 1)
      }
      if (code.includes('😀')) {
        const message = messages.find((item) => item.ruleId === 'local/source-conventions')
        assert.equal(message.column, code.indexOf('console.info') + 1)
      }
    })
  }
})

it('实际配置拦截源码并豁免测试文件', async () => {
  const eslint = new ESLint()
  const code = '// T010\nconsole.info("English")'
  const source = await eslint.lintText(code, { filePath: 'scripts/example.js' })
  const test = await eslint.lintText(code, { filePath: 'scripts/example.test.js' })
  assert.equal(
    source[0].messages.filter((item) => item.ruleId === 'local/source-conventions').length,
    3,
  )
  assert.equal(
    test[0].messages.filter((item) => item.ruleId === 'local/source-conventions').length,
    0,
  )
})
