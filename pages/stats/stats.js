// pages/stats/stats.js
const app = getApp()
const db = wx.cloud.database()
const _ = db.command

// 类别配色
const CAT_COLORS = {
  '餐饮': '#e67e22',
  '交通': '#2980b9',
  '生活': '#27ae60',
  '娱乐': '#8e44ad',
  '医疗': '#e74c3c',
  '教育': '#2c3e50',
  '其他': '#95a5a6'
}

Page({
  data: {
    year: 2024,
    month: 1,
    totalAmount: '0.00',
    categoryData: [],
    memberData: [],
    annualTotalAmount: '0.00',
    annualMonthData: [],
    annualLeastMember: null,
    showAnnualDetails: false,
    expandedMemberName: ''
  },

  onLoad() {
    const now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1
    })
  },

  onShow() {
    this.loadData()
  },

  prevMonth() {
    let { year, month } = this.data
    month--
    if (month < 1) { month = 12; year-- }
    this.setData({ year, month }, () => this.loadData())
  },

  nextMonth() {
    let { year, month } = this.data
    month++
    if (month > 12) { month = 1; year++ }
    this.setData({ year, month }, () => this.loadData())
  },

  async loadData() {
    wx.showLoading({ title: '加载中...' })
    try {
      const { year, month } = this.data
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)
      const yearStartDate = new Date(year, 0, 1)
      const yearEndDate = new Date(year, 11, 31, 23, 59, 59)

      const res = await db.collection('bills')
        .where({
          createdAt: _.gte(startDate).and(_.lte(endDate))
        })
        .limit(1000)
        .get()

      const annualRes = await db.collection('bills')
        .where({
          createdAt: _.gte(yearStartDate).and(_.lte(yearEndDate))
        })
        .limit(1000)
        .get()

      const bills = res.data.map(b => ({
        ...b,
        category: app.normalizeCategory(b.category)
      }))
      const annualStats = this.buildAnnualStats(annualRes.data)
      const totalAmount = bills.reduce((s, b) => s + b.amount, 0)

      // 按类别汇总
      const catMap = {}
      bills.forEach(b => {
        if (!catMap[b.category]) catMap[b.category] = 0
        catMap[b.category] += b.amount
      })

      const categoryData = Object.entries(catMap)
        .map(([name, amount]) => ({
          name,
          amountValue: amount,
          amount: amount.toFixed(2),
          percent: totalAmount > 0 ? Math.round(amount / totalAmount * 100) : 0,
          color: CAT_COLORS[name] || '#95a5a6'
        }))
        .sort((a, b) => b.amount - a.amount)

      // 按家庭成员汇总
      const memberMap = {}
      bills.forEach(b => {
        const spender = b.spender || '未填写'
        if (!memberMap[spender]) {
          memberMap[spender] = {
            name: spender,
            amount: 0,
            count: 0,
            categories: {}
          }
        }
        memberMap[spender].amount += b.amount
        memberMap[spender].count += 1
        if (!memberMap[spender].categories[b.category]) memberMap[spender].categories[b.category] = 0
        memberMap[spender].categories[b.category] += b.amount
      })

      const familyMembers = app.globalData.familyMembers || []
      const extraMembers = Object.keys(memberMap).filter(name => !familyMembers.includes(name))
      const memberData = familyMembers.concat(extraMembers)
        .map(name => {
          const item = memberMap[name] || { amount: 0, count: 0, categories: {} }
          const categories = Object.entries(item.categories)
            .map(([catName, amount]) => ({
              name: catName,
              amountValue: amount,
              amount: amount.toFixed(2),
              percent: item.amount > 0 ? Math.round(amount / item.amount * 100) : 0,
              color: CAT_COLORS[catName] || '#95a5a6'
            }))
            .sort((a, b) => b.amountValue - a.amountValue)

          return {
            name,
            icon: (app.globalData.memberIcons || {})[name] || '👤',
            amount: item.amount.toFixed(2),
            count: item.count,
            percent: totalAmount > 0 ? Math.round(item.amount / totalAmount * 100) : 0,
            avgAmount: item.count > 0 ? (item.amount / item.count).toFixed(2) : '0.00',
            categories,
            expanded: this.data.expandedMemberName === name
          }
        })
        .filter(item => item.count > 0 || familyMembers.includes(item.name))

      this.setData({
        totalAmount: totalAmount.toFixed(2),
        categoryData,
        memberData,
        annualTotalAmount: annualStats.totalAmount,
        annualMonthData: annualStats.monthData,
        annualLeastMember: annualStats.leastMember
      }, () => {
        if (categoryData.length > 0) this.drawPieChart()
        this.drawMemberPieCharts()
      })
    } catch (err) {
      console.error('加载统计失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  buildAnnualStats(bills) {
    const memberIcons = app.globalData.memberIcons || {}
    const personalMembers = (app.globalData.familyMembers || []).filter(name => name !== '家庭')
    const monthData = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      amountValue: 0,
      amount: '0.00',
      percent: 0,
      leastMember: null
    }))
    const annualMemberAmounts = {}
    personalMembers.forEach(name => { annualMemberAmounts[name] = 0 })

    bills.forEach(b => {
      const date = new Date(b.createdAt)
      const monthIndex = date.getMonth()
      const amount = Number(b.amount) || 0
      const spender = b.spender || '未填写'

      monthData[monthIndex].amountValue += amount
      if (spender !== '家庭' && personalMembers.includes(spender)) {
        annualMemberAmounts[spender] += amount
      }
    })

    const total = monthData.reduce((sum, item) => sum + item.amountValue, 0)

    monthData.forEach(item => {
      const monthMemberAmounts = {}
      personalMembers.forEach(name => { monthMemberAmounts[name] = 0 })

      bills.forEach(b => {
        const date = new Date(b.createdAt)
        const spender = b.spender || '未填写'
        if (date.getMonth() === item.month - 1 && spender !== '家庭' && personalMembers.includes(spender)) {
          monthMemberAmounts[spender] += Number(b.amount) || 0
        }
      })

      const personalTotal = personalMembers.reduce((sum, name) => sum + monthMemberAmounts[name], 0)
      const leastName = personalTotal > 0 ? this.getLeastMemberName(monthMemberAmounts, personalMembers) : ''

      item.amount = item.amountValue.toFixed(2)
      item.percent = total > 0 ? Math.round(item.amountValue / total * 100) : 0
      item.leastMember = leastName ? {
        name: leastName,
        icon: memberIcons[leastName] || '👤',
        amount: monthMemberAmounts[leastName].toFixed(2)
      } : null
    })

    const annualPersonalTotal = personalMembers.reduce((sum, name) => sum + annualMemberAmounts[name], 0)
    const annualLeastName = annualPersonalTotal > 0 ? this.getLeastMemberName(annualMemberAmounts, personalMembers) : ''

    return {
      totalAmount: total.toFixed(2),
      monthData,
      leastMember: annualLeastName ? {
        name: annualLeastName,
        icon: memberIcons[annualLeastName] || '👤',
        amount: annualMemberAmounts[annualLeastName].toFixed(2)
      } : null
    }
  },

  getLeastMemberName(amountMap, memberNames) {
    return memberNames.reduce((leastName, name) => {
      if (!leastName) return name
      return amountMap[name] < amountMap[leastName] ? name : leastName
    }, '')
  },

  toggleAnnualDetails() {
    this.setData({ showAnnualDetails: !this.data.showAnnualDetails })
  },

  noop() {},

  toggleMemberDetails(e) {
    const { name } = e.currentTarget.dataset
    const expandedMemberName = this.data.expandedMemberName === name ? '' : name
    const memberData = this.data.memberData.map(item => ({
      ...item,
      expanded: item.name === expandedMemberName
    }))

    this.setData({ expandedMemberName, memberData }, () => {
      if (expandedMemberName) this.drawMemberPieCharts()
    })
  },

  drawPieChart() {
    const query = wx.createSelectorQuery()
    query.select('#pieChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio

        // 设置画布尺寸
        const size = 400 * dpr
        canvas.width = size
        canvas.height = size
        ctx.scale(dpr, dpr)

        const cx = 200
        const cy = 200
        const r = 140

        // 画饼图
        const data = this.data.categoryData
        let startAngle = -Math.PI / 2

        data.forEach(item => {
          const sweepAngle = (item.percent / 100) * Math.PI * 2

          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, r, startAngle, startAngle + sweepAngle)
          ctx.closePath()
          ctx.fillStyle = item.color
          ctx.fill()

          startAngle += sweepAngle
        })

        // 中心白色圆（做甜甜圈效果）
        ctx.beginPath()
        ctx.arc(cx, cy, 70, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()

        // 中心文字
        ctx.fillStyle = '#333'
        ctx.font = 'bold 32px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('¥' + this.data.totalAmount, cx, cy - 12)

        ctx.fillStyle = '#999'
        ctx.font = '20px sans-serif'
        ctx.fillText(this.data.year + '年' + this.data.month + '月', cx, cy + 20)
      })
  },

  drawMemberPieCharts() {
    const query = wx.createSelectorQuery()
    query.selectAll('.member-pie-canvas')
      .fields({ node: true, size: true, dataset: true })
      .exec((res) => {
        const canvases = res && res[0]
        if (!canvases || canvases.length === 0) return

        const dpr = wx.getSystemInfoSync().pixelRatio
        canvases.forEach(item => {
          const memberIndex = Number(item.dataset.memberIndex)
          const member = this.data.memberData[memberIndex]
          if (!member || !member.categories || member.categories.length === 0) return

          const canvas = item.node
          const ctx = canvas.getContext('2d')
          const size = 220
          canvas.width = size * dpr
          canvas.height = size * dpr
          ctx.scale(dpr, dpr)
          ctx.clearRect(0, 0, size, size)

          const cx = size / 2
          const cy = size / 2
          const r = 78
          let startAngle = -Math.PI / 2
          const total = member.categories.reduce((sum, cat) => sum + cat.amountValue, 0)

          member.categories.forEach(cat => {
            const sweepAngle = total > 0 ? (cat.amountValue / total) * Math.PI * 2 : 0
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, r, startAngle, startAngle + sweepAngle)
            ctx.closePath()
            ctx.fillStyle = cat.color
            ctx.fill()
            startAngle += sweepAngle
          })

          ctx.beginPath()
          ctx.arc(cx, cy, 42, 0, Math.PI * 2)
          ctx.fillStyle = '#fff'
          ctx.fill()

          ctx.fillStyle = '#333'
          ctx.font = 'bold 22px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(member.percent + '%', cx, cy - 8)

          ctx.fillStyle = '#999'
          ctx.font = '16px sans-serif'
          ctx.fillText('总占比', cx, cy + 18)
        })
      })
  }
})
