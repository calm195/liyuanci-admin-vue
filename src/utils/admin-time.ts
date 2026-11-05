const beijingTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  dateStyle: 'medium',
  timeStyle: 'medium',
  hour12: false,
})

export function displayBeijingTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未提供' : beijingTime.format(date)
}
