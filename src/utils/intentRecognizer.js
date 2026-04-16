import Fuse from 'fuse.js'

/**
 * 所有可识别的命令词库
 * intent: 'navigate' | 'explain' | 'replay'
 * action: 'next' | 'prev' | 'goto' | 'first' | 'last' | 'explain' | 'replay'
 */
const COMMANDS = [
  // —— 导航：下一步 ——
  { text: '下一步', intent: 'navigate', action: 'next' },
  { text: '下一个', intent: 'navigate', action: 'next' },
  { text: '前进', intent: 'navigate', action: 'next' },
  { text: '继续', intent: 'navigate', action: 'next' },
  { text: '往后', intent: 'navigate', action: 'next' },
  { text: '跳到下一步', intent: 'navigate', action: 'next' },

  // —— 导航：上一步 ——
  { text: '上一步', intent: 'navigate', action: 'prev' },
  { text: '上一个', intent: 'navigate', action: 'prev' },
  { text: '退回', intent: 'navigate', action: 'prev' },
  { text: '返回', intent: 'navigate', action: 'prev' },
  { text: '后退', intent: 'navigate', action: 'prev' },
  { text: '往前', intent: 'navigate', action: 'prev' },
  { text: '回到上一步', intent: 'navigate', action: 'prev' },

  // —— 导航：回到开头 ——
  { text: '从头开始', intent: 'navigate', action: 'first' },
  { text: '重新开始', intent: 'navigate', action: 'first' },
  { text: '回到开头', intent: 'navigate', action: 'first' },
  { text: '第一步', intent: 'navigate', action: 'goto', step: 0 },
  { text: '第1步', intent: 'navigate', action: 'goto', step: 0 },
  { text: '第一个', intent: 'navigate', action: 'goto', step: 0 },

  // —— 导航：跳到最后 ——
  { text: '跳到最后', intent: 'navigate', action: 'last' },
  { text: '最后一步', intent: 'navigate', action: 'last' },

  // —— 导航：指定步骤 ——
  { text: '第二步', intent: 'navigate', action: 'goto', step: 1 },
  { text: '第2步', intent: 'navigate', action: 'goto', step: 1 },
  { text: '第三步', intent: 'navigate', action: 'goto', step: 2 },
  { text: '第3步', intent: 'navigate', action: 'goto', step: 2 },
  { text: '第四步', intent: 'navigate', action: 'goto', step: 3 },
  { text: '第4步', intent: 'navigate', action: 'goto', step: 3 },
  { text: '第五步', intent: 'navigate', action: 'goto', step: 4 },
  { text: '第5步', intent: 'navigate', action: 'goto', step: 4 },
  { text: '第六步', intent: 'navigate', action: 'goto', step: 5 },
  { text: '第6步', intent: 'navigate', action: 'goto', step: 5 },

  // —— 讲解意图 ——
  { text: '介绍一下', intent: 'explain', action: 'explain' },
  { text: '详细介绍', intent: 'explain', action: 'explain' },
  { text: '解释一下', intent: 'explain', action: 'explain' },
  { text: '讲解一下', intent: 'explain', action: 'explain' },
  { text: '告诉我', intent: 'explain', action: 'explain' },
  { text: '说明一下', intent: 'explain', action: 'explain' },
  { text: '是什么意思', intent: 'explain', action: 'explain' },
  { text: '什么是', intent: 'explain', action: 'explain' },
  { text: '详细说明', intent: 'explain', action: 'explain' },
  { text: '更多信息', intent: 'explain', action: 'explain' },

  // —— 重播意图 ——
  { text: '再说一遍', intent: 'replay', action: 'replay' },
  { text: '重新播放', intent: 'replay', action: 'replay' },
  { text: '再播放一次', intent: 'replay', action: 'replay' },
  { text: '重复一下', intent: 'replay', action: 'replay' },
  { text: '没听清', intent: 'replay', action: 'replay' },
]

const fuse = new Fuse(COMMANDS, {
  keys: ['text'],
  threshold: 0.45,
  includeScore: true,
  minMatchCharLength: 2,
})

/**
 * 识别语音文本的意图
 * @param {string} transcript - 语音识别文本
 * @param {string[]} stepTitles - 当前所有步骤标题（动态注入）
 * @returns {{ intent: string, action: string, step?: number, score: number, matched: string } | null}
 */
export function recognizeIntent(transcript, stepTitles = []) {
  if (!transcript || transcript.trim().length === 0) return null

  const text = transcript.trim()

  // 1. 优先用步骤标题做精确子串匹配（导航到指定步骤）
  for (let i = 0; i < stepTitles.length; i++) {
    const title = stepTitles[i]
    if (text.includes(title) || title.includes(text)) {
      return { intent: 'navigate', action: 'goto', step: i, score: 1.0, matched: title }
    }
  }

  // 2. 关键词快速匹配（对常见短命令做优先处理）
  const KEYWORD_MAP = [
    { keywords: ['下一步', '下一个', '前进', '继续'], intent: 'navigate', action: 'next' },
    { keywords: ['上一步', '上一个', '返回', '退回', '后退'], intent: 'navigate', action: 'prev' },
    { keywords: ['从头', '重新开始', '回到开头', '第一步'], intent: 'navigate', action: 'first' },
    { keywords: ['最后一步', '跳到最后'], intent: 'navigate', action: 'last' },
    { keywords: ['再说一遍', '重新播放', '再播', '没听清', '重复'], intent: 'replay', action: 'replay' },
    { keywords: ['介绍', '解释', '讲解', '说明', '告诉我', '是什么', '什么是', '更多'], intent: 'explain', action: 'explain' },
  ]

  for (const rule of KEYWORD_MAP) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return { intent: rule.intent, action: rule.action, score: 0.9, matched: text }
    }
  }

  // 3. 数字步骤匹配
  const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 }
  const stepMatch = text.match(/第([一二三四五六1-6])步|第([一二三四五六1-6])个/)
  if (stepMatch) {
    const num = stepMatch[1] || stepMatch[2]
    const stepIndex = (numMap[num] || 1) - 1
    return { intent: 'navigate', action: 'goto', step: stepIndex, score: 0.95, matched: stepMatch[0] }
  }

  // 4. Fuse.js 模糊匹配兜底
  const results = fuse.search(text)
  if (results.length > 0 && results[0].score < 0.5) {
    const best = results[0]
    return {
      intent: best.item.intent,
      action: best.item.action,
      step: best.item.step,
      score: 1 - best.score,
      matched: best.item.text,
    }
  }

  return { intent: 'unknown', action: 'unknown', score: 0, matched: text }
}
