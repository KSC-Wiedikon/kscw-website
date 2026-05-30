import { kscwApi } from '../directus'
import { todayISO } from '../utils'

interface DirectusEvent {
  id: number; title: string; event_type: string; start_date: string;
  end_date: string | null; all_day: boolean; location: string | null; description: string | null;
  signup_url: string | null;
}

export interface CalendarEvent {
  id: string; title: string; eventType: string; startDate: string;
  endDate: string | null; allDay: boolean; location: string | null; description: string | null;
  signupUrl: string | null;
}

function mapEvent(e: DirectusEvent): CalendarEvent {
  return {
    id: String(e.id), title: e.title, eventType: e.event_type,
    startDate: e.start_date, endDate: e.end_date, allDay: e.all_day,
    location: e.location, description: e.description,
    signupUrl: e.signup_url,
  }
}

// Club-wide events only — the /kscw/public/events endpoint filters out
// team-/member-scoped events (e.g. a tournament limited to one team) server-side,
// since the public Directus policy can't read the team/member junctions.
export async function getUpcomingEvents(limit = 3): Promise<CalendarEvent[]> {
  const { data } = await kscwApi<{ data: DirectusEvent[] }>(
    `/public/events?from=${encodeURIComponent(todayISO())}&limit=${limit}`,
  )
  return data.map(mapEvent)
}

export async function getAllEvents(): Promise<CalendarEvent[]> {
  const { data } = await kscwApi<{ data: DirectusEvent[] }>('/public/events')
  return data.map(mapEvent)
}
