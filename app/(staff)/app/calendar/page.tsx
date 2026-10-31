import { BookingsPage } from "../bookings-view";

export const metadata = { title: "Staff — calendar" };

export default function CalendarPage({ searchParams }: PageProps<"/app/calendar">) {
  return <BookingsPage searchParams={searchParams} section="calendar" />;
}
