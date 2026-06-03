// Cloudflare Pages Functions
// Path: functions/api/consult.js
//
// 必要な環境変数（Cloudflare Pages > Settings > Environment variables）
// CHATWORK_API_TOKEN : Chatwork APIトークン（Secret推奨）
// CHATWORK_ROOM_ID   : 通知先ルームID
// ALLOWED_ORIGIN     : 任意。例 https://honpro-lp.pages.dev

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

function corsHeaders(origin, env) {
  const allowedOrigin = env.ALLOWED_ORIGIN || origin || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function jsonResponse(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin, env),
  });
}

function pick(data, keys) {
  for (const key of keys) {
    if (data && typeof data[key] === 'string' && data[key].trim()) return data[key].trim();
  }
  return '';
}

function buildChatworkMessage(data) {
  const service = pick(data, ['service', 'serviceName', 'selectedService', 'mTitle']) || 'サービス未指定';
  const staff = pick(data, ['staff', 'staffName', 'person', '担当者名']);
  const company = pick(data, ['company', 'companyName', 'client', '顧客企業']);
  const contact = pick(data, ['contact', 'contactName', 'customerContact', '先方担当者']);
  const email = pick(data, ['email', 'mail']);
  const phone = pick(data, ['phone', 'tel']);
  const employees = pick(data, ['employees', 'employeeCount', '従業員規模']);
  const urgency = pick(data, ['urgency', 'priority', '緊急度']);
  const budget = pick(data, ['budget', '予算感']);
  const timing = pick(data, ['timing', 'desiredTiming', '希望時期']);
  const category = pick(data, ['category', '相談カテゴリ']);
  const issue = pick(data, ['issue', 'problem', 'detail', 'message', '相談内容']);
  const memo = pick(data, ['memo', 'note', '補足']);
  const pageUrl = pick(data, ['pageUrl', 'url']);

  const lines = [
    '[info][title]【社内ポータル】新しい案件相談が届きました[/title]',
    `■ 相談サービス\n${service}`,
    staff ? `■ 相談者\n${staff}` : '',
    company ? `■ 顧客企業\n${company}` : '',
    contact ? `■ 先方担当者\n${contact}` : '',
    email ? `■ メール\n${email}` : '',
    phone ? `■ 電話\n${phone}` : '',
    employees ? `■ 従業員規模\n${employees}` : '',
    category ? `■ カテゴリ\n${category}` : '',
    urgency ? `■ 緊急度\n${urgency}` : '',
    budget ? `■ 予算感\n${budget}` : '',
    timing ? `■ 希望時期\n${timing}` : '',
    issue ? `■ 相談内容\n${issue}` : '',
    memo ? `■ 補足\n${memo}` : '',
    pageUrl ? `■ 送信元ページ\n${pageUrl}` : '',
    '[/info]',
  ].filter(Boolean);

  return lines.join('\n\n');
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, context.env),
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');

  try {
    if (!env.CHATWORK_API_TOKEN || !env.CHATWORK_ROOM_ID) {
      return jsonResponse({
        ok: false,
        error: 'Cloudflare側の環境変数 CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が未設定です。',
      }, 500, origin, env);
    }

    let data;
    try {
      data = await request.json();
    } catch (_) {
      return jsonResponse({ ok: false, error: 'JSON形式で送信してください。' }, 400, origin, env);
    }

    const message = buildChatworkMessage(data);

    const chatworkRes = await fetch(`${CHATWORK_API_BASE}/rooms/${env.CHATWORK_ROOM_ID}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': env.CHATWORK_API_TOKEN,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        body: message,
        self_unread: '0',
      }),
    });

    const responseText = await chatworkRes.text();
    let chatworkBody = null;
    try { chatworkBody = JSON.parse(responseText); } catch (_) { chatworkBody = responseText; }

    if (!chatworkRes.ok) {
      return jsonResponse({
        ok: false,
        error: 'Chatworkへの投稿に失敗しました。APIトークン・ルームID・権限を確認してください。',
        status: chatworkRes.status,
        detail: chatworkBody,
      }, 502, origin, env);
    }

    return jsonResponse({ ok: true, chatwork: chatworkBody }, 200, origin, env);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'サーバー側で予期しないエラーが発生しました。',
      detail: String(error && error.message ? error.message : error),
    }, 500, origin, env);
  }
}
