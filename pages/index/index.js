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
    touchStartY: 0,
    currentUser: null,
    operatorOptions: [],
    showIdentityModal: false,
    showUndoTip: false,
    undoBillSnapshot: null
  },

  async onShow() {
    await this.initCurrentUser()
    this.loadData()
  },

  onUnload() {
    this.clearUndoTimer()
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
        '餐饮': 'food', '交通': 'transport', '电话费': 'phone', '生活': 'life',
        '娱乐': 'entertain', '医疗': 'medical',
        '教育': 'education', '其他': 'other'
      }
      const bills = res.data
        .map(b => ({
          ...b,
          category: app.normalizeCategory(b.category),
          spender: b.spender || '未填写',
          dateStr: this.formatDate(b.createdAt),
          spenderIcon: (app.globalData.memberIcons || {})[b.spender] || '👤',
          createdByName: b.createdByName || '未记录',
          createdByIcon: b.createdByIcon || '👤',
          tagClass: 'tag-' + (tagClassMap[b.category] || 'other')
        }))
        .sort((a, b) => this.getBillSortTime(b) - this.getBillSortTime(a))

      // 计算总金额
      const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0)

      // 按成员计算
      const members = {}
      bills.forEach(b => {
        const spender = b.spender || '未填写'
        if (!members[spender]) members[spender] = 0
        members[spender] += b.amount
      })
      const memberSummary = (app.globalData.familyMembers || []).map(name => ({
        name,
        icon: (app.globalData.memberIcons || {})[name] || '👤',
        amount: (members[name] || 0).toFixed(2),
        percent: totalAmount > 0 ? Math.round((members[name] || 0) / totalAmount * 100) : 0
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

  async initCurrentUser() {
    try {
      const currentUser = await app.loadCurrentUser()
      this.setData({
        currentUser,
        operatorOptions: app.getOperatorOptions(),
        showIdentityModal: !currentUser
      })
    } catch (err) {
      console.error('获取使用者失败', err)
      this.setData({
        operatorOptions: app.getOperatorOptions(),
        showIdentityModal: true
      })
    }
  },

  async selectIdentity(e) {
    const { name } = e.currentTarget.dataset
    wx.showLoading({ title: '绑定中...' })
    try {
      const currentUser = await app.bindCurrentUser(name)
      this.setData({
        currentUser,
        showIdentityModal: false
      })
      wx.showToast({ title: '已绑定' + name, icon: 'success' })
    } catch (err) {
      console.error('绑定使用者失败', err)
      wx.showToast({ title: '绑定失败，请重试', icon: 'none' })
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

  getBillSortTime(bill) {
    const sortDate = bill.recordCreatedAt || bill.createdAt
    return sortDate ? new Date(sortDate).getTime() : 0
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' })
  },

  editBill(id) {
    if (!id) return
    const bill = this.data.bills.find(item => item._id === id)
    if (bill) {
      wx.setStorageSync('familyLedgerEditingBill', bill)
    }
    this.setData({ swipedBillId: '' })
    wx.navigateTo({ url: `/pages/add/add?id=${id}` })
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

    if (deltaX < -45) {
      this.setData({ swipedBillId: id })
    } else if (deltaX > 45) {
      if (this.data.swipedBillId) {
        this.setData({ swipedBillId: '' })
        return
      }
      this.editBill(id)
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
    const billSnapshot = this.data.bills.find(item => item._id === id)

    wx.showModal({
      title: '删除账单',
      content: `确定删除「${note || '无备注'}」这笔 ¥${amount} 的账单吗？`,
      confirmText: '删除',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (!res.confirm) {
          this.setData({ swipedBillId: '' })
          return
        }

        wx.showLoading({ title: '删除中...' })
        try {
          const currentUser = await app.loadCurrentUser()
          const deleteRes = await wx.cloud.callFunction({
            name: 'deleteBill',
            data: {
              billId: id,
              operatorName: currentUser ? currentUser.memberName : '未绑定',
              operatorIcon: currentUser ? currentUser.icon : '👤'
            }
          })
          const result = deleteRes.result || {}
          if (!result.success) {
            throw new Error(result.message || '删除失败')
          }
          this.setData({ swipedBillId: '' })
          if (billSnapshot) {
            this.showUndoTip(billSnapshot)
          }
          this.loadData()
        } catch (err) {
          console.error('删除失败', err)
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  showUndoTip(billSnapshot) {
    this.clearUndoTimer()
    this.setData({
      showUndoTip: true,
      undoBillSnapshot: billSnapshot
    })
    this.undoTimer = setTimeout(() => {
      this.setData({
        showUndoTip: false,
        undoBillSnapshot: null
      })
      this.undoTimer = null
    }, 3000)
  },

  clearUndoTimer() {
    if (this.undoTimer) {
      clearTimeout(this.undoTimer)
      this.undoTimer = null
    }
  },

  buildRestoreData(bill) {
    const restoreData = { ...bill }
    delete restoreData._id
    delete restoreData._openid
    delete restoreData.dateStr
    delete restoreData.tagClass
    delete restoreData.spenderIcon
    return restoreData
  },

  async restoreDeletedBill() {
    const billSnapshot = this.data.undoBillSnapshot
    if (!billSnapshot) return

    this.clearUndoTimer()
    this.setData({
      showUndoTip: false,
      undoBillSnapshot: null
    })

    wx.showLoading({ title: '恢复中...' })
    try {
      const currentUser = await app.loadCurrentUser()
      const restoreData = this.buildRestoreData(billSnapshot)
      const addRes = await db.collection('bills').add({
        data: restoreData
      })

      app.addOperationLog({
        action: 'restore',
        billId: addRes._id,
        billSnapshot: restoreData,
        operatorOpenid: currentUser ? currentUser.openid : '',
        operatorName: currentUser ? currentUser.memberName : '未绑定',
        operatorIcon: currentUser ? currentUser.icon : '👤',
        createdAt: new Date()
      })

      wx.showToast({ title: '已恢复', icon: 'success' })
      this.loadData()
    } catch (err) {
      console.error('恢复失败', err)
      wx.showToast({ title: '恢复失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})
