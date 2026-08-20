/**
 * Vercel serverless proxy → Google Apps Script
 *
 * หน้าที่:  ซ่อน URL ของ Apps Script, แนบ SHARED_SECRET, ทำให้หน้าเว็บเรียกแบบ same-origin (ไม่ติด CORS)
 * Environment Variables ที่ต้องตั้งบน Vercel (ติ๊กครบทั้ง 3 environment แล้ว Redeploy หนึ่งครั้ง):
 *   APPS_SCRIPT_URL = https://script.google.com/macros/s/XXXX/exec
 *   SHARED_SECRET   = ต้องตรงกับ Script Properties ใน Apps Script ทุกตัวอักษร
 */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'RDU proxy พร้อมใช้งาน — endpoint นี้รองรับเฉพาะ POST',
      appsScriptConfigured: Boolean(process.env.APPS_SCRIPT_URL),
      secretConfigured: Boolean(process.env.SHARED_SECRET)
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'รองรับเฉพาะ POST' });
  }

  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.SHARED_SECRET;

  if (!url || !secret) {
    return res.status(500).json({
      ok: false,
      error: 'ยังไม่ได้ตั้งค่า Environment Variables บน Vercel (APPS_SCRIPT_URL / SHARED_SECRET) — ตั้งแล้วต้องกด Redeploy หนึ่งครั้ง'
    });
  }
  if (!/\/exec\s*$/.test(url)) {
    return res.status(500).json({
      ok: false,
      error: 'APPS_SCRIPT_URL ต้องลงท้ายด้วย /exec (ไม่ใช่ /dev และไม่มี / ต่อท้าย)'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); }
    catch (e) { return res.status(400).json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }); }
  }
  if (!body || typeof body !== 'object') body = {};

  const payload = JSON.stringify(Object.assign({}, body, { secret }));

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      // Apps Script ไม่ตอบ preflight — ต้องเป็น text/plain เท่านั้น
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      redirect: 'follow'
    });

    const text = await upstream.text();

    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'Apps Script ตอบกลับไม่ใช่ JSON (HTTP ' + upstream.status +
               ') — ตรวจว่า Deploy เป็น Web app, Who has access = Anyone และ Deploy เวอร์ชันใหม่แล้ว',
        snippet: String(text).slice(0, 300)
      });
    }

    return res.status(data && data.ok === false ? 400 : 200).json(data);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: 'เรียก Apps Script ไม่สำเร็จ: ' + (err && err.message ? err.message : String(err))
    });
  }
};
