<script setup lang="ts">
import { version } from 'vue'
import CounterDemo from '@/components/CounterDemo.vue'

const title = import.meta.env.VITE_APP_TITLE ?? 'Vue Foundation'
const features = [
  {
    number: '01',
    title: '类型先行',
    tag: 'TYPE SAFETY',
    description: '严格 TypeScript、模板类型检查与类型感知 ESLint，让问题在开发时被发现。',
    detail: 'strict · vue-tsc · noUncheckedIndexedAccess',
  },
  {
    number: '02',
    title: '规范开箱即用',
    tag: 'CODE QUALITY',
    description: '统一格式、自动检查与有意义的测试。把精力留给业务，把重复工作交给工具。',
    detail: 'ESLint · Prettier · Vitest · GitHub Actions',
  },
  {
    number: '03',
    title: '与 AI 一起构建',
    tag: 'CODEX READY',
    description: '项目级协作指引与本地 Codex CLI，让 AI 理解目录、编码规范和验证流程。',
    detail: 'AGENTS.md · pnpm codex · project config',
  },
]
const directories = [
  ['views/', '路由页面，按需加载'],
  ['components/', '可复用的界面组件'],
  ['composables/', '可复用的组合式逻辑'],
  ['stores/', 'Pinia 共享状态'],
  ['services/', '外部接口与数据边界'],
  ['types/ · utils/', '共享类型与纯函数'],
]
</script>

<template>
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="#"><span class="brand-mark" aria-hidden="true">v.</span>{{ title }}</a>
      <nav aria-label="主导航">
        <a href="#features">工程能力</a><a href="#structure">目录结构</a
        ><a class="nav-start" href="#start">开始构建 ↗</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow"><span class="status-dot"></span> VUE {{ version }} / READY TO BUILD</p>
          <h1>好的开始，<br />让灵感<span>走得更远。</span></h1>
          <p class="hero-description">
            一个有章法的 Vue 3
            工程起点。严格的类型、清晰的结构、可靠的工具链，从第一行代码起，为你的下一个作品打好基础。
          </p>
          <div class="button-row">
            <a class="button" href="#start">开启你的项目 <span aria-hidden="true">↗</span></a
            ><a
              class="secondary-link"
              href="https://vuejs.org/guide/introduction.html"
              target="_blank"
              rel="noreferrer"
              >阅读 Vue 文档 ↗</a
            >
          </div>
          <div class="stack-tags">
            <span>Vue 3</span><span>TypeScript</span><span>Vite</span><span>pnpm</span>
          </div>
        </div>
        <div class="code-window" aria-label="Vue 组合式 API 示例">
          <div class="window-bar">
            <span class="window-dots">● ● ●</span><span>your-next-idea.vue</span><span>↗</span>
          </div>
          <pre><code><span class="code-muted">// A little structure. Endless possibilities.</span>
<span class="code-purple">&lt;script setup</span> lang=<span class="code-green">"ts"</span><span class="code-purple">&gt;</span>
<span class="code-purple">import</span> { ref } <span class="code-purple">from</span> <span class="code-green">'vue'</span>

<span class="code-purple">const</span> idea = ref(<span class="code-green">'Something great'</span>)
<span class="code-purple">const</span> ready = <span class="code-orange">true</span>
<span class="code-purple">&lt;/script&gt;</span>

<span class="code-purple">&lt;template&gt;</span>
  &lt;YourNextIdea <span class="code-green">:idea="idea"</span> /&gt;
<span class="code-purple">&lt;/template&gt;</span></code></pre>
          <div class="window-footer">
            <span><span class="status-dot"></span> All systems ready</span
            ><span>TypeScript · Vue</span>
          </div>
          <div class="floating-label">✦ Built on a solid foundation</div>
        </div>
      </section>
      <section id="features" class="features" aria-label="工程能力">
        <article v-for="feature in features" :key="feature.number" class="feature-card">
          <div class="card-top">
            <span>{{ feature.number }}</span
            ><span>{{ feature.tag }}</span>
          </div>
          <h2>{{ feature.title }}</h2>
          <p>{{ feature.description }}</p>
          <small>{{ feature.detail }}</small>
        </article>
      </section>
      <section id="structure" class="structure-section">
        <div>
          <p class="eyebrow">A PLACE FOR EVERYTHING</p>
          <h2>结构清晰，<br />才能从容生长。</h2>
          <p>
            从小型原型到完整应用，让每一份代码都有合适的位置。<br />保持组件轻量，让业务逻辑独立。
          </p>
        </div>
        <div class="directory-list">
          <div class="directory-heading">↳ src/ <span>按职责组织 · 按需要扩展</span></div>
          <div
            v-for="[directory, description] in directories"
            :key="directory"
            class="directory-row"
          >
            <code>{{ directory }}</code
            ><span>{{ description }}</span>
          </div>
        </div>
      </section>
      <CounterDemo />
      <section id="start" class="start-section">
        <div>
          <p class="eyebrow">YOUR NEXT CHAPTER</p>
          <h2>准备好了？开始写吧。</h2>
          <p>Node.js 22.13+ · pnpm 10 · 让下一次构建，从这里开始。</p>
        </div>
        <div class="terminal">
          <span># 安装依赖并启动开发服务器</span><code>pnpm install<br />pnpm dev</code
          ><span># 检查代码 / 启动 AI 协作</span><code>pnpm check<br />pnpm codex</code>
        </div>
      </section>
    </main>
    <footer>
      <span>{{ title }} <span class="footer-divider">/</span> 为下一次灵感，做好准备。</span
      ><span>Vue {{ version }} · Crafted for developers</span>
    </footer>
  </div>
</template>
