// app.js - 家庭记账小程序入口
App({
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init({
      env: 'cloud1-d1guy5yz64698e80b',
      traceUser: true
    })
    this.globalData = {
      envId: 'cloud1-d1guy5yz64698e80b',
      // 家庭成员可选
      familyMembers: ['家庭', '爸爸', '妈妈', '儿子'],
      operatorMembers: ['爸爸', '妈妈', '儿子'],
      memberIcons: {
        '家庭': '🏡',
        '爸爸': '🧔',
        '妈妈': '👩‍🦰',
        '儿子': '👦'
      },
      // 支出类别及自动识别关键词
      categories: {
        '餐饮': ['饭', '菜', '米', '面', '肉', '水果', '零食', '饮料', '外卖', '早餐', '午餐', '晚餐', '买菜', '火锅', '奶茶', '咖啡', '牛奶', '鸡蛋', '面包', '蛋糕', '烧烤', '饺子', '面条', '餐厅', '食堂', '超市', '水', '可乐', '雪碧'],
        '交通': ['打车', '地铁', '公交', '加油', '停车', '高速', '过路费', '滴滴', '出租车', '高铁', '火车', '机票', '飞机', '汽车票', '充电', 'etc'],
        '电话费': ['电话费', '话费', '手机费', '通信费', '通讯费', '流量', '流量包', '手机套餐', '电话卡', '移动', '联通', '电信'],
        '生活': ['衣服', '鞋子', '包包', '手机', '电脑', '电器', '家具', '化妆品', '日用品', '玩具', '书', '文具', '数码', '淘宝', '京东', '拼多多', '网购', '快递', '洗衣液', '纸巾', '洗发水', '房租', '房贷', '物业', '水电', '天然气', '煤气', '暖气', '维修', '装修', '网费', '宽带', '电费', '水费', '燃气'],
        '娱乐': ['电影', '游戏', 'k歌', '唱歌', '旅游', '门票', '健身房', '游泳', '篮球', '足球', 'steam', 'switch', 'ps5', '音乐', '会员', '视频', '追剧'],
        '医疗': ['药', '医院', '挂号', '看病', '体检', '牙科', '眼科', '感冒', '发烧', '咳嗽', '手术', '医保'],
        '教育': ['学费', '书本', '补习', '培训', '课程', '考试', '报名', '辅导', '网课', '兴趣班', '文具', '学费']
      },
      openid: '',
      currentUser: null
    }
  },

  getMemberIcon(name) {
    return (this.globalData.memberIcons || {})[name] || '👤'
  },

  getOperatorOptions() {
    return (this.globalData.operatorMembers || []).map(name => ({
      name,
      icon: this.getMemberIcon(name)
    }))
  },

  normalizeCategory(category) {
    if (category === '购物' || category === '住房') return '生活'
    return category || '其他'
  },

  async getOpenid() {
    if (this.globalData.openid) return this.globalData.openid

    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' })
      const openid = res.result && res.result.openid
      this.globalData.openid = openid || ''
    } catch (err) {
      console.error('获取 openid 失败', err)
      this.globalData.openid = ''
    }
    return this.globalData.openid
  },

  async loadCurrentUser(force = false) {
    if (this.globalData.currentUser && !force) return this.globalData.currentUser

    const storedUser = wx.getStorageSync('familyLedgerCurrentUser')
    if (!storedUser || !storedUser.memberName) {
      this.globalData.currentUser = null
      return null
    }

    const openid = await this.getOpenid()
    this.globalData.currentUser = {
      ...storedUser,
      openid
    }
    return this.globalData.currentUser
  },

  async bindCurrentUser(memberName) {
    const allowedMembers = this.globalData.operatorMembers || []
    if (!allowedMembers.includes(memberName)) {
      throw new Error('无效的使用者')
    }

    const openid = await this.getOpenid()
    const user = {
      openid,
      memberName,
      icon: this.getMemberIcon(memberName),
      updatedAt: new Date()
    }

    wx.setStorageSync('familyLedgerCurrentUser', user)
    this.globalData.currentUser = user
    return user
  },

  async addOperationLog(data) {
    try {
      const db = wx.cloud.database()
      await db.collection('operationLogs').add({ data })
    } catch (err) {
      console.warn('记录操作日志失败', err)
    }
  }
})
