/** Chạy sync 1 lần từ CLI (vd. dùng với cron hệ thống thay cho scheduler trong app). Yêu cầu app đang chạy (mock API). */
import "dotenv/config";
import { syncAll } from "@/lib/sync";
import { prisma } from "@/lib/db";

syncAll("cli")
  .then((r) => console.table(r))
  .finally(() => prisma.$disconnect());
