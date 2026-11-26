/**
 * Endpoint cho Vercel Cron (xem vercel.json) – thay cho scheduler setInterval khi chạy serverless.
 * Đặt biến môi trường CRON_SECRET để chỉ Vercel Cron gọi được.
 */
import { syncAll } from "@/lib/sync";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const results = await syncAll("schedule");
  return Response.json({ ok: true, results });
}
