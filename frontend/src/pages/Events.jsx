import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import api from "../api/axios"

const Events = () => {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // fetch all events when component mounts
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const response = await api.get("/events")
        setEvents(response.data.data)
      } catch (err) {
        setError("Failed to load events")
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [])

  // format date nicely
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      weekday: "long",
      year:    "numeric",
      month:   "long",
      day:     "numeric",
      hour:    "2-digit",
      minute:  "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-lg">Loading events...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">

        <h1 className="text-3xl font-bold text-slate-800 mb-2">
          Upcoming Events
        </h1>
        <p className="text-slate-500 mb-8">
          Select an event to view seats and book
        </p>

        {events.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            No events available right now
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <div
                key={event.id}
                onClick={() => navigate(`/events/${event.id}`)}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
              >
                {/* event name */}
                <h2 className="text-xl font-semibold text-slate-800 mb-1">
                  {event.name}
                </h2>

                {/* description */}
                {event.description && (
                  <p className="text-slate-500 text-sm mb-3">
                    {event.description}
                  </p>
                )}

                {/* venue */}
                <div className="flex items-center gap-2 text-slate-600 text-sm mb-2">
                  <span>📍</span>
                  <span>{event.venue}</span>
                </div>

                {/* date */}
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <span>🗓️</span>
                  <span>{formatDate(event.starts_at)}</span>
                </div>

                {/* view seats button */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <span className="text-blue-600 text-sm font-medium">
                    View Seats →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Events