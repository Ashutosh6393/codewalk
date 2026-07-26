import { db } from "@/lib/db";

export function middleware() {
  return db.query();
}
