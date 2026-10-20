import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ESLint, RuleTester } from 'eslint'
import vue from 'eslint-plugin-vue'
import rule from './source-conventions.js'

const vueParser = vue.configs['flat/base'].find((config) => config.languageOptions?.parser)
  .languageOptions.parser
RuleTester.describe = describe
RuleTester.it = it
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } })
tester.run('中文业务规范', rule, {
  valid: [
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
