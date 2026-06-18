import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import api from "../api/axios"
import SeatMap from "../components/SeatMap"

const EventDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [seats, setSeats] = useState([])
  const [prices, setPrices] = useState({})
  const [selectedSeat, setSelectedSeat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [booking, setBooking] = useState(false)
  const [bookingError, setBookingError] = useState("")

  // fetch event with seats
  const fetchEvent = async () => {
    try {
      const response = await api.get(`/events/${id}`)
      setEvent(response.data.data.event)
      setSeats(response.data.data.seats)
    } catch (err) {
      setError("Failed to load event")
    } finally {
      setLoading(false)
    }
  }

  // fetch dynamic prices for all seats
  const fetchPrices = async () => {
    try {
      const response = await api.get(`/pricing/event/${id}`)
      const allSeats = response.data.data.all_seats

      // convert array to object for easy lookup by seat_id
      const priceMap = {}
      allSeats.forEach((seat) => {
        priceMap[seat.seat_id] = seat.final_price_paise
      })
      setPrices(priceMap)

    } catch (err) {
      // prices failing should not break the page
      console.error("Failed to load prices:", err)
    }
  }

  useEffect(() => {
    fetchEvent()
    fetchPrices()
  }, [id])

  // format date
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

  // called when user clicks a seat
  const handleSeatSelect = (seat) => {
    setSelectedSeat(seat)
    setBookingError("")
  }

  // reserve the selected seat
  const handleReserve = async () => {
    if (!selectedSeat) return

    setBooking(true)
    setBookingError("")

    try {
      const response = await api.post("/bookings/reserve", {
        seat_id: selectedSeat.id,
      })

      const bookingData = response.data.data

      // redirect to checkout page with booking details
      navigate("/checkout", {
        state: {
          booking: bookingData,
          seat:    selectedSeat,
          event:   event,
        },
      })

    } catch (err) {
      setBookingError(
        err.response?.data?.message || "Failed to reserve seat"
      )
    } finally {
      setBooking(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500">Loading event...</p>
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

  // get price for selected seat
  const selectedPrice = selectedSeat
    ? prices[selectedSeat.id] || selectedSeat.price_paise
    : null

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">

        {/* back button */}
        <button
          onClick={() => navigate("/")}
          className="text-slate-500 hover:text-slate-700 mb-6 flex items-center gap-1 text-sm"
        >
          ← Back to Events
        </button>

        {/* event header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">
            {event.name}
          </h1>
          {event.description && (
            <p className="text-slate-500 mb-3">{event.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>📍 {event.venue}</span>
            <span>🗓️ {formatDate(event.starts_at)}</span>
            <span>🎟️ {seats.filter(s => s.status === "available").length} seats available</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* seat map — takes 2/3 of width on large screens */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Select a Seat
            </h2>
            <SeatMap
              seats={seats}
              selectedSeat={selectedSeat}
              onSeatSelect={handleSeatSelect}
            />
          </div>

          {/* booking panel — takes 1/3 of width */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Booking Summary
            </h2>

            {selectedSeat ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Seat</span>
                  <span className="font-medium">{selectedSeat.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Category</span>
                  <span className="font-medium">{selectedSeat.category}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Price</span>
                  <span className="font-semibold text-green-600">
                    ₹{(selectedPrice / 100).toFixed(0)}
                  </span>
                </div>

                <div className="border-t pt-3 text-xs text-slate-400">
                  Price is dynamic — locked in at reservation
                </div>

                {bookingError && (
                  <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded">
                    {bookingError}
                  </div>
                )}

                <button
                  onClick={handleReserve}
                  disabled={booking}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                >
                  {booking ? "Reserving..." : "Reserve Seat"}
                </button>

                <p className="text-xs text-slate-400 text-center">
                  Seat held for 10 minutes after reservation
                </p>
              </div>
            ) : (
              <p className="text-slate-400 text-sm text-center py-8">
                Click a green seat to select it
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default EventDetail