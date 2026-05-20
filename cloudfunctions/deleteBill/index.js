// 云函数：deleteBill
// 使用云端权限删除账单，避免客户端因 openid 权限差异删不掉旧账单。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { billId, operatorName, operatorIcon } = event

  if (!billId) {
    return {
      success: false,
      message: '缺少账单ID'
    }
  }

  let bill = null
  try {
    const billRes = await db.collection('bills').doc(billId).get()
    bill = billRes.data || null
  } catch (err) {
    return {
      success: false,
      message: '账单不存在或已被删除',
      error: err.message
    }
  }

  await db.collection('bills').doc(billId).remove()

  try {
    await db.collection('operationLogs').add({
      data: {
        action: 'delete',
        billId,
        billSnapshot: bill,
        operatorOpenid: OPENID,
        operatorName: operatorName || '未绑定',
        operatorIcon: operatorIcon || '👤',
        createdAt: new Date()
      }
    })
  } catch (err) {
    console.warn('记录删除日志失败', err)
  }

  return {
    success: true
  }
}
