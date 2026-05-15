// 云函数：autoCategory
// 根据备注文本自动识别支出类别
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 类别及对应关键词
const CATEGORY_KEYWORDS = {
  '餐饮': ['饭', '菜', '米', '面', '肉', '水果', '零食', '饮料', '外卖', '早餐', '午餐', '晚餐', '买菜', '火锅', '奶茶', '咖啡', '牛奶', '鸡蛋', '面包', '蛋糕', '烧烤', '饺子', '面条', '餐厅', '食堂', '超市买菜', '水', '可乐', '雪碧', '啤酒'],
  '交通': ['打车', '地铁', '公交', '加油', '停车', '高速', '过路费', '滴滴', '出租车', '高铁', '火车', '机票', '飞机', '充电', 'etc', '油费'],
  '购物': ['衣服', '鞋子', '包包', '手机', '电脑', '电器', '家具', '化妆品', '日用品', '玩具', '书', '文具', '数码', '淘宝', '京东', '拼多多', '网购', '快递'],
  '住房': ['房租', '房贷', '物业', '水电', '天然气', '煤气', '暖气', '维修', '装修', '网费', '宽带', '电费', '水费', '燃气'],
  '娱乐': ['电影', '游戏', 'k歌', '唱歌', '旅游', '门票', '健身房', '游泳', '篮球', '足球', 'steam', 'switch', 'ps5', '音乐', '会员', '视频'],
  '医疗': ['药', '医院', '挂号', '看病', '体检', '牙科', '眼科', '感冒', '发烧', '咳嗽', '手术', '医保'],
  '教育': ['学费', '书本', '补习', '培训', '课程', '考试', '报名', '辅导', '网课', '兴趣班']
}

exports.main = async (event, context) => {
  const text = event.text || ''
  if (!text.trim()) {
    return { category: '其他', confidence: 0 }
  }

  // 统计每个类别命中多少次
  const scores = {}
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[cat] = 0
    for (const kw of keywords) {
      if (text.includes(kw)) {
        scores[cat]++
      }
    }
  }

  // 找最高分
  let bestCat = '其他'
  let bestScore = 0
  for (const [cat, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestCat = cat
    }
  }

  return {
    category: bestCat,
    confidence: bestScore
  }
}