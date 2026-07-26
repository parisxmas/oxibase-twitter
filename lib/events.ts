// Cross-component signals that are not state anyone owns.
//
// The notifications page marks everything read as soon as it is seen; the rail
// carries the badge. Rather than lifting the count into a context for one
// number, the page says so and the rail listens — the subscription still keeps
// the count truthful afterwards.
export const NOTIFICATIONS_READ = "chirp:notifications-read";
