import { db } from "@/lib/db";

export function GET() {
  return db.query();
}
