// SeatMap renders a grid of seats
// each seat colored by its status
// clicking an available seat triggers onSeatSelect

const STATUS_STYLES = {
  available: "bg-green-100 border-green-400 text-green-800 hover:bg-green-200 cursor-pointer",
  reserved:  "bg-yellow-100 border-yellow-400 text-yellow-800 cursor-not-allowed",
  booked:    "bg-red-100 border-red-400 text-red-800 cursor-not-allowed",
}

const STATUS_LABELS = {
  available: "Available",
  reserved:  "Reserved",
  booked:    "Booked",
}

const SeatMap = ({ seats, selectedSeat, onSeatSelect }) => {

  // group seats by category — VIP together, General together
  const grouped = seats.reduce((acc, seat) => {
    if (!acc[seat.category]) {
      acc[seat.category] = []
    }
    acc[seat.category].push(seat)
    return acc
  }, {})

  const handleSeatClick = (seat) => {
    // only allow clicking available seats
    if (seat.status !== "available") return
    onSeatSelect(seat)
  }

  return (
    <div className="space-y-6">

      {/* legend */}
      <div className="flex gap-4 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 border border-green-400"/>
          <span className="text-slate-600">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-400"/>
          <span className="text-slate-600">Reserved</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 border border-red-400"/>
          <span className="text-slate-600">Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-200 border border-blue-500"/>
          <span className="text-slate-600">Selected</span>
        </div>
      </div>

      {/* stage indicator */}
      <div className="w-full bg-slate-200 text-slate-600 text-center py-2 rounded-lg text-sm font-medium">
        ── STAGE ──
      </div>

      {/* seat grid grouped by category */}
      {Object.entries(grouped).map(([category, categorySeats]) => (
        <div key={category}>

          {/* category header */}
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {category}
          </h3>

          {/* seats grid */}
          <div className="flex flex-wrap gap-2">
            {categorySeats.map((seat) => {
              const isSelected = selectedSeat?.id === seat.id

              return (
                <button
                  key={seat.id}
                  onClick={() => handleSeatClick(seat)}
                  title={`${seat.label} — ${STATUS_LABELS[seat.status]} — ₹${(seat.price_paise / 100).toFixed(0)}`}
                  className={`
                    w-12 h-12 rounded-lg border-2 text-xs font-medium
                    transition-all duration-150
                    ${isSelected
                      ? "bg-blue-200 border-blue-500 text-blue-800 scale-110"
                      : STATUS_STYLES[seat.status]
                    }
                  `}
                >
                  {seat.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SeatMap