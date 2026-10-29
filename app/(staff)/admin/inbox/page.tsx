import { BookingsPage } from "../bookings-view";

export const metadata = { title: "Staff — inbox" };

export default function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  return <BookingsPage searchParams={searchParams} section="inbox" />;
}
