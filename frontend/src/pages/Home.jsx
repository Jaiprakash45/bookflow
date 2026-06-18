import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

// Home just redirects to events page
const Home = () => {
  const navigate = useNavigate()

  useEffect(() => {
    navigate("/events")
  }, [])

  return null
}

export default Home