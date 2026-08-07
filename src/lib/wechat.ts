/**
 * 微信小程序登录工具
 * 通过 wx.login 的 code 换取 openid（code2Session）
 */
const WX_API = "https://api.weixin.qq.com/sns/jscode2session";

export interface WeChatSession {
  openid: string;
  sessionKey: string;
  unionid?: string;
}

/**
 * 用 code 换取 openid
 * @param code wx.login 获取的临时登录凭证
 */
export async function code2Session(code: string): Promise<WeChatSession> {
  const appid = process.env.WECHAT_APPID;
  const secret = process.env.WECHAT_SECRET;
  if (!appid || !secret) {
    throw new Error("未配置 WECHAT_APPID / WECHAT_SECRET 环境变量");
  }
  const url =
    `${WX_API}?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.errcode) {
    throw new Error(`微信登录失败(${data.errcode}): ${data.errmsg || "未知错误"}`);
  }
  if (!data.openid) {
    throw new Error("微信登录失败: 未获取到 openid");
  }
  return { openid: data.openid as string, sessionKey: data.session_key, unionid: data.unionid };
}

/** 是否已配置微信登录所需环境变量 */
export function isWeChatConfigured(): boolean {
  return Boolean(process.env.WECHAT_APPID && process.env.WECHAT_SECRET);
}
