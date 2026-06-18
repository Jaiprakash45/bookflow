import axios from "axios"

// base URL points to your Docker backend
const api = axios.create({
  baseURL: "http://localhost:3000/api/v1",
})

// automatically attach token to every request
// reads from localStorage — set after login
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api