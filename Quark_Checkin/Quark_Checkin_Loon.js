/*
 * 夸克网盘每日签到 - Loon
 * Author: Liano
 * Based on the public Quark growth-sign API implementation.
 * Only performs the daily capacity sign-in; no welfare-center or low-carbon tasks.
 */

const args = $argument || {};
const kps = String(args.kps || "").trim();
const sign = String(args.sign || "").trim();
const vcode = String(args.vcode || "").trim();

const TITLE = "夸克网盘每日签到";
const BASE = "https://drive-m.quark.cn/1/clouddrive/capacity/growth";

function notify(message) {
  $notification.post(TITLE, "", message);
  console.log(`[${TITLE}] ${message}`);
}

function formatBytes(value) {
  let n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) n = 0;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(2)} ${units[i]}`;
}

function buildUrl(path) {
  const query = [
    "pr=ucpro",
    "fr=android",
    `kps=${encodeURIComponent(kps)}`,
    `sign=${encodeURIComponent(sign)}`,
    `vcode=${encodeURIComponent(vcode)}`
  ].join("&");
  return `${BASE}/${path}?${query}`;
}

function parseResponse(error, response, data) {
  if (error) throw new Error(`网络请求失败：${error}`);
  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`HTTP 状态异常：${response ? response.statusCode : "无响应"}`);
  }
  let result;
  try {
    result = typeof data === "string" ? JSON.parse(data) : data;
  } catch (e) {
    throw new Error("接口返回内容不是有效 JSON");
  }
  if (!result || typeof result !== "object") {
    throw new Error("接口返回数据为空");
  }
  return result;
}

function getGrowthInfo(callback) {
  $httpClient.get({
    url: buildUrl("info"),
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      "Accept": "application/json"
    },
    timeout: 30000
  }, (error, response, data) => {
    try {
      callback(null, parseResponse(error, response, data));
    } catch (e) {
      callback(e);
    }
  });
}

function doSign(callback) {
  $httpClient.post({
    url: buildUrl("sign"),
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ sign_cyclic: true }),
    timeout: 30000
  }, (error, response, data) => {
    try {
      callback(null, parseResponse(error, response, data));
    } catch (e) {
      callback(e);
    }
  });
}

function finishError(error) {
  notify(`❌ 签到失败\n${error && error.message ? error.message : String(error)}\n请检查参数是否有效或重新抓取。`);
  $done();
}

if (!kps || !sign || !vcode) {
  notify("请先在 Loon 插件参数中填写 KPS、SIGN、VCODE。");
  $done();
} else {
  getGrowthInfo((error, result) => {
    if (error) return finishError(error);

    const info = result.data;
    if (!info || !info.cap_sign) {
      return finishError(new Error(result.message || "无法读取签到状态，认证参数可能已失效。"));
    }

    const capSign = info.cap_sign;
    if (capSign.sign_daily) {
      const reward = formatBytes(capSign.sign_daily_reward);
      notify(`✅ 今日已经签到\n今日奖励：${reward}\n连续签到：${capSign.sign_progress}/${capSign.sign_target}`);
      return $done();
    }

    doSign((signError, signResult) => {
      if (signError) return finishError(signError);

      if (!signResult.data) {
        return finishError(new Error(signResult.message || "签到接口未返回成功数据。"));
      }

      const reward = formatBytes(signResult.data.sign_daily_reward);
      const progress = Number(capSign.sign_progress || 0) + 1;
      const target = Number(capSign.sign_target || 0);
      notify(`🎉 签到成功\n获得空间：${reward}\n连续签到：${progress}/${target}`);
      $done();
    });
  });
}
