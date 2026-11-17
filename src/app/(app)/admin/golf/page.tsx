import { redirect } from "next/navigation";

export default function AdminGolfPage() {
  redirect("/admin/pistas?deporte=golf");
}
