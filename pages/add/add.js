// pages/add/add.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    amount: '',
    category: '',       // 当前选中的类别
    categories: ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '教育', '其他'],
    spender: '',
    familyMembers: [],
    note: '',
    submitting: false
  },

  onLoad() {
    this.setData({ familyMembers: app.globalData.familyMembers })
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value })
  },

  selectCategory(e) {
    this.setData({ category: e.currentTarget.dataset.cat })
  },

  selectSpender(e) {
    this.setData({ spender: e.currentTarget.dataset.name })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  // 备注输入框失去焦点时自动识别类别
  onNoteBlur() {
    const note = this.data.note.trim()
    if (!note || this.data.category) return // 已手动选了类别就不覆盖

    // 调用云函数自动分类
    wx.cloud.callFunction({
      name: 'autoCategory',
      data: { text: note }
    }).then(res => {
      const cat = res.result.category
      if (cat && cat !== '其他') {
        this.setData({ category: cat })
        wx.showToast({ title: '已自动识别: ' + cat, icon: 'none', duration: 1500 })
      }
    }).catch(() => {
      // 云函数还没部署，用本地规则兜底
      const cat = this.localAutoCategory(note)
      if (cat && cat !== '其他') {
        this.setData({ category: cat })
        wx.showToast({ title: '已自动识别: ' + cat, icon: 'none', duration: 1500 })
      }
    })
  },

  // 本地自动分类（云函数未部署时的兜底）
  localAutoCategory(text) {
    const categories = app.globalData.categories
    const scores = {}
    for (const [cat, keywords] of Object.entries(categories)) {
      scores[cat] = 0
      for (const kw of keywords) {
        if (text.includes(kw)) scores[cat]++
      }
    }
    let bestCat = '其他'
    let bestScore = 0
    for (const [cat, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score
        bestCat = cat
      }
    }
    return bestCat
  },

  async submitBill() {
    const { amount, category, spender, note } = this.data

    // 表单校验
    if (!amount || parseFloat(amount) <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' })
      return
    }
    if (!category) {
      wx.showToast({ title: '请选择类别', icon: 'none' })
      return
    }
    if (!spender) {
      wx.showToast({ title: '请选择谁花的', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      await db.collection('bills').add({
        data: {
          amount: parseFloat(amount),
          category,
          spender,
          note: note.trim(),
          createdAt: new Date()
        }
      })

      wx.showToast({ title: '记好了~', icon: 'success' })
      // 返回首页并刷新
      setTimeout(() => wx.navigateBack(), 800)
    } catch (err) {
      console.error('提交失败', err)
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})