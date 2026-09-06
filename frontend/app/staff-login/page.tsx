// Staff login redirect — unified login is at /login
// Doctor mode can be accessed directly at /login?mode=doctor
import { redirect } from "next/navigation";

export default function StaffLoginPage() {
  redirect("/login?mode=doctor");
}