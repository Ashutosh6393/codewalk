import { db } from "@/lib/db";

export function getSession() {
  return db.query();
}
