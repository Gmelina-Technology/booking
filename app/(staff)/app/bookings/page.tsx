import { BookingsPage } from "../bookings-view";

export const metadata = { title: "Staff — all bookings" };

export default function AllBookingsPage({ searchParams }: PageProps<"/app/bookings">) {
  return <BookingsPage searchParams={searchParams} section="bookings" />;
}
