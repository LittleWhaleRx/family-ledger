// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    totalAmount: '0.00',
    memberSummary: [],
    bills: [],
    swipedBillId: '',
    touchStartX: 0,
    touchStartY: 0
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    wx.showLoading({ title: '加载中...' })
    try {
      // 获取本月起止时间
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth()
      const startDate = new Date(year, month, 1)
      const endDate = new Date(year, month + 1, 0, 23, 59, 59)

      // 查询本月所有账单
      const res = await db.collection('bills')
        .where({
          createdAt: _.gte(startDate).and(_.lte(endDate))
        })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()

      // 中文类别 -> 英文CSS类名映射
      const tagClassMap = {
        '餐饮': 'food', '交通': 'transport', '购物': 'shopping',
        '住房': 'housing', '娱乐': 'entertain', '医疗': 'medical',
        '教育': 'education', '其他': 'other'
      }
      const bills = res.data.map(b => ({
        ...b,
        dateStr: this.formatDate(b.createdAt),
        tagClass: 'tag-' + (tagClassMap[b.category] || 'other')
      }))

      // 计算总金额
      const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0)

      // 按成员计算
      const members = {}
      bills.forEach(b => {
        if (!members[b.spender]) members[b.spender] = 0
        members[b.spender] += b.amount
      })
      const memberSummary = (app.globalData.familyMembers || []).map(name => ({
        name,
        amount: (members[name] || 0).toFixed(2)
      }))

      this.setData({
        totalAmount: totalAmount.toFixed(2),
        memberSummary,
        bills,
        swipedBillId: ''
      })
    } catch (err) {
      console.error('加载失败', err)
      // 显示具体错误，方便排查
      const errMsg = err.errMsg || err.message || '未知错误'
      wx.showToast({ title: '加载失败: ' + errMsg, icon: 'none', duration: 3000 })
    } finally {
      wx.hideLoading()
    }
  },

  formatDate(date) {
    if (!date) return ''
    const d = new Date(date)
    const M = d.getMonth() + 1
    const D = d.getDate()
    return M + '月' + D + '日'
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' })
  },

  onBillTouchStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return

    this.setData({
      touchStartX: touch.clientX,
      touchStartY: touch.clientY
    })
  },

  onBillTouchEnd(e) {
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) return

    const { id } = e.currentTarget.dataset
    const deltaX = touch.clientX - this.data.touchStartX
    const deltaY = touch.clientY - this.data.touchStartY

    if (Math.abs(deltaY) > Math.abs(deltaX)) return

    if (deltaX > 45) {
      this.setData({ swipedBillId: id })
    } else if (deltaX < -30) {
      this.setData({ swipedBillId: '' })
    }
  },

  closeSwipe() {
    if (this.data.swipedBillId) {
      this.setData({ swipedBillId: '' })
    }
  },

  deleteBill(e) {
    const { id, note, amount } = e.currentTarget.dataset
    if (!id) return

    wx.showModal({
      title: '删除账单',
      content: `确定删除「${note || '无备注'}」这笔 ¥${amount} 的账单吗？`,
      confirmText: '删除',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '删除中...' })
        try {
          await db.collection('bills').doc(id).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.setData({ swipedBillId: '' })
          this.loadData()
        } catch (err) {
          console.error('删除失败', err)
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
