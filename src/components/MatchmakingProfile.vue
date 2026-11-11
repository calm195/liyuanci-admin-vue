<script setup lang="ts">
import { useDictionariesStore } from '@/stores/dictionaries'
import { campuses } from '@/types/matchmaking'
import type { Profile } from '@/types/matchmaking'
defineProps<{ profile: Profile }>()
const dictionaries = useDictionariesStore()
function campusLabel(code: string) {
  return campuses.find((item) => item.code === code)?.label ?? code
}
function educationLabel(value: string | undefined) {
  if (value === 'undergraduate') return '本科'
  if (value === 'master') return '硕士研究生'
  if (value === 'doctor') return '博士研究生'
  return value ?? ''
}
</script>
<template>
  <dl class="match-profile">
    <div>
      <dt>昵称</dt>
      <dd>{{ profile.name }}</dd>
    </div>
    <div>
      <dt>性别</dt>
      <dd>{{ profile.gender === 'male' ? '男' : '女' }}</dd>
    </div>
    <div>
      <dt>校区</dt>
      <dd>{{ campuses.find((item) => item.code === profile.campus)?.label ?? profile.campus }}</dd>
    </div>
    <div>
      <dt>年级</dt>
      <dd>{{ profile.grade_label || dictionaries.label('grade', profile.grade) }}</dd>
    </div>
    <div>
      <dt>MBTI</dt>
      <dd>{{ profile.mbti || '未填写' }}</dd>
    </div>
    <div>
      <dt>期望校区</dt>
      <dd>
        {{ profile.preferred_campuses?.map(campusLabel).join('、') || '不限校区' }}
      </dd>
    </div>
    <div>
      <dt>期望 MBTI</dt>
      <dd>{{ profile.preferred_mbti?.join('、') || '不限' }}</dd>
    </div>
    <div>
      <dt>入学信息</dt>
      <dd>
        {{ profile.enrollment_year || '待补全' }} {{ educationLabel(profile.education_level)
        }}{{ profile.grade_override ? ' · 手动年级' : '' }}
      </dd>
    </div>
    <div>
      <dt>年龄</dt>
      <dd>{{ profile.age }} 岁 · 期待 {{ profile.age_min }}–{{ profile.age_max }} 岁</dd>
    </div>
    <div>
      <dt>身高</dt>
      <dd>
        {{ profile.height }} 厘米 · 期待 {{ profile.height_min }}–{{ profile.height_max }} 厘米
      </dd>
    </div>
    <div>
      <dt>体重</dt>
      <dd>{{ profile.weight }} 斤 · 期待 {{ profile.weight_min }}–{{ profile.weight_max }} 斤</dd>
    </div>
    <div>
      <dt>微信号</dt>
      <dd>{{ profile.wechat || '未填写' }}</dd>
    </div>
    <div class="match-introduction">
      <dt>个人特质</dt>
      <dd>{{ profile.personal_traits?.join('、') || '未填写' }}</dd>
    </div>
    <div class="match-introduction">
      <dt>理想型特质</dt>
      <dd>{{ profile.ideal_traits?.join('、') || '未填写' }}</dd>
    </div>
    <div class="match-introduction">
      <dt>自我介绍</dt>
      <dd>{{ profile.introduction }}</dd>
    </div>
    <div class="match-introduction">
      <dt>资料展示授权</dt>
      <dd>{{ profile.consent ? '已同意向有效配对对象展示' : '尚未同意' }}</dd>
    </div>
  </dl>
</template>
<style scoped>
.match-profile {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
dt {
  color: var(--text-secondary);
  font-size: 0.85rem;
}
dd {
  margin: 0.3rem 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.match-introduction {
  grid-column: 1 / -1;
}
@media (max-width: 640px) {
  .match-profile {
    grid-template-columns: 1fr;
  }
}
</style>
