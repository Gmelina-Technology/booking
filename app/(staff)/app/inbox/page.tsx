import { BookingsPage } from "../bookings-view";

export const metadata = { title: "Staff — inbox" };

export default function InboxPage({ searchParams }: PageProps<"/app/inbox">) {
  return <BookingsPage searchParams={searchParams} section="inbox" />;
}
