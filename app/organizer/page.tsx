import { redirect } from "next/navigation";

// The organizer is now the Board (Board view)
export default function Page() {
  redirect("/board");
}
