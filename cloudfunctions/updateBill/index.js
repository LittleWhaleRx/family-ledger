// 云函数：updateBill
// 使用云端权限修改账单，避免旧账单因客户端 openid 权限差异无法更新。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { billId, billData, operatorName, operatorIcon } = event

  if (!billId) {
    return {
      success: false,
      message: '缺少账单ID'
    }
  }

  if (!billData || !billData.amount || !billData.category || !billData.spender || !billData.createdAt) {
    return {
      success: false,
      message: '账单信息不完整'
    }
  }

  let before = null
  try {
    const billRes = await db.collection('bills').doc(billId).get()
    before = billRes.data || null
  } catch (err) {
    return {
      success: false,
      message: '账单不存在或已被删除',
      error: err.message
    }
  }

  const updateData = {
    amount: Number(billData.amount),
    category: billData.category,
    spender: billData.spender,
    note: billData.note || '',
    createdAt: new Date(billData.createdAt),
    updatedAt: new Date(),
    updatedByOpenid: OPENID,
    updatedByName: operatorName || '未绑定',
    updatedByIcon: operatorIcon || '👤'
  }

  await db.collection('bills').doc(billId).update({
    data: updateData
  })

  try {
    await db.collection('operationLogs').add({
      data: {
        action: 'update',
        billId,
        beforeSnapshot: before,
        afterSnapshot: updateData,
        operatorOpenid: OPENID,
        operatorName: operatorName || '未绑定',
        operatorIcon: operatorIcon || '👤',
        createdAt: new Date()
      }
    })
  } catch (err) {
    console.warn('记录修改日志失败', err)
  }

  return {
    success: true
  }
}
