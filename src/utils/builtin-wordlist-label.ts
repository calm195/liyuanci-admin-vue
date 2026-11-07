// 中文名称沿用 go-swd v0.3.0 的标签定义。
const names = new Map([
  ['ad_compliance', '广告法违规'],
  ['aigc', 'AI生成特征'],
  ['contraband_act', '违禁行为'],
  ['contraband_drug', '毒品'],
  ['contraband_entity', '违禁物品'],
  ['contraband_forgery', '伪造证件'],
  ['contraband_fraud', '诈骗话术'],
  ['contraband_gambling', '赌博'],
  ['contraband_privacy', '买卖个人信息'],
  ['inappropriate_discrimination', '偏见歧视'],
  ['inappropriate_ethics', '不良价值观'],
  ['inappropriate_nonsense', '无意义灌水'],
  ['inappropriate_oral', '低俗口头语'],
  ['inappropriate_profanity', '攻击辱骂'],
  ['inappropriate_superstition', '封建迷信'],
  ['political_entity', '涉政组织'],
  ['political_figure', '涉政人物'],
  ['political_sensitive', '敏感政治内容'],
  ['pornographic_adult', '色情内容'],
  ['pt_by_recruitment', '网赚兼职广告'],
  ['pt_to_contact', '引流联系方式'],
  ['pt_to_sites', '站外引流'],
  ['religion_general', '宗教内容'],
  ['sexual_suggestive', '低俗性暗示'],
  ['sexual_terms', '性健康内容'],
  ['violent_extremist', '极端组织'],
  ['violent_incidents', '暴力伤害'],
  ['violent_weapons', '武器弹药'],
])

export function builtinWordlistLabel(label: string): string {
  return names.get(label) ?? label
}
