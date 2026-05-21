// pages/add/add.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    billId: '',
    isEdit: false,
    amount: '',
    category: '',       // 当前选中的类别
    categories: ['餐饮', '交通', '生活', '娱乐', '医疗', '教育', '其他'],
    spender: '',
    familyMembers: [],
    selectedDate: '',
    displayDate: '',
    note: '',
    submitting: false,
    originalBill: null
  },

  onLoad(options = {}) {
    const memberIcons = app.globalData.memberIcons || {}
    const familyMembers = (app.globalData.familyMembers || []).map(name => ({
      name,
      icon: memberIcons[name] || '👤'
    }))
    const today = this.formatInputDate(new Date())
    this.setData({
      billId: options.id || '',
      isEdit: !!options.id,
      familyMembers,
      selectedDate: today,
      displayDate: this.formatDisplayDate(today)
    })
    app.loadCurrentUser().catch(err => {
      console.error('获取使用者失败', err)
    })

    if (options.id) {
      wx.setNavigationBarTitle({ title: '修改账单' })
      this.loadBill(options.id)
    }
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

  onDateChange(e) {
    const selectedDate = e.detail.value
    this.setData({
      selectedDate,
      displayDate: this.formatDisplayDate(selectedDate)
    })
  },

  async loadBill(id) {
    wx.showLoading({ title: '加载中...' })
    try {
      const cachedBill = wx.getStorageSync('familyLedgerEditingBill')
      if (cachedBill && cachedBill._id === id) {
        this.fillBillForm(cachedBill)
        wx.removeStorageSync('familyLedgerEditingBill')
        return
      }

      const res = await db.collection('bills').doc(id).get()
      this.fillBillForm(res.data || {})
    } catch (err) {
      console.error('加载账单失败', err)
      wx.showToast({ title: '加载账单失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  fillBillForm(bill) {
    const selectedDate = this.formatInputDate(bill.createdAt ? new Date(bill.createdAt) : new Date())

    this.setData({
      amount: bill.amount ? String(bill.amount) : '',
      category: app.normalizeCategory(bill.category),
      spender: bill.spender || '',
      note: bill.note || '',
      selectedDate,
      displayDate: this.formatDisplayDate(selectedDate),
      originalBill: bill
    })
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
        const category = app.normalizeCategory(cat)
        this.setData({ category })
        wx.showToast({ title: '已自动识别: ' + category, icon: 'none', duration: 1500 })
      }
    }).catch(() => {
      // 云函数还没部署，用本地规则兜底
      const cat = this.localAutoCategory(note)
      if (cat && cat !== '其他') {
        const category = app.normalizeCategory(cat)
        this.setData({ category })
        wx.showToast({ title: '已自动识别: ' + category, icon: 'none', duration: 1500 })
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
    return app.normalizeCategory(bestCat)
  },

  async submitBill() {
    const { billId, isEdit, amount, category, spender, note, selectedDate } = this.data

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
    if (!selectedDate) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const currentUser = await app.loadCurrentUser()
      if (!currentUser) {
        wx.showToast({ title: '请先在首页选择使用者', icon: 'none' })
        this.setData({ submitting: false })
        return
      }

      const billData = {
        amount: parseFloat(amount),
        category: app.normalizeCategory(category),
        spender,
        note: note.trim(),
        createdAt: this.buildBillDate(selectedDate)
      }

      if (isEdit) {
        const editedData = this.buildEditedBillData(billData, currentUser)
        await this.replaceEditedBill(billId, editedData, currentUser)

        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }

      const createData = this.buildNewBillData(billData, currentUser)

      const addRes = await db.collection('bills').add({
        data: createData
      })

      app.addOperationLog({
        action: 'add',
        billId: addRes._id,
        billSnapshot: createData,
        operatorOpenid: currentUser.openid,
        operatorName: currentUser.memberName,
        operatorIcon: currentUser.icon,
        createdAt: new Date()
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
  },

  buildNewBillData(billData, currentUser) {
    return {
      ...billData,
      createdByOpenid: currentUser.openid,
      createdByName: currentUser.memberName,
      createdByIcon: currentUser.icon,
      createdAt: billData.createdAt,
      recordCreatedAt: new Date()
    }
  },

  buildEditedBillData(billData, currentUser) {
    const originalBill = this.data.originalBill || {}

    return {
      ...billData,
      createdByOpenid: originalBill.createdByOpenid || currentUser.openid,
      createdByName: originalBill.createdByName || currentUser.memberName,
      createdByIcon: originalBill.createdByIcon || currentUser.icon,
      createdAt: billData.createdAt,
      recordCreatedAt: originalBill.recordCreatedAt || originalBill.createdAt || new Date(),
      updatedAt: new Date(),
      updatedByOpenid: currentUser.openid,
      updatedByName: currentUser.memberName,
      updatedByIcon: currentUser.icon
    }
  },

  async replaceEditedBill(billId, editedData, currentUser) {
    let newBillId = ''

    try {
      const addRes = await db.collection('bills').add({
        data: editedData
      })
      newBillId = addRes._id

      const deleteRes = await wx.cloud.callFunction({
        name: 'deleteBill',
        data: {
          billId,
          operatorName: currentUser.memberName,
          operatorIcon: currentUser.icon
        }
      })
      const result = deleteRes.result || {}
      if (!result.success) {
        throw new Error(result.message || '删除旧账单失败')
      }

      app.addOperationLog({
        action: 'update',
        billId: newBillId,
        originalBillId: billId,
        beforeSnapshot: this.data.originalBill || null,
        afterSnapshot: editedData,
        operatorOpenid: currentUser.openid,
        operatorName: currentUser.memberName,
        operatorIcon: currentUser.icon,
        createdAt: new Date()
      })
    } catch (err) {
      if (newBillId) {
        try {
          await db.collection('bills').doc(newBillId).remove()
        } catch (rollbackErr) {
          console.warn('回滚修改账单失败', rollbackErr)
        }
      }
      throw err
    }
  },

  formatInputDate(date) {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  formatDisplayDate(dateStr) {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${year}年${Number(month)}月${Number(day)}日`
  },

  buildBillDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }
})
